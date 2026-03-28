
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, AIAnalysis, WeeklyMealPlan, Recipe, FitnessGoal, ActivityLevel, NutritionPreferences, WorkoutProgram, ExistingWorkout, WorkoutLog, HealthData, Language, DailyMealPlan, WorkoutPreferences, HealthInsight, ProgressInsight, DEFAULT_HEALTH_SOURCE_PREFERENCES, CorrelationInsight } from './types';
import Dashboard from './components/Dashboard';
import NutritionTab from './components/NutritionTab';
import WorkoutTab from './components/WorkoutTab';
import HealthTab from './components/HealthTab';
import SettingsTab from './components/SettingsTab';
import UserProfileForm from './components/UserProfileForm';
import AuthPortal from './components/AuthPortal';
import AdminPanel from './components/AdminPanel';
import { analyzeHealthData, generateMealPlan, generateWorkoutPlan, analyzeOverallProgress, analyzeHealthTrends, importManualWorkoutHistory, setMockMode, analyzeCorrelations, analyzeTrainingRecovery } from './services/geminiService';
import { initGoogleFitAuth, requestGoogleFitAccess, fetchGoogleFitData, revokeGoogleFitAccess } from './services/googleFitService';
import { loginHealthBridge, fetchHealthBridgeData } from './services/healthBridgeService';
import { generateMockHealthData, generateMockWeightHistory } from './services/mockHealthData';
import { mergeHealthDataByPreference, cleanupHealthData, reapplySourcePreferences } from './services/healthDataMerge';
import { apiFetch } from './services/apiFetch';
import { computeRecoveryEntries, computeRecoverySummary, TrainingRecoverySummary } from './services/recoveryService';
import { registerServiceWorker } from './services/pushNotificationService';

type TabType = 'overview' | 'health' | 'nutrition' | 'workout' | 'settings' | 'admin';
type AuthView = 'login' | 'register';
type SettingsModalMode = 'profile' | 'technical' | null;

/** Consistent DB key: always use email when available, fallback to name */
const getDbKey = (p: { email?: string; name: string }) => p.email || p.name;


const TRANSLATIONS = {
  de: {
    heroTitle: 'HelioFit ',
    heroSpan: 'AI',
    logout: 'Abmelden',
    profile: 'Profil',
    technicalSettings: 'Technische Einstellungen',
    close: 'Schließen',
    analyzing: 'Helio-Engine analysiert Daten...',
    errorQuota: 'API-Limit erreicht. Bitte versuchen Sie es in wenigen Minuten erneut.',
    errorGeneral: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.',
    errorAuth: 'Google-Anmeldung fehlgeschlagen. Bitte prüfe deine Testbenutzer-Einstellungen.',
    errorSync: 'Synchronisierung fehlgeschlagen oder keine Daten vorhanden.',
    tagline: 'Personalized Performance.',
    createdBy: 'by Soeren Zieger'
  },
  en: {
    heroTitle: 'HelioFit ',
    heroSpan: 'AI',
    logout: 'Logout',
    profile: 'Profile',
    technicalSettings: 'Technical Settings',
    close: 'Close',
    analyzing: 'Helio-Engine analyzing data...',
    errorQuota: 'API limit reached. Please try again in a few minutes.',
    errorGeneral: 'An error occurred. Please try again.',
    errorAuth: 'Google authentication failed. Please check your settings.',
    errorSync: 'Sync failed or no data found.',
    tagline: 'Personalized Performance.',
    createdBy: 'by Soeren Zieger'
  }
};

const MOCK_DB: Record<string, any> = {};

const SplashScreen: React.FC<{ language: Language; onFinished: () => void }> = ({ language, onFinished }) => {
  const [isExiting, setIsExiting] = useState(false);
  const t = TRANSLATIONS[language];
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(onFinished, 800);
    }, 2500);
    return () => clearTimeout(timer);
  }, [onFinished]);
  return (
    <div className={`fixed inset-0 z-[999] bg-[#0f172a] flex flex-col items-center justify-center transition-opacity duration-1000 ${isExiting ? 'animate-splash-exit' : ''}`}>
      <div className="flex flex-col items-center space-y-6">
        <div className="w-24 h-24 bg-indigo-600 rounded-[2rem] flex items-center justify-center text-white text-5xl font-black italic shadow-2xl animate-splash">H</div>
        <div className="text-center px-6">
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tighter uppercase animate-fade-in-up" style={{ animationDelay: '0.4s' }}>{t.heroTitle}<span className="text-orange-600 italic">{t.heroSpan}</span></h1>
          <p className="text-slate-400 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] mt-3 animate-fade-in-up" style={{ animationDelay: '0.8s' }}>{t.tagline}</p>
        </div>
      </div>
      <div className="mt-12 animate-fade-in-up" style={{ animationDelay: '1.2s' }}><p className="text-[9px] font-medium tracking-[0.15em] text-slate-500">{t.createdBy}</p></div>
    </div>
  );
};

const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [isSuperLoggedIn, setIsSuperLoggedIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isApprovalPending, setIsApprovalPending] = useState(false);
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('heliofit_lang') as Language) || 'de');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [progressAnalysis, setProgressAnalysis] = useState<ProgressInsight[] | null>(null);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyMealPlan | null>(null);
  const [workoutPlan, setWorkoutPlan] = useState<WorkoutProgram | null>(null);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [healthInsights, setHealthInsights] = useState<HealthInsight[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isGeneratingWorkout, setIsGeneratingWorkout] = useState(false);
  const [isSyncingHealth, setIsSyncingHealth] = useState(false);
  const [isSyncingHealthBridge, setIsSyncingHealthBridge] = useState(false);
  const [isPushSyncingScale, setIsPushSyncingScale] = useState(false);
  const [isPushSyncingZepp, setIsPushSyncingZepp] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => sessionStorage.getItem('google_fit_token'));
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [authView, setAuthView] = useState<AuthView>('login');
  const [db, setDb] = useState<Record<string, any>>({});
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [settingsModalMode, setSettingsModalMode] = useState<SettingsModalMode>(null);
  const [recoverySummary, setRecoverySummary] = useState<TrainingRecoverySummary | null>(null);
  const [recoveryInsight, setRecoveryInsight] = useState<string | null>(null);
  const [correlationInsights, setCorrelationInsights] = useState<CorrelationInsight[] | null>(null);
  const [isAnalyzingRecovery, setIsAnalyzingRecovery] = useState(false);
  const [isAnalyzingCorrelations, setIsAnalyzingCorrelations] = useState(false);

  const t = TRANSLATIONS[language];

  const mergeIncomingHealthData = (
    incoming: HealthData,
    source: 'apple' | 'google' | 'xiaomiScale' | 'healthSync',
    appleFileName?: string,
    profileOverride?: UserProfile | null,
  ) => {
    const activeProfile = profileOverride || profile;
    return mergeHealthDataByPreference(
      healthData,
      incoming,
      source,
      activeProfile?.healthSourcePreferences || DEFAULT_HEALTH_SOURCE_PREFERENCES,
      appleFileName,
    );
  };

  const persistMergedHealthData = (mergedData: HealthData, targetProfile?: UserProfile | null) => {
    const activeProfile = targetProfile || profile;
    if (!activeProfile) return;
    setHealthData(mergedData);
    setDb(prev => ({ ...prev, [activeProfile.name]: { ...prev[activeProfile.name], health: mergedData } }));
  };

  // Restore session from server on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const meRes = await apiFetch('/api/auth/me');
        if (meRes.ok) {
          const { profile: serverProfile, userData } = await meRes.json();
          // Session is valid — restore user state
          const key = serverProfile.email || serverProfile.name;
          const finalDb: Record<string, any> = { [key]: userData };
          setDb(finalDb);
          setProfile(serverProfile);
          if (serverProfile.isAdmin) setActiveTab('admin');
          setWorkoutLogs(userData.workoutLogs || []);
          if (serverProfile.mockMode && !userData.health) {
            const mockHealth = generateMockHealthData();
            setHealthData(mockHealth);
            finalDb[key] = { ...userData, health: mockHealth };
            setDb({ ...finalDb });
          } else {
            const cleaned = userData.health ? cleanupHealthData(userData.health) : null;
            setHealthData(cleaned);
          }
          setAnalysis(userData.analysis || null);
          const pa = Array.isArray(userData.progressAnalysis) ? userData.progressAnalysis : null;
          setProgressAnalysis(pa);
          setWeeklyPlan(userData.weeklyPlan || null);
          setWorkoutPlan(userData.workoutPlan || null);
          setHealthInsights(userData.healthInsights || []);
          if (userData.correlationInsights) setCorrelationInsights(userData.correlationInsights);
          setIsSuperLoggedIn(true);
          localStorage.setItem('heliofit_user_email', key);
        }
      } catch (e) {
        console.error("Session restore failed", e);
      }
      setIsDbLoaded(true);
    };

    restoreSession();
  }, []);

  // Note: Profile restore on refresh is handled by the session restore useEffect above

  // Save DB to server and localStorage
  // Save DB to server — only when logged in (session exists)
  useEffect(() => {
    if (isDbLoaded && isSuperLoggedIn && Object.keys(db).length > 0) {
      localStorage.setItem('heliofit_lang', language);

      const saveToServer = async () => {
        try {
          await apiFetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(db)
          });
        } catch (e) {
          console.error("Failed to save DB to server", e);
        }
      };
      saveToServer();
    }
  }, [db, isDbLoaded, isSuperLoggedIn, language]);

  // Re-apply source preferences live when they change
  const prevSourcePrefsRef = useRef<string>('');
  useEffect(() => {
    if (!healthData?.rawMetrics || !profile?.healthSourcePreferences) return;
    const prefsKey = JSON.stringify(profile.healthSourcePreferences);
    if (prefsKey === prevSourcePrefsRef.current) return;
    prevSourcePrefsRef.current = prefsKey;
    const updated = reapplySourcePreferences(healthData, profile.healthSourcePreferences);
    setHealthData(updated);
    // Also persist the re-derived data
    if (profile) {
      setDb(prev => ({
        ...prev,
        [getDbKey(profile)]: { ...prev[getDbKey(profile)], health: updated }
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.healthSourcePreferences]);

  // Auto-compute recovery data when workout logs or health data change
  useEffect(() => {
    if (workoutLogs.length > 0 && healthData?.metrics?.length) {
      const entries = computeRecoveryEntries(workoutLogs, healthData.metrics);
      const summary = computeRecoverySummary(entries);
      setRecoverySummary(summary);
    }
  }, [workoutLogs, healthData]);

  useEffect(() => {
    const initAuth = () => {
      initGoogleFitAuth(
        (token) => setGoogleAccessToken(token),
        (err) => {
          if (isSyncingHealth) {
            alert(err.message || t.errorAuth);
            setIsSyncingHealth(false);
          }
        }
      );
    };
    if ((window as any).google) initAuth();
    else {
      const interval = setInterval(() => { if ((window as any).google) { initAuth(); clearInterval(interval); } }, 500);
      return () => clearInterval(interval);
    }
  }, [isSyncingHealth]);

  useEffect(() => {
    const sync = async () => {
      if (isSyncingHealth && googleAccessToken && profile) {
        try {
          const data = await fetchGoogleFitData(googleAccessToken);
          const mergedData = mergeIncomingHealthData(data, 'google');
          persistMergedHealthData(mergedData);
        } catch (e: any) {
          console.error("Sync Error:", e);
          alert(e.message || t.errorSync);
        } finally {
          setIsSyncingHealth(false);
        }
      }
    };
    sync();
  }, [googleAccessToken, isSyncingHealth, profile, t.errorSync]);

  const handleResetGoogle = () => {
    const token = sessionStorage.getItem('google_fit_token');
    const clearAndReload = () => {
      sessionStorage.removeItem('google_fit_token');
      setGoogleAccessToken(null);
      if (profile) {
        setHealthData(null);
        const updatedDb = {
          ...db,
          [profile.name]: {
            ...db[profile.name],
            health: null
          }
        };
        setDb(updatedDb);
        localStorage.setItem('heliofit_manual_db_v1', JSON.stringify(updatedDb));
      }
      window.location.reload();
    };

    if (token) {
      revokeGoogleFitAccess(token, clearAndReload);
    } else {
      clearAndReload();
    }
  };

  const handleSyncHealth = async () => {
    if (!profile) return;
    if (profile.mockMode) return;
    if (!googleAccessToken) {
      setIsSyncingHealth(true); 
      requestGoogleFitAccess(); 
      return; 
    }
    setIsSyncingHealth(true);
    try {
      const data = await fetchGoogleFitData(googleAccessToken);
      const mergedData = mergeIncomingHealthData(data, 'google');
      persistMergedHealthData(mergedData);
    } catch (e: any) { 
      console.error("Manual Sync Error:", e);
      // Clear token if it's a permission/auth error
      if (e.message?.includes('401') || e.message?.includes('403') || e.message?.includes('verweigert')) {
        setGoogleAccessToken(null);
        sessionStorage.removeItem('google_fit_token');
      }
      alert(e.message || t.errorSync); 
    } finally { 
      setIsSyncingHealth(false); 
    }
  };

  const handleSyncHealthBridge = async (profileOverride?: UserProfile) => {
    const currentProfile = profileOverride || profile;
    if (!currentProfile || !currentProfile.healthBridgeConfig) return;
    if (currentProfile.mockMode) return;
    
    setIsSyncingHealthBridge(true);
    try {
      let token = currentProfile.healthBridgeTokens?.access_token;
      let activeProfile = { ...currentProfile };
      
      if (!token) {
        token = await loginHealthBridge(currentProfile.healthBridgeConfig);
        activeProfile = { 
          ...currentProfile, 
          healthBridgeTokens: { access_token: token, last_sync: new Date().toISOString() } 
        };
        setProfile(activeProfile);
        setDb(prev => ({ ...prev, [activeProfile.name]: { ...prev[activeProfile.name], profile: activeProfile } }));
      }

      const lastSync = activeProfile.healthBridgeTokens?.last_sync;
      console.log('[HealthBridge] lastSync =', lastSync, '| healthBridgeTokens =', JSON.stringify(activeProfile.healthBridgeTokens));
      const data = await fetchHealthBridgeData(activeProfile.healthBridgeConfig!, token, lastSync);
      // Guard: if healthData is null (e.g. after restart), load from DB first to prevent data loss
      let baseHealthData = healthData;
      if (!baseHealthData) {
        const key = getDbKey(activeProfile);
        const dbEntry = db[key];
        if (dbEntry?.health) {
          baseHealthData = dbEntry.health;
        }
      }
      let mergedData = baseHealthData;

      if (data.sourcePayloads?.xiaomiScale && data.sourcePayloads.xiaomiScale.metrics.length > 0) {
        mergedData = mergeHealthDataByPreference(
          mergedData,
          data.sourcePayloads.xiaomiScale,
          'xiaomiScale',
          activeProfile.healthSourcePreferences || DEFAULT_HEALTH_SOURCE_PREFERENCES,
        );
      }

      if (data.sourcePayloads?.healthSync && data.sourcePayloads.healthSync.metrics.length > 0) {
        mergedData = mergeHealthDataByPreference(
          mergedData,
          data.sourcePayloads.healthSync,
          'healthSync',
          activeProfile.healthSourcePreferences || DEFAULT_HEALTH_SOURCE_PREFERENCES,
        );
      }

      if (!mergedData) {
        mergedData = data;
      }

      persistMergedHealthData(mergedData, activeProfile);
      
      const finalProfile = {
        ...activeProfile,
        healthBridgeTokens: { ...activeProfile.healthBridgeTokens!, last_sync: new Date().toISOString() }
      };
      setProfile(finalProfile);
      setDb(prev => ({ ...prev, [activeProfile.name]: { ...prev[activeProfile.name], profile: finalProfile } }));

      const syncMsg = data.metrics.length === 1
        ? (language === 'de' ? '1 Tag aktualisiert' : '1 day updated')
        : (language === 'de' ? `${data.metrics.length} Tage aktualisiert` : `${data.metrics.length} days updated`);
      alert(language === 'de' ? `Sync erfolgreich! ${syncMsg}.` : `Sync successful! ${syncMsg}.`);

    } catch (e: any) {
      console.error("HealthBridge Sync Error:", e);
      const targetProfile = profileOverride || profile;
      if (targetProfile && (e.message?.includes('401') || e.message?.includes('Unauthorized'))) {
        const updatedProfile = { ...targetProfile };
        delete updatedProfile.healthBridgeTokens;
        setProfile(updatedProfile);
        setDb(prev => ({ ...prev, [targetProfile.name]: { ...prev[targetProfile.name], profile: updatedProfile } }));
      }
      alert(e.message || (language === 'de' ? "HealthBridge Sync fehlgeschlagen." : "HealthBridge sync failed."));
    } finally {
      setIsSyncingHealthBridge(false);
    }
  };

  const handleResetHealthBridge = () => {
    if (!profile) return;
    const updatedProfile = { ...profile };
    delete updatedProfile.healthBridgeTokens;
    setProfile(updatedProfile);
    setDb(prev => ({
      ...prev,
      [getDbKey(profile)]: { ...prev[getDbKey(profile)], profile: updatedProfile }
    }));
  };

  const handleUpdateHealthBridgeConfig = async (baseUrl: string, username?: string, password?: string, apiKey?: string) => {
    if (!profile) return;
    const updatedProfile = { ...profile, healthBridgeConfig: { baseUrl, username, password, apiKey } };
    delete updatedProfile.healthBridgeTokens; // Clear old tokens to force refresh with new config
    setProfile(updatedProfile);
    setDb(prev => ({
      ...prev,
      [getDbKey(profile)]: { ...prev[getDbKey(profile)], profile: updatedProfile }
    }));
    
    // Trigger initial sync automatically
    handleSyncHealthBridge(updatedProfile);
  };

  const handlePushSync = async (appType: 'scale_bridge' | 'zepp_bridge', mode?: 'history') => {
    if (!profile?.healthBridgeConfig) return;
    const syncToken = profile.healthBridgeConfig.apiKey;
    const baseUrl = profile.healthBridgeConfig.baseUrl?.replace(/\/+$/, '') || '';
    if (!syncToken || !baseUrl) {
      alert('HealthBridge ist nicht konfiguriert. Bitte zuerst Sync Token und Base URL setzen.');
      return;
    }

    const setLoading = appType === 'scale_bridge' ? setIsPushSyncingScale : setIsPushSyncingZepp;
    const since = appType === 'scale_bridge'
      ? profile.healthBridgeTokens?.scale_last_sync
      : profile.healthBridgeTokens?.health_sync_last_sync;
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
        const msg = result.status === 'ok_existing'
          ? `${label}: Bestehende Daten gefunden – synchronisiere...`
          : `${label}: Neue Daten empfangen (${result.waited_seconds}s) – synchronisiere...`;
        await handleSyncHealthBridge();
        const syncedAt = new Date().toISOString();
        const syncField = appType === 'scale_bridge' ? 'scale_last_sync' : 'health_sync_last_sync';
        setProfile(prev => {
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
        setDb(prev => {
          const existingUser = prev[profile.name];
          if (!existingUser) return prev;
          return {
            ...prev,
            [profile.name]: {
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
        alert(language === 'de' ? `${label}: Timeout – keine neuen Daten innerhalb von ${result.waited_seconds}s` : `${label}: Timeout – no new data within ${result.waited_seconds}s`);
      }
    } catch (e: any) {
      console.error(`Push-sync [${appType}] error:`, e);
      alert(e.message || (language === 'de' ? 'Push-Sync fehlgeschlagen' : 'Push sync failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (newProfile: UserProfile) => {
    const p: UserProfile = {
      ...newProfile,
      weightHistory: [{ date: new Date().toISOString(), weight: newProfile.weight }],
      nutritionPreferences: {
        preferredIngredients: [],
        excludedIngredients: [],
        appliances: ['stove', 'oven'],
        days: ['Montag', 'Mittwoch', 'Freitag'],
        planVariety: 'DAILY_VARIETY' as const
      },
      workoutPreferences: { availableDays: ['Montag', 'Mittwoch', 'Freitag'], existingWorkouts: [] },
      workoutHistory: [],
      calorieAdjustment: 0,
      healthSourcePreferences: DEFAULT_HEALTH_SOURCE_PREFERENCES,
    };
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: p }),
      });
      if (res.status === 409) {
        alert(language === 'de' ? 'Benutzer existiert bereits' : 'User already exists');
        return;
      }
      if (!res.ok) {
        alert(language === 'de' ? 'Registrierung fehlgeschlagen' : 'Registration failed');
        return;
      }
      // Registration successful — show pending approval
      setAuthView('login');
    } catch (e) {
      console.error("Register error:", e);
      alert(language === 'de' ? 'Verbindungsfehler' : 'Connection error');
    }
  };

  const handleUpdateHealthInsights = (insights: HealthInsight[]) => {
    if (!profile) return;
    setHealthInsights(insights);
    setDb(prev => ({ ...prev, [getDbKey(profile)]: { ...prev[getDbKey(profile)], healthInsights: insights } }));
  };

  const handleAnalyzeRecovery = async () => {
    if (!profile || !recoverySummary?.entries.length) return;
    setIsAnalyzingRecovery(true);
    try {
      const insight = await analyzeTrainingRecovery(
        recoverySummary.entries.map(e => ({
          workoutDate: e.workoutDate,
          workoutTitle: e.workoutTitle,
          trainingLoad: e.trainingLoad,
          recoveryScore: e.recoveryScore,
          recoveryStatus: e.recoveryStatus,
          nextDayHRV: e.nextDayHRV,
          baselineHRV: e.baselineHRV,
          nextDaySleepHours: e.nextDaySleepHours,
        })),
        recoverySummary.avgRecoveryScore,
        recoverySummary.avgTrainingLoad,
        recoverySummary.trend,
        profile,
        language
      );
      setRecoveryInsight(insight);
    } catch (e) {
      console.error('Recovery analysis failed:', e);
    } finally {
      setIsAnalyzingRecovery(false);
    }
  };

  const handleAnalyzeCorrelations = async () => {
    if (!profile || !healthData) return;
    setIsAnalyzingCorrelations(true);
    try {
      const insights = await analyzeCorrelations(healthData, workoutLogs, profile, language);
      setCorrelationInsights(insights);
      // Persist to DB
      const key = getDbKey(profile);
      setDb(prev => ({ ...prev, [key]: { ...prev[key], correlationInsights: insights } }));
    } catch (e) {
      console.error('Correlation analysis failed:', e);
    } finally {
      setIsAnalyzingCorrelations(false);
    }
  };

  const handleGenerateWorkout = async (availableDays: string[], existing: ExistingWorkout[], sessionDurationMin?: number, modificationRequest?: string) => {
    if (!profile) return;
    setIsGeneratingWorkout(true);
    try {
      // For modifications: identify completed sessions so they stay untouched
      const completedTitles = modificationRequest && workoutPlan
        ? workoutPlan.sessions
            .filter(s => workoutLogs.some(l => l.sessionTitle === s.dayTitle))
            .map(s => s.dayTitle)
        : [];

      const plan = await generateWorkoutPlan(
        profile, language, availableDays, existing, workoutLogs, sessionDurationMin,
        modificationRequest,
        modificationRequest ? workoutPlan : null,
        completedTitles.length > 0 ? completedTitles : undefined
      );

      // For modifications: don't push old plan to history (it's an adjustment, not a new cycle)
      const updatedHistory = profile.workoutHistory ? [...profile.workoutHistory] : [];
      if (!modificationRequest && workoutPlan) updatedHistory.push(workoutPlan);

      const updatedProfile = { ...profile, workoutPreferences: { availableDays, existingWorkouts: existing }, workoutHistory: updatedHistory };
      setWorkoutPlan(plan);
      setProfile(updatedProfile);
      setDb(prev => ({ ...prev, [getDbKey(profile)]: { ...prev[getDbKey(profile)], workoutPlan: plan, profile: updatedProfile } }));
    } catch (e) { alert(t.errorGeneral); } finally { setIsGeneratingWorkout(false); }
  };

  const parsePlannedWeight = (value?: string): number => {
    if (!value) return 0;
    const match = value.replace(',', '.').match(/-?\d+(\.\d+)?/);
    return match ? Number(match[0]) : 0;
  };

  const parsePlannedReps = (value?: string): number => {
    if (!value) return 0;
    const normalized = value.toLowerCase();
    if (normalized.includes('s')) return 0;
    const matches = normalized.match(/\d+/g);
    if (!matches) return 0;
    return Math.max(...matches.map(Number));
  };

  const handleCompleteWorkoutWeek = () => {
    if (!profile || !workoutPlan) return;

    const generatedLogs = workoutPlan.sessions.map((session, index) => ({
      date: new Date(Date.now() - index * 24 * 60 * 60 * 1000).toISOString(),
      sessionTitle: session.dayTitle,
      exercises: session.exercises.map(exercise => ({
        exerciseName: exercise.name,
        sets: Array.from({ length: exercise.sets }, () => ({
          weight: parsePlannedWeight(exercise.suggestedWeight),
          reps: parsePlannedReps(exercise.reps),
          weightText: exercise.suggestedWeight,
          repsText: exercise.reps,
        })),
      })),
    }));

    const archivedPlans = profile.workoutHistory ? [...profile.workoutHistory, workoutPlan] : [workoutPlan];
    const mergedLogs = [...generatedLogs, ...workoutLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const updatedProfile = { ...profile, workoutHistory: archivedPlans };

    setWorkoutLogs(mergedLogs);
    setWorkoutPlan(null);
    setProfile(updatedProfile);
    setDb(prev => ({
      ...prev,
      [profile.name]: {
        ...prev[profile.name],
        workoutLogs: mergedLogs,
        workoutPlan: null,
        profile: updatedProfile,
      }
    }));
  };

  const handleCompleteNutritionWeek = () => {
    if (!profile || !weeklyPlan) return;
    const dbKey = getDbKey(profile);

    // Archive the nutrition plan in history
    const entry = { plan: weeklyPlan, completedAt: new Date().toISOString(), eatenMeals: profile.eatenMeals || {}, additionalFood: profile.additionalFood || {} };
    const nutritionHistory = profile.nutritionHistory ? [...profile.nutritionHistory, entry] : [entry];
    const updatedProfile = { ...profile, nutritionHistory, eatenMeals: {}, additionalFood: {}, replacedMeals: {} };

    setWeeklyPlan(null);
    setProfile(updatedProfile);
    setDb(prev => ({
      ...prev,
      [dbKey]: {
        ...prev[dbKey],
        weeklyPlan: null,
        profile: updatedProfile,
      }
    }));
  };

  const handleImportManualWorkoutHistory = async (historyText: string) => {
    if (!profile) return;
    const importedLogs = await importManualWorkoutHistory(profile, historyText, language);
    if (importedLogs.length === 0) {
      throw new Error(language === 'de' ? 'Keine Trainingseinheiten im Text erkannt.' : 'No workout sessions could be extracted from the text.');
    }
    const mergedLogs = [...importedLogs, ...workoutLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const updatedProfile = {
      ...profile,
      manualWorkoutHistoryText: undefined,
      manualWorkoutHistoryInterpretation: undefined,
    };
    setProfile(updatedProfile);
    setWorkoutLogs(mergedLogs);
    setDb(prev => ({ ...prev, [getDbKey(profile)]: { ...prev[getDbKey(profile)], profile: updatedProfile, workoutLogs: mergedLogs } }));
    return importedLogs.length;
  };

  const handleResetMockData = () => {
    if (!profile || !profile.mockMode) return;
    const mockHealth = generateMockHealthData();
    const mockWeightHistory = generateMockWeightHistory();
    const updatedProfile = {
      ...profile,
      weightHistory: mockWeightHistory,
    };
    setProfile(updatedProfile);
    setHealthData(mockHealth);
    setDb(prev => ({
      ...prev,
      [profile.name]: {
        ...prev[profile.name],
        profile: updatedProfile,
        health: mockHealth,
      }
    }));
  };

  const handleResetAllData = () => {
    if (!profile) return;

    sessionStorage.removeItem('google_fit_token');
    setGoogleAccessToken(null);

    const resetProfile: UserProfile = {
      ...profile,
      weightHistory: [{ date: new Date().toISOString(), weight: profile.weight }],
      nutritionPreferences: {
        preferredIngredients: [],
        excludedIngredients: [],
        appliances: ['stove', 'oven'],
        days: ['Montag', 'Mittwoch', 'Freitag'],
        planVariety: 'DAILY_VARIETY',
      },
      workoutPreferences: {
        availableDays: ['Montag', 'Mittwoch', 'Freitag'],
        existingWorkouts: [],
      },
      workoutHistory: [],
      manualWorkoutHistoryText: undefined,
      manualWorkoutHistoryInterpretation: undefined,
      likedRecipes: [],
      calorieAdjustment: 0,
    };

    const resetHealth = profile.mockMode ? generateMockHealthData() : null;
    if (profile.mockMode) {
      resetProfile.weightHistory = generateMockWeightHistory();
    }

    setProfile(resetProfile);
    setHealthData(resetHealth);
    setWorkoutLogs([]);
    setWeeklyPlan(null);
    setWorkoutPlan(null);
    setAnalysis(null);
    setProgressAnalysis(null);
    setHealthInsights([]);
    setActiveTab('overview');

    setDb(prev => ({
      ...prev,
      [profile.name]: {
        ...prev[profile.name],
        profile: resetProfile,
        workoutLogs: [],
        health: resetHealth,
        weeklyPlan: null,
        workoutPlan: null,
        analysis: null,
        progressAnalysis: null,
        healthInsights: [],
      }
    }));

    alert(language === 'de' ? 'Alle Daten wurden zurückgesetzt.' : 'All data has been reset.');
  };

  return (
    <>
      {showSplash && <SplashScreen language={language} onFinished={() => setShowSplash(false)} />}
      {!showSplash && !isSuperLoggedIn && !isRegistering && (
        <AuthPortal
          language={language}
          isApprovalPending={isApprovalPending}
          onLogin={async (user) => {
            try {
              const res = await apiFetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: user.email, password: user.password, isGoogle: user.isGoogle }),
              });

              if (res.status === 403) {
                const data = await res.json();
                if (data.error === 'pending_approval') {
                  setIsApprovalPending(true);
                  return;
                }
              }

              if (res.status === 401) {
                const data = await res.json();
                alert(language === 'de'
                  ? (data.error === 'User not found' ? 'Benutzer nicht gefunden' : 'Falsches Passwort')
                  : (data.error || 'Invalid credentials'));
                return;
              }

              if (!res.ok) {
                alert(language === 'de' ? 'Login fehlgeschlagen' : 'Login failed');
                return;
              }

              const { profile: serverProfile, userData } = await res.json();
              const key = serverProfile.email || serverProfile.name;

              // Set local state from server response
              setProfile(serverProfile);
              if (serverProfile.isAdmin) setActiveTab('admin');
              setWorkoutLogs(userData.workoutLogs || []);

              if (serverProfile.mockMode && !userData.health) {
                const mockHealth = generateMockHealthData();
                setHealthData(mockHealth);
                setDb({ [key]: { ...userData, health: mockHealth } });
              } else {
                const cleaned = userData.health ? cleanupHealthData(userData.health) : null;
                setHealthData(cleaned);
                setDb({ [key]: userData });
              }

              setAnalysis(userData.analysis || null);
              const pa = Array.isArray(userData.progressAnalysis) ? userData.progressAnalysis : null;
              setProgressAnalysis(pa);
              setWeeklyPlan(userData.weeklyPlan || null);
              setWorkoutPlan(userData.workoutPlan || null);
              setHealthInsights(userData.healthInsights || []);
              if (userData.correlationInsights) setCorrelationInsights(userData.correlationInsights);

              setIsSuperLoggedIn(true);
              localStorage.setItem('heliofit_user_email', key);

              // Register service worker for push notifications
              registerServiceWorker();
            } catch (e) {
              console.error("Login error:", e);
              alert(language === 'de' ? 'Verbindungsfehler' : 'Connection error');
            }
          }}
          onRegister={() => {
            setIsRegistering(true);
          }}
        />
      )}

      {!showSplash && !isSuperLoggedIn && isRegistering && (
        <div className="fixed inset-0 z-[1000] bg-[#0f172a] overflow-y-auto">
          <UserProfileForm
            onSubmit={async (p) => {
              const newProfile = { ...p, isApproved: false };
              await handleRegister(newProfile);
              setIsRegistering(false);
              setIsApprovalPending(true);
            }}
            onCancel={() => setIsRegistering(false)}
            language={language}
          />
        </div>
      )}
      <div className={`min-h-screen pb-24 sm:pb-10 px-0 transition-opacity duration-700 ${(!showSplash && isSuperLoggedIn) ? 'opacity-100' : 'opacity-0'} flex flex-col bg-[#0f172a]`} style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top, 0px))' }}>
        <header className="fixed top-0 left-0 right-0 z-50 bg-[#0f172a]/90 backdrop-blur-xl border-b border-white/5 safe-top">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setActiveTab('overview')}>
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black italic shadow-lg text-sm">H</div>
                <span className="hidden sm:inline font-black text-lg tracking-tighter text-white uppercase">{t.heroTitle}<span className="text-orange-600 italic">{t.heroSpan}</span></span>
              </div>
              {profile && !profile.isAdmin && (
                <button
                  onClick={() => setSettingsModalMode('profile')}
                  className="hidden sm:flex items-center gap-3 px-3 py-2 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all"
                >
                  <div className="w-10 h-10 rounded-2xl overflow-hidden bg-slate-800 border border-white/10 flex items-center justify-center text-indigo-300 font-black">
                    {profile.profilePicture ? (
                      <img src={profile.profilePicture} alt={profile.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{profile.name?.[0]?.toUpperCase() || 'U'}</span>
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{t.profile}</p>
                    <p className="text-sm font-black text-white leading-none">{profile.name}</p>
                  </div>
                </button>
              )}
            </div>
            {/* Desktop nav — hidden on mobile */}
            <nav className="hidden sm:flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              {!profile?.isAdmin && ['overview', 'health', 'nutrition', 'workout'].map((tab: any) => (
                <button
                   key={tab}
                   onClick={() => setActiveTab(tab as TabType)}
                   className={`shrink-0 px-3.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                 >
                   {tab}
                 </button>
              ))}
              {profile?.isAdmin && (
                <button
                  onClick={() => setActiveTab('admin')}
                  className={`shrink-0 px-3.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'admin' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'text-orange-500/60 hover:text-orange-500 hover:bg-white/5'}`}
                >
                  {language === 'de' ? 'Benutzerverwaltung' : 'User Management'}
                </button>
              )}
            </nav>
            <div className="flex items-center gap-1.5 sm:gap-2">
              {!profile?.isAdmin && (
                <button
                  onClick={() => setSettingsModalMode('technical')}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 flex items-center justify-center transition-all"
                  title={t.technicalSettings}
                >
                  <i className="fas fa-gear text-sm"></i>
                </button>
              )}
              <button
                onClick={async () => {
                  try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch {}
                  localStorage.removeItem('heliofit_user_email');
                  setIsSuperLoggedIn(false);
                  setProfile(null);
                  setDb({});
                  setHealthData(null);
                  setWorkoutLogs([]);
                  setAnalysis(null);
                  setProgressAnalysis(null);
                  setWeeklyPlan(null);
                  setWorkoutPlan(null);
                  setHealthInsights([]);
                }}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-red-400 hover:bg-red-400/10 transition-all font-sans"
              >
                <i className="fas fa-right-from-bracket"></i> <span className="hidden sm:inline">{t.logout}</span>
              </button>
              <button onClick={() => setLanguage(language === 'de' ? 'en' : 'de')} className="w-8 h-8 flex items-center justify-center text-[9px] font-black uppercase text-slate-400 bg-white/5 rounded-lg border border-white/10 shrink-0">{language}</button>
            </div>
          </div>
        </header>
        {/* Mobile bottom tab bar */}
        {profile && (
          <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0f172a]/95 backdrop-blur-xl border-t border-white/5 safe-bottom">
            <div className="flex items-center justify-around px-2 h-16">
              {!profile.isAdmin ? (
                [
                  { tab: 'overview' as TabType, icon: 'fas fa-home', label: 'Home' },
                  { tab: 'health' as TabType, icon: 'fas fa-heart-pulse', label: 'Health' },
                  { tab: 'nutrition' as TabType, icon: 'fas fa-utensils', label: language === 'de' ? 'Essen' : 'Food' },
                  { tab: 'workout' as TabType, icon: 'fas fa-dumbbell', label: 'Workout' },
                ].map(({ tab, icon, label }) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-2xl transition-all min-w-[4rem] ${
                      activeTab === tab
                        ? 'text-indigo-400'
                        : 'text-slate-500'
                    }`}
                  >
                    <i className={`${icon} text-lg`}></i>
                    <span className="text-[9px] font-black uppercase tracking-wider">{label}</span>
                  </button>
                ))
              ) : (
                <button
                  onClick={() => setActiveTab('admin')}
                  className={`flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-2xl transition-all ${
                    activeTab === 'admin' ? 'text-orange-400' : 'text-slate-500'
                  }`}
                >
                  <i className="fas fa-users-gear text-lg"></i>
                  <span className="text-[9px] font-black uppercase tracking-wider">{language === 'de' ? 'Admin' : 'Admin'}</span>
                </button>
              )}
            </div>
          </nav>
        )}
        <main className="max-w-7xl mx-auto flex-grow w-full px-4 sm:px-6 lg:px-8 pt-4">
          {profile ? (
            <div className="space-y-6 animate-fade-in">
              {profile.isAdmin ? (
                <AdminPanel 
                  users={db} 
                  language={language} 
                  onUpdateUser={(email, updates) => {
                    setDb(prev => {
                      const user = prev[email];
                      if (!user) return prev;
                      const updatedProfile = { ...user.profile, ...updates };
                      let updatedUser = { ...user, profile: updatedProfile };

                      // When switching TO mockMode: load mock health data
                      if (updates.mockMode === true && !user.profile.mockMode) {
                        const mockHealth = generateMockHealthData();
                        const mockWeightHistory = generateMockWeightHistory();
                        updatedUser = { ...updatedUser, health: mockHealth };
                        updatedProfile.weightHistory = mockWeightHistory;
                        updatedUser.profile = updatedProfile;
                      }
                      // When switching FROM mockMode: clear mock data
                      if (updates.mockMode === false && user.profile.mockMode) {
                        updatedUser = { ...updatedUser, health: null };
                        updatedProfile.weightHistory = [];
                        updatedUser.profile = updatedProfile;
                      }

                      if (profile && (profile.email === email || profile.name === email)) {
                        setProfile(updatedProfile);
                        if (updates.mockMode === true && !user.profile.mockMode) {
                          setHealthData(updatedUser.health);
                        }
                        if (updates.mockMode === false && user.profile.mockMode) {
                          setHealthData(null);
                        }
                      }
                      return { ...prev, [email]: updatedUser };
                    });
                  }}
                  onRenameUser={(oldEmail, newEmail) => {
                    setDb(prev => {
                      if (!prev[oldEmail] || prev[newEmail]) return prev;
                      const newDb = { ...prev };
                      const data = newDb[oldEmail];
                      delete newDb[oldEmail];
                      newDb[newEmail] = {
                        ...data,
                        profile: { ...data.profile, email: newEmail, name: data.profile.name === oldEmail ? newEmail : data.profile.name }
                      };
                      return newDb;
                    });
                  }}
                  onDeleteUser={(email) => {
                    setDb(prev => {
                      const newDb = { ...prev };
                      delete newDb[email];
                      return newDb;
                    });
                  }}
                />
              ) : (
                <>
                  {activeTab === 'overview' && (
                    <Dashboard 
                      analysis={analysis} 
                      progressAnalysis={progressAnalysis}
                      profile={profile} 
                      healthData={healthData} 
                      language={language} 
                      onRefresh={async () => { 
                        setIsAnalyzing(true); 
                        try { 
                          const r = await analyzeHealthData(profile, healthData, language); 
                          setAnalysis(r); 
                          setDb(prev => ({...prev, [profile.name]: {...prev[profile.name], analysis: r}})); 
                        } catch(e) {} finally { setIsAnalyzing(false); } 
                      }} 
                      onAnalyzeProgress={async () => {
                        setIsAnalyzing(true);
                        try {
                          const r = await analyzeOverallProgress(profile, healthData, workoutLogs, language);
                          setProgressAnalysis(r);
                          setDb(prev => ({...prev, [profile.name]: {...prev[profile.name], progressAnalysis: r}}));
                        } catch(e) {} finally { setIsAnalyzing(false); }
                      }}
                      onUpdateProfile={(up) => { 
                        setProfile(up); 
                        setDb(prev => ({...prev, [getDbKey(up)]: {...prev[getDbKey(up)], profile: up}})); 
                      }} 
                      onResetSync={handleResetGoogle}
                      isAnalyzing={isAnalyzing}
                      workoutPlan={workoutPlan}
                    />
                  )}
                  {activeTab === 'health' && (
                    <HealthTab
                      profile={profile}
                      healthData={healthData}
                      insights={healthInsights}
                      onUpdateInsights={handleUpdateHealthInsights}
                      onResetSync={handleResetGoogle}
                      onUploadData={(d, fileName) => {
                        const mergedData = mergeIncomingHealthData(d, 'apple', fileName);
                        persistMergedHealthData(mergedData);
                      }}
                      isLoading={isSyncingHealth || isSyncingHealthBridge}
                      language={language}
                      correlationInsights={correlationInsights}
                      onAnalyzeCorrelations={handleAnalyzeCorrelations}
                      isAnalyzingCorrelations={isAnalyzingCorrelations}
                    />
                  )}
                  {activeTab === 'settings' && (
                    <SettingsTab
                      profile={profile}
                      healthData={healthData}
                      onSync={handleSyncHealth}
                      onResetSync={handleResetGoogle}
                      onSyncHealthBridge={handleSyncHealthBridge}
                      onResetHealthBridge={handleResetHealthBridge}
                      onUpdateHealthBridgeConfig={handleUpdateHealthBridgeConfig}
                      onPushSync={handlePushSync}
                      isPushSyncingScale={isPushSyncingScale}
                      isPushSyncingZepp={isPushSyncingZepp}
                      onUploadData={(d, fileName) => {
                        const mergedData = mergeIncomingHealthData(d, 'apple', fileName);
                        persistMergedHealthData(mergedData);
                      }}
                      onUpdateProfile={(up) => {
                        setProfile(up);
                        setDb(prev => ({...prev, [getDbKey(up)]: {...prev[getDbKey(up)], profile: up}}));
                      }}
                      onResetMockData={handleResetMockData}
                      onResetAllData={handleResetAllData}
                      isLoading={isSyncingHealth || isSyncingHealthBridge}
                      language={language}
                    />
                  )}
                  {activeTab === 'nutrition' && (
                    <NutritionTab 
                      weeklyPlan={weeklyPlan} 
                      onGeneratePlan={async (pfs, modification) => {
                        setIsGeneratingPlan(true);
                        try {
                          // Always persist the preferences used for generation into the profile
                          const profileWithPrefs = { ...profile, nutritionPreferences: pfs };

                          const pl = await generateMealPlan(profileWithPrefs, analysis?.targets, pfs, language, modification);
                          setWeeklyPlan(pl);

                          // Increment usageCount for recipes used in the plan
                          const dbKey = getDbKey(profile);
                          if (profileWithPrefs.likedRecipes) {
                            const usedRecipeNames = new Set<string>();
                            Object.values(pl).forEach(day => {
                              Object.values(day).forEach(meal => {
                                if (meal && (meal as Recipe).name) {
                                  usedRecipeNames.add((meal as Recipe).name);
                                }
                              });
                            });

                            const updatedLikedRecipes = profileWithPrefs.likedRecipes.map(r => {
                              if (usedRecipeNames.has(r.name)) {
                                return { ...r, usageCount: (r.usageCount || 0) + 1 };
                              }
                              return r;
                            });

                            const updatedProfile = { ...profileWithPrefs, likedRecipes: updatedLikedRecipes, eatenMeals: {}, additionalFood: {}, replacedMeals: {} };
                            setProfile(updatedProfile);
                            setDb(prev => ({
                              ...prev,
                              [dbKey]: {
                                ...prev[dbKey],
                                weeklyPlan: pl,
                                profile: updatedProfile
                              }
                            }));
                          } else {
                            const clearedProfile = { ...profileWithPrefs, eatenMeals: {}, additionalFood: {}, replacedMeals: {} };
                            setProfile(clearedProfile);
                            setDb(prev => ({...prev, [dbKey]: {...prev[dbKey], weeklyPlan: pl, profile: clearedProfile}}));
                          }
                        } catch(e){
                          console.error("Failed to generate plan", e);
                        } finally {
                          setIsGeneratingPlan(false); 
                        } 
                      }} 
                      onUpdateWeeklyPlan={(d, pl) => setWeeklyPlan(prev => ({...prev, [d]: pl}))}
                      onCompleteWeek={handleCompleteNutritionWeek}
                      isLoading={isGeneratingPlan} 
                      language={language} 
                      profile={profile} 
                      targets={analysis?.targets} 
                      onUpdateProfile={(up) => { 
                        setProfile(up); 
                        setDb(prev => ({...prev, [getDbKey(up)]: {...prev[getDbKey(up)], profile: up}})); 
                      }} 
                    />
                  )}
                  <div style={{ display: activeTab === 'workout' ? 'block' : 'none' }}><WorkoutTab workoutProgram={workoutPlan} workoutLogs={workoutLogs} onGenerateWorkout={handleGenerateWorkout} onSaveLog={(log) => { const wl = [log, ...workoutLogs]; setWorkoutLogs(wl); setDb(prev => ({...prev, [getDbKey(profile)]: {...prev[getDbKey(profile)], workoutLogs: wl}})); }} onUpdateProfile={(up) => { setProfile(up); setDb(prev => ({...prev, [getDbKey(up)]: {...prev[getDbKey(up)], profile: up}})); }} onUpdateWorkoutPlan={(plan) => { setWorkoutPlan(plan); setDb(prev => ({...prev, [getDbKey(profile)]: {...prev[getDbKey(profile)], workoutPlan: plan}})); }} onInterpretManualHistory={handleImportManualWorkoutHistory} onCompleteWeek={handleCompleteWorkoutWeek} isLoading={isGeneratingWorkout} language={language} profile={profile} healthData={healthData} recoverySummary={recoverySummary} recoveryInsight={recoveryInsight} onAnalyzeRecovery={handleAnalyzeRecovery} isAnalyzingRecovery={isAnalyzingRecovery} /></div>
                </>
              )}
            </div>
          ) : null}
        </main>
        {profile && settingsModalMode && !profile.isAdmin && (
          <div className="fixed inset-0 z-[200] bg-[#0f172a]/80 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6">
            <div className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-[3rem] border border-white/10 bg-[#10151d] p-4 sm:p-6 shadow-[0_0_100px_rgba(0,0,0,0.45)]">
              <button
                onClick={() => setSettingsModalMode(null)}
                className="sticky top-0 ml-auto mb-4 w-12 h-12 rounded-2xl bg-white/5 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-white/10 flex items-center justify-center transition-all z-10"
              >
                <i className="fas fa-times"></i>
              </button>
              <SettingsTab
                profile={profile}
                healthData={healthData}
                onSync={handleSyncHealth}
                onResetSync={handleResetGoogle}
                onSyncHealthBridge={handleSyncHealthBridge}
                onResetHealthBridge={handleResetHealthBridge}
                onUpdateHealthBridgeConfig={handleUpdateHealthBridgeConfig}
                onPushSync={handlePushSync}
                isPushSyncingScale={isPushSyncingScale}
                isPushSyncingZepp={isPushSyncingZepp}
                onUploadData={(d, fileName) => {
                  const mergedData = mergeIncomingHealthData(d, 'apple', fileName);
                  persistMergedHealthData(mergedData);
                }}
                onUpdateProfile={(up) => {
                  setProfile(up);
                  setDb(prev => ({...prev, [getDbKey(up)]: {...prev[getDbKey(up)], profile: up}}));
                }}
                onResetMockData={handleResetMockData}
                onResetAllData={handleResetAllData}
                isLoading={isSyncingHealth || isSyncingHealthBridge}
                language={language}
                mode={settingsModalMode === 'profile' ? 'profile' : 'technical'}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
};
export default App;
