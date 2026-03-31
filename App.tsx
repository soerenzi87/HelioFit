
import React, { useState, Suspense, lazy } from 'react';
import { UserProfile, AIAnalysis, WeeklyMealPlan, Recipe, WorkoutProgram, WorkoutLog, HealthData, Language, HealthInsight, ProgressInsight, CorrelationInsight, RecoveryBubble } from './types';
import AuthPortal from './components/AuthPortal';

const Dashboard = lazy(() => import('./components/Dashboard'));
const NutritionTab = lazy(() => import('./components/NutritionTab'));
const WorkoutTab = lazy(() => import('./components/WorkoutTab'));
const HealthTab = lazy(() => import('./components/HealthTab'));
const SettingsTab = lazy(() => import('./components/SettingsTab'));
const UserProfileForm = lazy(() => import('./components/UserProfileForm'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));

import { analyzeHealthData, generateMealPlan, analyzeOverallProgress, setMockMode } from './services/geminiService';
import { generateMockHealthData, generateMockWeightHistory } from './services/mockHealthData';
import { apiFetch } from './services/apiFetch';
import { TrainingRecoverySummary } from './services/recoveryService';

import { getDbKey, useDbSave } from './hooks/useDatabase';
import { useSessionRestore, performLogin, performRegister, performLogout, AuthSetters } from './hooks/useAuth';
import { useAppHandlers } from './hooks/useAppHandlers';

type TabType = 'overview' | 'health' | 'nutrition' | 'workout' | 'settings' | 'admin';
type SettingsModalMode = 'profile' | 'technical' | null;

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

const SplashScreen: React.FC<{ language: Language; onFinished: () => void }> = ({ language, onFinished }) => {
  const [isExiting, setIsExiting] = useState(false);
  const t = TRANSLATIONS[language];
  React.useEffect(() => {
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
  const [db, setDb] = useState<Record<string, any>>({});
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [settingsModalMode, setSettingsModalMode] = useState<SettingsModalMode>(null);
  const [recoverySummary, setRecoverySummary] = useState<TrainingRecoverySummary | null>(null);
  const [recoveryInsight, setRecoveryInsight] = useState<RecoveryBubble[] | null>(null);
  const [correlationInsights, setCorrelationInsights] = useState<CorrelationInsight[] | null>(null);
  const [isAnalyzingRecovery, setIsAnalyzingRecovery] = useState(false);
  const [isAnalyzingCorrelations, setIsAnalyzingCorrelations] = useState(false);

  const t = TRANSLATIONS[language];

  // --- Hooks ---
  useDbSave(db, isDbLoaded, isSuperLoggedIn, language);

  const authSetters: AuthSetters = {
    setProfile, setActiveTab: setActiveTab as (tab: string) => void,
    setWorkoutLogs, setHealthData, setDb, setAnalysis, setProgressAnalysis,
    setWeeklyPlan, setWorkoutPlan, setHealthInsights, setCorrelationInsights,
    setRecoveryInsight, setIsSuperLoggedIn, setIsDbLoaded,
  };
  useSessionRestore(authSetters);

  const handlers = useAppHandlers({
    profile, setProfile, db, setDb, healthData, setHealthData,
    workoutLogs, setWorkoutLogs, workoutPlan, setWorkoutPlan,
    weeklyPlan, setWeeklyPlan, healthInsights, setHealthInsights,
    correlationInsights, setCorrelationInsights,
    recoverySummary, setRecoverySummary, recoveryInsight, setRecoveryInsight,
    setAnalysis, setProgressAnalysis, setActiveTab: setActiveTab as (tab: string) => void,
    googleAccessToken, setGoogleAccessToken,
    isSyncingHealth, setIsSyncingHealth, setIsSyncingHealthBridge,
    setIsGeneratingWorkout, setIsAnalyzingRecovery, setIsAnalyzingCorrelations,
    setIsPushSyncingScale, setIsPushSyncingZepp,
    language, t,
  });

  /** Compute targets adjusted by user's calorie slider (based on maintenanceCalories/TDEE) */
  const getAdjustedTargets = () => {
    if (!analysis?.targets) return undefined;
    const adj = profile?.calorieAdjustment || 0;
    if (adj === 0) return analysis.targets;
    const targetCal = analysis.targets.maintenanceCalories + adj;
    const ratio = targetCal / analysis.targets.calories;
    return {
      ...analysis.targets,
      calories: targetCal,
      protein: Math.round(analysis.targets.protein * ratio),
      carbs: Math.round(analysis.targets.carbs * ratio),
      fats: Math.round(analysis.targets.fats * ratio),
    };
  };

  return (
    <>
      {showSplash && <SplashScreen language={language} onFinished={() => setShowSplash(false)} />}
      {!showSplash && !isSuperLoggedIn && !isRegistering && (
        <AuthPortal
          language={language}
          isApprovalPending={isApprovalPending}
          onLogin={async (user) => {
            await performLogin(user, language, { ...authSetters, setIsApprovalPending });
          }}
          onRegister={() => setIsRegistering(true)}
        />
      )}

      {!showSplash && !isSuperLoggedIn && isRegistering && (
        <div className="fixed inset-0 z-[1000] bg-[#0f172a] overflow-y-auto">
          <Suspense fallback={<div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>}>
          <UserProfileForm
            onSubmit={async (p) => {
              const newProfile = { ...p, isApproved: false };
              await performRegister(newProfile, language);
              setIsRegistering(false);
              setIsApprovalPending(true);
            }}
            onCancel={() => setIsRegistering(false)}
            language={language}
          />
          </Suspense>
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
            {/* Desktop nav */}
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
                onClick={() => performLogout(authSetters)}
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
                      activeTab === tab ? 'text-indigo-400' : 'text-slate-500'
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
                <Suspense fallback={<div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>}>
                <AdminPanel
                  users={db}
                  language={language}
                  onUpdateUser={(email, updates) => {
                    setDb(prev => {
                      const user = prev[email];
                      if (!user) return prev;
                      const updatedProfile = { ...user.profile, ...updates };
                      let updatedUser = { ...user, profile: updatedProfile };

                      if (updates.mockMode === true && !user.profile.mockMode) {
                        const mockHealth = generateMockHealthData();
                        const mockWeightHistory = generateMockWeightHistory();
                        updatedUser = { ...updatedUser, health: mockHealth };
                        updatedProfile.weightHistory = mockWeightHistory;
                        updatedUser.profile = updatedProfile;
                      }
                      if (updates.mockMode === false && user.profile.mockMode) {
                        updatedUser = { ...updatedUser, health: null };
                        updatedProfile.weightHistory = [];
                        updatedUser.profile = updatedProfile;
                      }

                      if (profile && (profile.email === email || profile.name === email)) {
                        setProfile(updatedProfile);
                        if (updates.mockMode === true && !user.profile.mockMode) setHealthData(updatedUser.health);
                        if (updates.mockMode === false && user.profile.mockMode) setHealthData(null);
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
                </Suspense>
              ) : (
                <Suspense fallback={<div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>}>
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
                          setDb(prev => ({...prev, [getDbKey(profile)]: {...prev[getDbKey(profile)], analysis: r}}));
                        } catch(e) {} finally { setIsAnalyzing(false); }
                      }}
                      onAnalyzeProgress={async () => {
                        setIsAnalyzing(true);
                        try {
                          const r = await analyzeOverallProgress(profile, healthData, workoutLogs, language);
                          setProgressAnalysis(r);
                          setDb(prev => ({...prev, [getDbKey(profile)]: {...prev[getDbKey(profile)], progressAnalysis: r}}));
                        } catch(e) {} finally { setIsAnalyzing(false); }
                      }}
                      onUpdateProfile={(up) => {
                        setProfile(up);
                        setDb(prev => ({...prev, [getDbKey(up)]: {...prev[getDbKey(up)], profile: up}}));
                      }}
                      onResetSync={handlers.handleResetGoogle}
                      isAnalyzing={isAnalyzing}
                      workoutPlan={workoutPlan}
                    />
                  )}
                  {activeTab === 'health' && (
                    <HealthTab
                      profile={profile}
                      healthData={healthData}
                      insights={healthInsights}
                      onUpdateInsights={handlers.handleUpdateHealthInsights}
                      onResetSync={handlers.handleResetGoogle}
                      onUploadData={(d, fileName) => {
                        const mergedData = handlers.mergeIncomingHealthData(d, 'apple', fileName);
                        handlers.persistMergedHealthData(mergedData);
                      }}
                      isLoading={isSyncingHealth || isSyncingHealthBridge}
                      language={language}
                      correlationInsights={correlationInsights}
                      onAnalyzeCorrelations={handlers.handleAnalyzeCorrelations}
                      isAnalyzingCorrelations={isAnalyzingCorrelations}
                    />
                  )}
                  {activeTab === 'settings' && (
                    <SettingsTab
                      profile={profile}
                      healthData={healthData}
                      onSync={handlers.handleSyncHealth}
                      onResetSync={handlers.handleResetGoogle}
                      onSyncHealthBridge={handlers.handleSyncHealthBridge}
                      onResetHealthBridge={handlers.handleResetHealthBridge}
                      onUpdateHealthBridgeConfig={handlers.handleUpdateHealthBridgeConfig}
                      onPushSync={handlers.handlePushSync}
                      isPushSyncingScale={isPushSyncingScale}
                      isPushSyncingZepp={isPushSyncingZepp}
                      onUploadData={(d, fileName) => {
                        const mergedData = handlers.mergeIncomingHealthData(d, 'apple', fileName);
                        handlers.persistMergedHealthData(mergedData);
                      }}
                      onUpdateProfile={(up) => {
                        setProfile(up);
                        setDb(prev => ({...prev, [getDbKey(up)]: {...prev[getDbKey(up)], profile: up}}));
                      }}
                      onResetMockData={handlers.handleResetMockData}
                      onResetAllData={handlers.handleResetAllData}
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
                          const profileWithPrefs = { ...profile, nutritionPreferences: pfs };
                          const pl = await generateMealPlan(profileWithPrefs, getAdjustedTargets(), pfs, language, modification);
                          setWeeklyPlan(pl);

                          const dbKey = getDbKey(profile);
                          if (profileWithPrefs.likedRecipes) {
                            const usedRecipeNames = new Set<string>();
                            Object.values(pl).forEach(day => {
                              Object.values(day).forEach(meal => {
                                if (meal && (meal as Recipe).name) usedRecipeNames.add((meal as Recipe).name);
                              });
                            });

                            const updatedLikedRecipes = profileWithPrefs.likedRecipes.map(r => {
                              if (usedRecipeNames.has(r.name)) return { ...r, usageCount: (r.usageCount || 0) + 1 };
                              return r;
                            });

                            const updatedProfile = { ...profileWithPrefs, likedRecipes: updatedLikedRecipes, eatenMeals: {}, additionalFood: {}, replacedMeals: {} };
                            setProfile(updatedProfile);
                            setDb(prev => ({ ...prev, [dbKey]: { ...prev[dbKey], weeklyPlan: pl, profile: updatedProfile } }));
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
                      onUpdateWeeklyPlan={(d, pl) => { const updated = {...weeklyPlan, [d]: pl}; setWeeklyPlan(updated); setDb(prev => ({...prev, [getDbKey(profile)]: {...prev[getDbKey(profile)], weeklyPlan: updated}})); }}
                      onCompleteWeek={handlers.handleCompleteNutritionWeek}
                      isLoading={isGeneratingPlan}
                      language={language}
                      profile={profile}
                      targets={getAdjustedTargets()}
                      onUpdateProfile={(up) => {
                        setProfile(up);
                        setDb(prev => ({...prev, [getDbKey(up)]: {...prev[getDbKey(up)], profile: up}}));
                      }}
                    />
                  )}
                  <div style={{ display: activeTab === 'workout' ? 'block' : 'none' }}>
                    <WorkoutTab workoutProgram={workoutPlan} workoutLogs={workoutLogs} onGenerateWorkout={handlers.handleGenerateWorkout} onSaveLog={(log) => { const wl = [log, ...workoutLogs]; setWorkoutLogs(wl); setDb(prev => ({...prev, [getDbKey(profile)]: {...prev[getDbKey(profile)], workoutLogs: wl}})); }} onUpdateProfile={(up) => { setProfile(up); setDb(prev => ({...prev, [getDbKey(up)]: {...prev[getDbKey(up)], profile: up}})); }} onUpdateWorkoutPlan={(plan) => { setWorkoutPlan(plan); setDb(prev => ({...prev, [getDbKey(profile)]: {...prev[getDbKey(profile)], workoutPlan: plan}})); }} onInterpretManualHistory={handlers.handleImportManualWorkoutHistory} onCompleteWeek={handlers.handleCompleteWorkoutWeek} isLoading={isGeneratingWorkout} language={language} profile={profile} healthData={healthData} recoverySummary={recoverySummary} recoveryInsight={recoveryInsight} onAnalyzeRecovery={handlers.handleAnalyzeRecovery} isAnalyzingRecovery={isAnalyzingRecovery} />
                  </div>
                </Suspense>
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
              <Suspense fallback={<div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>}>
                <SettingsTab
                  profile={profile}
                  healthData={healthData}
                  onSync={handlers.handleSyncHealth}
                  onResetSync={handlers.handleResetGoogle}
                  onSyncHealthBridge={handlers.handleSyncHealthBridge}
                  onResetHealthBridge={handlers.handleResetHealthBridge}
                  onUpdateHealthBridgeConfig={handlers.handleUpdateHealthBridgeConfig}
                  onPushSync={handlers.handlePushSync}
                  isPushSyncingScale={isPushSyncingScale}
                  isPushSyncingZepp={isPushSyncingZepp}
                  onUploadData={(d, fileName) => {
                    const mergedData = handlers.mergeIncomingHealthData(d, 'apple', fileName);
                    handlers.persistMergedHealthData(mergedData);
                  }}
                  onUpdateProfile={(up) => {
                    setProfile(up);
                    setDb(prev => ({...prev, [getDbKey(up)]: {...prev[getDbKey(up)], profile: up}}));
                  }}
                  onResetMockData={handlers.handleResetMockData}
                  onResetAllData={handlers.handleResetAllData}
                  isLoading={isSyncingHealth || isSyncingHealthBridge}
                  language={language}
                  mode={settingsModalMode === 'profile' ? 'profile' : 'technical'}
                />
              </Suspense>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
export default App;
