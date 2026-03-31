import React, { useEffect, useRef } from 'react';
import { UserProfile, HealthData, WorkoutLog, WorkoutProgram, ExistingWorkout, WeeklyMealPlan, HealthInsight, CorrelationInsight, RecoveryBubble, Language, DEFAULT_HEALTH_SOURCE_PREFERENCES } from '../types';
import { analyzeHealthData, generateWorkoutPlan, analyzeOverallProgress, analyzeCorrelations, analyzeTrainingRecovery, importManualWorkoutHistory } from '../services/geminiService';
import { initGoogleFitAuth, requestGoogleFitAccess, fetchGoogleFitData, revokeGoogleFitAccess } from '../services/googleFitService';
import { loginHealthBridge, fetchHealthBridgeData } from '../services/healthBridgeService';
import { generateMockHealthData, generateMockWeightHistory } from '../services/mockHealthData';
import { mergeHealthDataByPreference, reapplySourcePreferences } from '../services/healthDataMerge';
import { computeRecoveryEntries, computeRecoverySummary, TrainingRecoverySummary } from '../services/recoveryService';
import { apiFetch } from '../services/apiFetch';
import { getDbKey } from './useDatabase';

interface HandlerDeps {
  profile: UserProfile | null;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  db: Record<string, any>;
  setDb: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  healthData: HealthData | null;
  setHealthData: (d: HealthData | null) => void;
  workoutLogs: WorkoutLog[];
  setWorkoutLogs: (logs: WorkoutLog[]) => void;
  workoutPlan: WorkoutProgram | null;
  setWorkoutPlan: (p: WorkoutProgram | null) => void;
  weeklyPlan: WeeklyMealPlan | null;
  setWeeklyPlan: (p: WeeklyMealPlan | null) => void;
  healthInsights: HealthInsight[];
  setHealthInsights: (i: HealthInsight[]) => void;
  correlationInsights: CorrelationInsight[] | null;
  setCorrelationInsights: (i: CorrelationInsight[] | null) => void;
  recoverySummary: TrainingRecoverySummary | null;
  setRecoverySummary: (s: TrainingRecoverySummary | null) => void;
  recoveryInsight: RecoveryBubble[] | null;
  setRecoveryInsight: (i: RecoveryBubble[] | null) => void;
  setAnalysis: (a: any) => void;
  setProgressAnalysis: (p: any) => void;
  setActiveTab: (tab: string) => void;
  googleAccessToken: string | null;
  setGoogleAccessToken: (t: string | null) => void;
  isSyncingHealth: boolean;
  setIsSyncingHealth: (v: boolean) => void;
  setIsSyncingHealthBridge: (v: boolean) => void;
  setIsGeneratingWorkout: (v: boolean) => void;
  setIsAnalyzingRecovery: (v: boolean) => void;
  setIsAnalyzingCorrelations: (v: boolean) => void;
  setIsPushSyncingScale: (v: boolean) => void;
  setIsPushSyncingZepp: (v: boolean) => void;
  language: Language;
  t: { errorAuth: string; errorSync: string; errorGeneral: string };
}

export function useAppHandlers(d: HandlerDeps) {
  // --- Health data merge helpers ---
  const mergeIncomingHealthData = (
    incoming: HealthData,
    source: 'apple' | 'google' | 'xiaomiScale' | 'healthSync',
    appleFileName?: string,
    profileOverride?: UserProfile | null,
  ) => {
    const activeProfile = profileOverride || d.profile;
    return mergeHealthDataByPreference(
      d.healthData,
      incoming,
      source,
      activeProfile?.healthSourcePreferences || DEFAULT_HEALTH_SOURCE_PREFERENCES,
      appleFileName,
    );
  };

  const persistMergedHealthData = (mergedData: HealthData, targetProfile?: UserProfile | null) => {
    const activeProfile = targetProfile || d.profile;
    if (!activeProfile) return;
    d.setHealthData(mergedData);
    d.setDb(prev => ({ ...prev, [getDbKey(activeProfile)]: { ...prev[getDbKey(activeProfile)], health: mergedData } }));
  };

  // --- Source preferences live re-apply ---
  const prevSourcePrefsRef = useRef<string>('');
  useEffect(() => {
    if (!d.healthData?.rawMetrics || !d.profile?.healthSourcePreferences) return;
    const prefsKey = JSON.stringify(d.profile.healthSourcePreferences);
    if (prefsKey === prevSourcePrefsRef.current) return;
    prevSourcePrefsRef.current = prefsKey;
    const updated = reapplySourcePreferences(d.healthData, d.profile.healthSourcePreferences);
    d.setHealthData(updated);
    if (d.profile) {
      d.setDb(prev => ({
        ...prev,
        [getDbKey(d.profile!)]: { ...prev[getDbKey(d.profile!)], health: updated }
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.profile?.healthSourcePreferences]);

  // --- Auto-compute recovery ---
  useEffect(() => {
    if (d.workoutLogs.length > 0 && d.healthData?.metrics?.length) {
      const entries = computeRecoveryEntries(d.workoutLogs, d.healthData.metrics);
      const summary = computeRecoverySummary(entries);
      d.setRecoverySummary(summary);
    }
  }, [d.workoutLogs, d.healthData]);

  // --- Google Fit auth init ---
  useEffect(() => {
    const initAuth = () => {
      initGoogleFitAuth(
        (token) => d.setGoogleAccessToken(token),
        (err) => {
          if (d.isSyncingHealth) {
            alert(err.message || d.t.errorAuth);
            d.setIsSyncingHealth(false);
          }
        }
      );
    };
    if ((window as any).google) initAuth();
    else {
      const interval = setInterval(() => { if ((window as any).google) { initAuth(); clearInterval(interval); } }, 500);
      return () => clearInterval(interval);
    }
  }, [d.isSyncingHealth]);

  // --- Google Fit sync effect ---
  useEffect(() => {
    const sync = async () => {
      if (d.isSyncingHealth && d.googleAccessToken && d.profile) {
        try {
          const data = await fetchGoogleFitData(d.googleAccessToken);
          const mergedData = mergeIncomingHealthData(data, 'google');
          persistMergedHealthData(mergedData);
        } catch (e: any) {
          console.error("Sync Error:", e);
          alert(e.message || d.t.errorSync);
        } finally {
          d.setIsSyncingHealth(false);
        }
      }
    };
    sync();
  }, [d.googleAccessToken, d.isSyncingHealth, d.profile]);

  // --- Handlers ---

  const handleResetGoogle = () => {
    const token = sessionStorage.getItem('google_fit_token');
    const clearAndReload = () => {
      sessionStorage.removeItem('google_fit_token');
      d.setGoogleAccessToken(null);
      if (d.profile) {
        d.setHealthData(null);
        d.setDb(prev => ({
          ...prev,
          [getDbKey(d.profile!)]: { ...prev[getDbKey(d.profile!)], health: null }
        }));
      }
      window.location.reload();
    };
    if (token) revokeGoogleFitAccess(token, clearAndReload);
    else clearAndReload();
  };

  const handleSyncHealth = async () => {
    if (!d.profile || d.profile.mockMode) return;
    if (!d.googleAccessToken) {
      d.setIsSyncingHealth(true);
      requestGoogleFitAccess();
      return;
    }
    d.setIsSyncingHealth(true);
    try {
      const data = await fetchGoogleFitData(d.googleAccessToken);
      const mergedData = mergeIncomingHealthData(data, 'google');
      persistMergedHealthData(mergedData);
    } catch (e: any) {
      console.error("Manual Sync Error:", e);
      if (e.message?.includes('401') || e.message?.includes('403') || e.message?.includes('verweigert')) {
        d.setGoogleAccessToken(null);
        sessionStorage.removeItem('google_fit_token');
      }
      alert(e.message || d.t.errorSync);
    } finally {
      d.setIsSyncingHealth(false);
    }
  };

  const handleSyncHealthBridge = async (profileOverride?: UserProfile) => {
    const currentProfile = profileOverride || d.profile;
    if (!currentProfile || !currentProfile.healthBridgeConfig) return;
    if (currentProfile.mockMode) return;

    d.setIsSyncingHealthBridge(true);
    try {
      let token = currentProfile.healthBridgeTokens?.access_token;
      let activeProfile = { ...currentProfile };

      if (!token) {
        token = await loginHealthBridge(currentProfile.healthBridgeConfig);
        activeProfile = {
          ...currentProfile,
          healthBridgeTokens: { access_token: token, last_sync: new Date().toISOString() }
        };
        d.setProfile(activeProfile);
        d.setDb(prev => ({ ...prev, [getDbKey(activeProfile)]: { ...prev[getDbKey(activeProfile)], profile: activeProfile } }));
      }

      const lastSync = activeProfile.healthBridgeTokens?.last_sync;
      console.log('[HealthBridge] lastSync =', lastSync, '| healthBridgeTokens =', JSON.stringify(activeProfile.healthBridgeTokens));
      const data = await fetchHealthBridgeData(activeProfile.healthBridgeConfig!, token, lastSync);

      let baseHealthData = d.healthData;
      if (!baseHealthData) {
        const key = getDbKey(activeProfile);
        const dbEntry = d.db[key];
        if (dbEntry?.health) baseHealthData = dbEntry.health;
      }
      let mergedData = baseHealthData;

      if (data.sourcePayloads?.xiaomiScale && data.sourcePayloads.xiaomiScale.metrics.length > 0) {
        mergedData = mergeHealthDataByPreference(
          mergedData, data.sourcePayloads.xiaomiScale, 'xiaomiScale',
          activeProfile.healthSourcePreferences || DEFAULT_HEALTH_SOURCE_PREFERENCES,
        );
      }
      if (data.sourcePayloads?.healthSync && data.sourcePayloads.healthSync.metrics.length > 0) {
        mergedData = mergeHealthDataByPreference(
          mergedData, data.sourcePayloads.healthSync, 'healthSync',
          activeProfile.healthSourcePreferences || DEFAULT_HEALTH_SOURCE_PREFERENCES,
        );
      }
      if (!mergedData) mergedData = data;

      persistMergedHealthData(mergedData, activeProfile);

      const finalProfile = {
        ...activeProfile,
        healthBridgeTokens: { ...activeProfile.healthBridgeTokens!, last_sync: new Date().toISOString() }
      };
      d.setProfile(finalProfile);
      d.setDb(prev => ({ ...prev, [getDbKey(activeProfile)]: { ...prev[getDbKey(activeProfile)], profile: finalProfile } }));

      const syncMsg = data.metrics.length === 1
        ? (d.language === 'de' ? '1 Tag aktualisiert' : '1 day updated')
        : (d.language === 'de' ? `${data.metrics.length} Tage aktualisiert` : `${data.metrics.length} days updated`);
      alert(d.language === 'de' ? `Sync erfolgreich! ${syncMsg}.` : `Sync successful! ${syncMsg}.`);
    } catch (e: any) {
      console.error("HealthBridge Sync Error:", e);
      const targetProfile = profileOverride || d.profile;
      if (targetProfile && (e.message?.includes('401') || e.message?.includes('Unauthorized'))) {
        const updatedProfile = { ...targetProfile };
        delete updatedProfile.healthBridgeTokens;
        d.setProfile(updatedProfile);
        d.setDb(prev => ({ ...prev, [getDbKey(targetProfile)]: { ...prev[getDbKey(targetProfile)], profile: updatedProfile } }));
      }
      alert(e.message || (d.language === 'de' ? "HealthBridge Sync fehlgeschlagen." : "HealthBridge sync failed."));
    } finally {
      d.setIsSyncingHealthBridge(false);
    }
  };

  const handleResetHealthBridge = () => {
    if (!d.profile) return;
    const updatedProfile = { ...d.profile };
    delete updatedProfile.healthBridgeTokens;
    d.setProfile(updatedProfile);
    d.setDb(prev => ({ ...prev, [getDbKey(d.profile!)]: { ...prev[getDbKey(d.profile!)], profile: updatedProfile } }));
  };

  const handleUpdateHealthBridgeConfig = async (baseUrl: string, username?: string, password?: string, apiKey?: string) => {
    if (!d.profile) return;
    const updatedProfile = { ...d.profile, healthBridgeConfig: { baseUrl, username, password, apiKey } };
    delete updatedProfile.healthBridgeTokens;
    d.setProfile(updatedProfile);
    d.setDb(prev => ({ ...prev, [getDbKey(d.profile!)]: { ...prev[getDbKey(d.profile!)], profile: updatedProfile } }));
    handleSyncHealthBridge(updatedProfile);
  };

  const handlePushSync = async (appType: 'scale_bridge' | 'zepp_bridge', mode?: 'history') => {
    if (!d.profile?.healthBridgeConfig) return;
    const syncToken = d.profile.healthBridgeConfig.apiKey;
    const baseUrl = d.profile.healthBridgeConfig.baseUrl?.replace(/\/+$/, '') || '';
    if (!syncToken || !baseUrl) {
      alert('HealthBridge ist nicht konfiguriert. Bitte zuerst Sync Token und Base URL setzen.');
      return;
    }

    const setLoading = appType === 'scale_bridge' ? d.setIsPushSyncingScale : d.setIsPushSyncingZepp;
    const since = appType === 'scale_bridge'
      ? d.profile.healthBridgeTokens?.scale_last_sync
      : d.profile.healthBridgeTokens?.health_sync_last_sync;
    setLoading(true);
    try {
      const url = `${baseUrl}/hb/ingest/${syncToken}/push-sync`;
      const body: Record<string, string> = { app_type: appType };
      if (mode) body.mode = mode;
      if (since) body.since = since;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.detail || `HTTP ${resp.status}`);

      const label = appType === 'scale_bridge' ? 'ScaleBridge' : 'ZeppBridge';
      if (result.status === 'ok' || result.status === 'ok_existing') {
        await handleSyncHealthBridge();
        const syncedAt = new Date().toISOString();
        const syncField = appType === 'scale_bridge' ? 'scale_last_sync' : 'health_sync_last_sync';
        d.setProfile((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            healthBridgeTokens: {
              ...(prev.healthBridgeTokens || { access_token: syncToken }),
              [syncField]: syncedAt,
              last_sync: syncedAt,
            }
          };
        });
        d.setDb(prev => {
          const existingUser = prev[getDbKey(d.profile!)];
          if (!existingUser) return prev;
          return {
            ...prev,
            [getDbKey(d.profile!)]: {
              ...existingUser,
              profile: {
                ...existingUser.profile,
                healthBridgeTokens: {
                  ...(existingUser.profile.healthBridgeTokens || { access_token: syncToken }),
                  [syncField]: syncedAt,
                  last_sync: syncedAt,
                }
              }
            }
          };
        });
      } else {
        alert(d.language === 'de' ? `${label}: Timeout – keine neuen Daten innerhalb von ${result.waited_seconds}s` : `${label}: Timeout – no new data within ${result.waited_seconds}s`);
      }
    } catch (e: any) {
      console.error(`Push-sync [${appType}] error:`, e);
      alert(e.message || (d.language === 'de' ? 'Push-Sync fehlgeschlagen' : 'Push sync failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateHealthInsights = (insights: HealthInsight[]) => {
    if (!d.profile) return;
    d.setHealthInsights(insights);
    d.setDb(prev => ({ ...prev, [getDbKey(d.profile!)]: { ...prev[getDbKey(d.profile!)], healthInsights: insights } }));
  };

  const handleAnalyzeRecovery = async () => {
    if (!d.profile || !d.recoverySummary?.entries.length) return;
    d.setIsAnalyzingRecovery(true);
    try {
      const insight = await analyzeTrainingRecovery(
        d.recoverySummary.entries.map(e => ({
          workoutDate: e.workoutDate,
          workoutTitle: e.workoutTitle,
          trainingLoad: e.trainingLoad,
          recoveryScore: e.recoveryScore,
          recoveryStatus: e.recoveryStatus,
          nextDayHRV: e.nextDayHRV,
          baselineHRV: e.baselineHRV,
          nextDaySleepHours: e.nextDaySleepHours,
        })),
        d.recoverySummary.avgRecoveryScore,
        d.recoverySummary.avgTrainingLoad,
        d.recoverySummary.trend,
        d.profile,
        d.language
      );
      d.setRecoveryInsight(insight);
      d.setDb(prev => ({ ...prev, [getDbKey(d.profile!)]: { ...prev[getDbKey(d.profile!)], recoveryInsight: insight } }));
    } catch (e) {
      console.error('Recovery analysis failed:', e);
    } finally {
      d.setIsAnalyzingRecovery(false);
    }
  };

  const handleAnalyzeCorrelations = async () => {
    if (!d.profile || !d.healthData) return;
    d.setIsAnalyzingCorrelations(true);
    try {
      const insights = await analyzeCorrelations(d.healthData, d.workoutLogs, d.profile, d.language);
      d.setCorrelationInsights(insights);
      d.setDb(prev => ({ ...prev, [getDbKey(d.profile!)]: { ...prev[getDbKey(d.profile!)], correlationInsights: insights } }));
    } catch (e) {
      console.error('Correlation analysis failed:', e);
    } finally {
      d.setIsAnalyzingCorrelations(false);
    }
  };

  const handleGenerateWorkout = async (availableDays: string[], existing: ExistingWorkout[], sessionDurationMin?: number, modificationRequest?: string) => {
    if (!d.profile) return;
    d.setIsGeneratingWorkout(true);
    try {
      const completedTitles = modificationRequest && d.workoutPlan
        ? d.workoutPlan.sessions
            .filter(s => d.workoutLogs.some(l => l.sessionTitle === s.dayTitle))
            .map(s => s.dayTitle)
        : [];

      const plan = await generateWorkoutPlan(
        d.profile, d.language, availableDays, existing, d.workoutLogs, sessionDurationMin,
        modificationRequest,
        modificationRequest ? d.workoutPlan : null,
        completedTitles.length > 0 ? completedTitles : undefined
      );

      const updatedHistory = d.profile.workoutHistory ? [...d.profile.workoutHistory] : [];
      if (!modificationRequest && d.workoutPlan) updatedHistory.push(d.workoutPlan);

      const updatedProfile = { ...d.profile, workoutPreferences: { availableDays, existingWorkouts: existing }, workoutHistory: updatedHistory };
      d.setWorkoutPlan(plan);
      d.setProfile(updatedProfile);
      d.setDb(prev => ({ ...prev, [getDbKey(d.profile!)]: { ...prev[getDbKey(d.profile!)], workoutPlan: plan, profile: updatedProfile } }));
    } catch (e) { alert(d.t.errorGeneral); } finally { d.setIsGeneratingWorkout(false); }
  };

  const handleCompleteWorkoutWeek = () => {
    if (!d.profile || !d.workoutPlan) return;
    const archivedPlans = d.profile.workoutHistory ? [...d.profile.workoutHistory, d.workoutPlan] : [d.workoutPlan];
    const updatedProfile = { ...d.profile, workoutHistory: archivedPlans };
    d.setWorkoutPlan(null);
    d.setProfile(updatedProfile);
    d.setDb(prev => ({
      ...prev,
      [getDbKey(d.profile!)]: { ...prev[getDbKey(d.profile!)], workoutPlan: null, profile: updatedProfile }
    }));
  };

  const handleCompleteNutritionWeek = () => {
    if (!d.profile || !d.weeklyPlan) return;
    const dbKey = getDbKey(d.profile);
    const entry = { plan: d.weeklyPlan, completedAt: new Date().toISOString(), eatenMeals: d.profile.eatenMeals || {}, additionalFood: d.profile.additionalFood || {} };
    const nutritionHistory = d.profile.nutritionHistory ? [...d.profile.nutritionHistory, entry] : [entry];
    const updatedProfile = { ...d.profile, nutritionHistory, eatenMeals: {}, additionalFood: {}, replacedMeals: {} };
    d.setWeeklyPlan(null);
    d.setProfile(updatedProfile);
    d.setDb(prev => ({ ...prev, [dbKey]: { ...prev[dbKey], weeklyPlan: null, profile: updatedProfile } }));
  };

  const handleImportManualWorkoutHistory = async (historyText: string) => {
    if (!d.profile) return;
    const importedLogs = await importManualWorkoutHistory(d.profile, historyText, d.language);
    if (importedLogs.length === 0) {
      throw new Error(d.language === 'de' ? 'Keine Trainingseinheiten im Text erkannt.' : 'No workout sessions could be extracted from the text.');
    }
    const mergedLogs = [...importedLogs, ...d.workoutLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const updatedProfile = { ...d.profile, manualWorkoutHistoryText: undefined, manualWorkoutHistoryInterpretation: undefined };
    d.setProfile(updatedProfile);
    d.setWorkoutLogs(mergedLogs);
    d.setDb(prev => ({ ...prev, [getDbKey(d.profile!)]: { ...prev[getDbKey(d.profile!)], profile: updatedProfile, workoutLogs: mergedLogs } }));
    return importedLogs.length;
  };

  const handleResetMockData = () => {
    if (!d.profile || !d.profile.mockMode) return;
    const mockHealth = generateMockHealthData();
    const mockWeightHistory = generateMockWeightHistory();
    const updatedProfile = { ...d.profile, weightHistory: mockWeightHistory };
    d.setProfile(updatedProfile);
    d.setHealthData(mockHealth);
    d.setDb(prev => ({
      ...prev,
      [getDbKey(d.profile!)]: { ...prev[getDbKey(d.profile!)], profile: updatedProfile, health: mockHealth }
    }));
  };

  const handleResetAllData = () => {
    if (!d.profile) return;
    sessionStorage.removeItem('google_fit_token');
    d.setGoogleAccessToken(null);

    const resetProfile: UserProfile = {
      ...d.profile,
      weightHistory: [{ date: new Date().toISOString(), weight: d.profile.weight }],
      nutritionPreferences: {
        preferredIngredients: [], excludedIngredients: [],
        appliances: ['stove', 'oven'],
        days: ['Montag', 'Mittwoch', 'Freitag'],
        planVariety: 'DAILY_VARIETY',
      },
      workoutPreferences: { availableDays: ['Montag', 'Mittwoch', 'Freitag'], existingWorkouts: [] },
      workoutHistory: [],
      manualWorkoutHistoryText: undefined,
      manualWorkoutHistoryInterpretation: undefined,
      likedRecipes: [],
      calorieAdjustment: 0,
    };

    const resetHealth = d.profile.mockMode ? generateMockHealthData() : null;
    if (d.profile.mockMode) {
      resetProfile.weightHistory = generateMockWeightHistory();
    }

    d.setProfile(resetProfile);
    d.setHealthData(resetHealth);
    d.setWorkoutLogs([]);
    d.setWeeklyPlan(null);
    d.setWorkoutPlan(null);
    d.setAnalysis(null);
    d.setProgressAnalysis(null);
    d.setHealthInsights([]);
    d.setActiveTab('overview');

    apiFetch('/api/db/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: ['workoutLogs', 'workoutPlan', 'weeklyPlan', 'analysis', 'progressAnalysis', 'healthInsights', 'correlationInsights'] })
    }).catch(e => console.error("Reset failed:", e));

    d.setDb(prev => ({
      ...prev,
      [getDbKey(d.profile!)]: {
        ...prev[getDbKey(d.profile!)],
        profile: resetProfile,
        workoutLogs: [],
        health: resetHealth,
        weeklyPlan: null,
        workoutPlan: null,
        analysis: null,
        progressAnalysis: null,
        healthInsights: [],
        correlationInsights: null,
      }
    }));

    alert(d.language === 'de' ? 'Alle Daten wurden zurückgesetzt.' : 'All data has been reset.');
  };

  return {
    mergeIncomingHealthData,
    persistMergedHealthData,
    handleResetGoogle,
    handleSyncHealth,
    handleSyncHealthBridge,
    handleResetHealthBridge,
    handleUpdateHealthBridgeConfig,
    handlePushSync,
    handleUpdateHealthInsights,
    handleAnalyzeRecovery,
    handleAnalyzeCorrelations,
    handleGenerateWorkout,
    handleCompleteWorkoutWeek,
    handleCompleteNutritionWeek,
    handleImportManualWorkoutHistory,
    handleResetMockData,
    handleResetAllData,
  };
}
