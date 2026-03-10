
import React, { useState, useEffect } from 'react';
import { UserProfile, AIAnalysis, WeeklyMealPlan, Recipe, FitnessGoal, ActivityLevel, NutritionPreferences, WorkoutProgram, ExistingWorkout, WorkoutLog, HealthData, Language, DailyMealPlan, WorkoutPreferences, HealthInsight, ProgressInsight } from './types';
import Dashboard from './components/Dashboard';
import NutritionTab from './components/NutritionTab';
import WorkoutTab from './components/WorkoutTab';
import HealthTab from './components/HealthTab';
import SettingsTab from './components/SettingsTab';
import AuthScreen from './components/AuthScreen';
import UserProfileForm from './components/UserProfileForm';
import SuperUserAuth from './components/SuperUserAuth';
import { analyzeHealthData, generateMealPlan, generateWorkoutPlan, analyzeOverallProgress, analyzeHealthTrends, setMockMode } from './services/geminiService';
import { initGoogleFitAuth, requestGoogleFitAccess, fetchGoogleFitData, revokeGoogleFitAccess } from './services/googleFitService';
import { getWithingsAuthUrl, fetchWithingsData } from './services/withingsService';
import { loginHealthBridge, fetchHealthBridgeData } from './services/healthBridgeService';

type TabType = 'overview' | 'health' | 'nutrition' | 'workout' | 'settings';
type AuthView = 'login' | 'register';

const TRANSLATIONS = {
  de: {
    heroTitle: 'HelioFit ',
    heroSpan: 'AI',
    logout: 'Profil verlassen',
    lockSystem: 'System sperren',
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
    logout: 'Exit Profile',
    lockSystem: 'Lock System',
    analyzing: 'Helio-Engine analyzing data...',
    errorQuota: 'API limit reached. Please try again in a few minutes.',
    errorGeneral: 'An error occurred. Please try again.',
    errorAuth: 'Google authentication failed. Please check your settings.',
    errorSync: 'Sync failed or no data found.',
    tagline: 'Personalized Performance.',
    createdBy: 'by Soeren Zieger'
  }
};

const MASTER_PASSWORD = "didwuj-tesvoG-govho8";
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
    <div className={`fixed inset-0 z-[999] bg-white flex flex-col items-center justify-center transition-opacity duration-1000 ${isExiting ? 'animate-splash-exit' : ''}`}>
      <div className="flex flex-col items-center space-y-6">
        <div className="w-24 h-24 bg-slate-900 rounded-[2rem] flex items-center justify-center text-white text-5xl font-black italic shadow-2xl animate-splash">H</div>
        <div className="text-center px-6">
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tighter uppercase animate-fade-in-up" style={{ animationDelay: '0.4s' }}>{t.heroTitle}<span className="text-orange-600 italic">{t.heroSpan}</span></h1>
          <p className="text-slate-400 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] mt-3 animate-fade-in-up" style={{ animationDelay: '0.8s' }}>{t.tagline}</p>
        </div>
      </div>
      <div className="mt-12 animate-fade-in-up" style={{ animationDelay: '1.2s' }}><p className="text-[9px] font-medium tracking-[0.15em] text-slate-300">{t.createdBy}</p></div>
    </div>
  );
};

const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [isSuperLoggedIn, setIsSuperLoggedIn] = useState(() => sessionStorage.getItem('heliofit_super_auth') === 'true');
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
  const [isSyncingWithings, setIsSyncingWithings] = useState(false);
  const [isSyncingHealthBridge, setIsSyncingHealthBridge] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => sessionStorage.getItem('google_fit_token'));
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [authView, setAuthView] = useState<AuthView>('login');
  const [db, setDb] = useState<Record<string, any>>({});
  const [isDbLoaded, setIsDbLoaded] = useState(false);

  const t = TRANSLATIONS[language];

  // Load DB from server or localStorage
  useEffect(() => {
    const loadDb = async () => {
      try {
        const response = await fetch('/api/db');
        if (response.ok) {
          const serverDb = await response.json();
          if (serverDb && Object.keys(serverDb).length > 0) {
            setDb(serverDb);
            setIsDbLoaded(true);
            return;
          }
        }
      } catch (e) {
        console.error("Failed to fetch DB from server", e);
      }

      const saved = localStorage.getItem('heliofit_manual_db_v1');
      if (saved) {
        try {
          setDb(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to parse local DB", e);
        }
      }
      setIsDbLoaded(true);
    };

    loadDb();
  }, []);

  // Save DB to server and localStorage
  useEffect(() => {
    if (isDbLoaded) {
      localStorage.setItem('heliofit_lang', language);
      localStorage.setItem('heliofit_manual_db_v1', JSON.stringify(db));
      
      const saveToServer = async () => {
        try {
          await fetch('/api/db', {
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
  }, [db, isDbLoaded, language]);

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
          setHealthData(data);
          setDb(prev => ({ ...prev, [profile.name]: { ...prev[profile.name], health: data } }));
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

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'WITHINGS_AUTH_SUCCESS' && profile) {
        const tokens = event.data.tokens;
        const updatedProfile = { 
          ...profile, 
          withingsTokens: { 
            ...tokens, 
            last_sync: new Date().toISOString() 
          } 
        };
        setProfile(updatedProfile);
        setDb(prev => {
          const newDb = { ...prev, [profile.name]: updatedProfile };
          localStorage.setItem('heliofit_manual_db_v1', JSON.stringify(newDb));
          return newDb;
        });
        
        // Fetch data immediately
        setIsSyncingWithings(true);
        try {
          const data = await fetchWithingsData(tokens.access_token);
          // Merge with existing health data if any
          const mergedMetrics = [...(healthData?.metrics || [])];
          data.metrics.forEach(newM => {
            const existingIdx = mergedMetrics.findIndex(m => m.date.split('T')[0] === newM.date.split('T')[0]);
            if (existingIdx >= 0) {
              mergedMetrics[existingIdx] = { ...mergedMetrics[existingIdx], ...newM };
            } else {
              mergedMetrics.push(newM);
            }
          });
          const mergedData = { ...healthData, metrics: mergedMetrics.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) };
          setHealthData(mergedData);
          setDb(prev => ({ ...prev, [profile.name]: { ...prev[profile.name], health: mergedData } }));
        } catch (e) {
          console.error("Withings Initial Sync Error:", e);
        } finally {
          setIsSyncingWithings(false);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [profile, healthData, db]);

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
    if (!googleAccessToken) { 
      setIsSyncingHealth(true); 
      requestGoogleFitAccess(); 
      return; 
    }
    setIsSyncingHealth(true);
    try {
      const data = await fetchGoogleFitData(googleAccessToken);
      setHealthData(data);
      setDb(prev => ({ ...prev, [profile.name]: { ...prev[profile.name], health: data } }));
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

  const handleSyncWithings = async () => {
    if (!profile) return;
    if (!profile.withingsTokens) {
      const authWindow = window.open('', 'withings_auth', 'width=600,height=700');
      if (authWindow) {
        authWindow.document.write('<p style="font-family:sans-serif;text-align:center;margin-top:50px;font-weight:bold;color:#334155;">Connecting to Withings...</p>');
        try {
          const url = await getWithingsAuthUrl(profile.withingsConfig?.clientId, profile.withingsConfig?.clientSecret);
          authWindow.location.href = url;
        } catch (e) {
          authWindow.close();
          alert("Failed to get Withings Auth URL");
        }
      } else {
        alert("Popup blocked! Please allow popups for this site.");
      }
      return;
    }

    setIsSyncingWithings(true);
    try {
      const data = await fetchWithingsData(
        profile.withingsTokens.access_token, 
        profile.withingsTokens.refresh_token,
        (newTokens) => {
          const updatedProfile = { 
            ...profile, 
            withingsTokens: { ...newTokens, last_sync: new Date().toISOString() } 
          };
          setProfile(updatedProfile);
          setDb(prev => ({ ...prev, [profile.name]: { ...prev[profile.name], profile: updatedProfile } }));
        },
        profile.withingsConfig?.clientId,
        profile.withingsConfig?.clientSecret
      );
      const mergedMetrics = [...(healthData?.metrics || [])];
      data.metrics.forEach(newM => {
        const existingIdx = mergedMetrics.findIndex(m => m.date.split('T')[0] === newM.date.split('T')[0]);
        if (existingIdx >= 0) {
          mergedMetrics[existingIdx] = { ...mergedMetrics[existingIdx], ...newM };
        } else {
          mergedMetrics.push(newM);
        }
      });
      const mergedData = { ...healthData, metrics: mergedMetrics.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) };
      setHealthData(mergedData);
      setDb(prev => ({ ...prev, [profile.name]: { ...prev[profile.name], health: mergedData } }));
    } catch (e: any) {
      console.error("Withings Sync Error:", e);
      alert("Withings Sync fehlgeschlagen.");
    } finally {
      setIsSyncingWithings(false);
    }
  };

  const handleResetWithings = () => {
    if (!profile) return;
    const updatedProfile = { ...profile };
    delete updatedProfile.withingsTokens;
    setProfile(updatedProfile);
    setDb(prev => ({
      ...prev,
      [profile.name]: { ...prev[profile.name], profile: updatedProfile }
    }));
  };

  const handleUpdateWithingsConfig = (clientId: string, clientSecret: string) => {
    if (!profile) return;
    const updatedProfile = { ...profile, withingsConfig: { clientId, clientSecret } };
    setProfile(updatedProfile);
    setDb(prev => ({
      ...prev,
      [profile.name]: { ...prev[profile.name], profile: updatedProfile }
    }));
    alert(language === 'de' ? "Withings Konfiguration gespeichert." : "Withings configuration saved.");
  };

  const handleSyncHealthBridge = async (profileOverride?: UserProfile) => {
    const currentProfile = profileOverride || profile;
    if (!currentProfile || !currentProfile.healthBridgeConfig) return;
    
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

      const data = await fetchHealthBridgeData(activeProfile.healthBridgeConfig!, token);
      
      const mergedMetrics = [...(healthData?.metrics || [])];
      data.metrics.forEach(newM => {
        const existingIdx = mergedMetrics.findIndex(m => m.date.split('T')[0] === newM.date.split('T')[0]);
        if (existingIdx >= 0) {
          mergedMetrics[existingIdx] = { ...mergedMetrics[existingIdx], ...newM };
        } else {
          mergedMetrics.push(newM);
        }
      });
      
      const mergedData: HealthData = { 
        ...healthData, 
        metrics: mergedMetrics.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
        sources: { ...(healthData?.sources || {}), healthBridge: true }
      };
      
      setHealthData(mergedData);
      setDb(prev => ({ ...prev, [activeProfile.name]: { ...prev[activeProfile.name], health: mergedData } }));
      
      const finalProfile = {
        ...activeProfile,
        healthBridgeTokens: { ...activeProfile.healthBridgeTokens!, last_sync: new Date().toISOString() }
      };
      setProfile(finalProfile);
      setDb(prev => ({ ...prev, [activeProfile.name]: { ...prev[activeProfile.name], profile: finalProfile } }));

      alert(language === 'de' ? `Sync erfolgreich! ${data.metrics.length} Tage aktualisiert.` : `Sync successful! ${data.metrics.length} days updated.`);

    } catch (e: any) {
      console.error("HealthBridge Sync Error:", e);
      const targetProfile = profileOverride || profile;
      if (targetProfile && (e.message?.includes('401') || e.message?.includes('Unauthorized'))) {
        const updatedProfile = { ...targetProfile };
        delete updatedProfile.healthBridgeTokens;
        setProfile(updatedProfile);
        setDb(prev => ({ ...prev, [targetProfile.name]: { ...prev[targetProfile.name], profile: updatedProfile } }));
      }
      alert(e.message || "HealthBridge Sync fehlgeschlagen.");
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
      [profile.name]: { ...prev[profile.name], profile: updatedProfile }
    }));
  };

  const handleUpdateHealthBridgeConfig = async (baseUrl: string, username?: string, password?: string, apiKey?: string) => {
    if (!profile) return;
    const updatedProfile = { ...profile, healthBridgeConfig: { baseUrl, username, password, apiKey } };
    delete updatedProfile.healthBridgeTokens; // Clear old tokens to force refresh with new config
    setProfile(updatedProfile);
    setDb(prev => ({
      ...prev,
      [profile.name]: { ...prev[profile.name], profile: updatedProfile }
    }));
    
    // Trigger initial sync automatically
    handleSyncHealthBridge(updatedProfile);
  };

  const handleRegister = (newProfile: UserProfile) => {
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
      calorieAdjustment: 0 
    };
    setDb(prev => ({ ...prev, [newProfile.name]: { profile: p, logs: [], health: null, weeklyPlan: null, workoutPlan: null, analysis: null, progressAnalysis: null, healthInsights: [] } }));
    setProfile(p);
    setAuthView('login');
    setActiveTab('overview');
  };

  const handleUpdateHealthInsights = (insights: HealthInsight[]) => {
    if (!profile) return;
    setHealthInsights(insights);
    setDb(prev => ({ ...prev, [profile.name]: { ...prev[profile.name], healthInsights: insights } }));
  };

  const handleGenerateWorkout = async (availableDays: string[], existing: ExistingWorkout[]) => {
    if (!profile) return;
    setIsGeneratingWorkout(true);
    try {
      const plan = await generateWorkoutPlan(profile, language, availableDays, existing, workoutLogs);
      const updatedHistory = profile.workoutHistory ? [...profile.workoutHistory] : [];
      if (workoutPlan) updatedHistory.push(workoutPlan);
      
      const updatedProfile = { ...profile, workoutPreferences: { availableDays, existingWorkouts: existing }, workoutHistory: updatedHistory };
      setWorkoutPlan(plan);
      setProfile(updatedProfile);
      setDb(prev => ({ ...prev, [profile.name]: { ...prev[profile.name], workoutPlan: plan, profile: updatedProfile } }));
    } catch (e) { alert(t.errorGeneral); } finally { setIsGeneratingWorkout(false); }
  };

  return (
    <>
      {showSplash && <SplashScreen language={language} onFinished={() => setShowSplash(false)} />}
      {!showSplash && !isSuperLoggedIn && <SuperUserAuth language={language} onUnlock={(p) => { 
        if(p === MASTER_PASSWORD) { 
          setIsSuperLoggedIn(true); 
          sessionStorage.setItem('heliofit_super_auth', 'true');
          return true; 
        } 
        return false; 
      }} />}
      <div className={`min-h-screen pt-16 pb-10 px-0 transition-opacity duration-700 ${(!showSplash && isSuperLoggedIn) ? 'opacity-100' : 'opacity-0'} flex flex-col`}>
        <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100 safe-top">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setActiveTab('overview')}>
              <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white font-black italic shadow-lg text-sm">H</div>
              <span className="hidden xs:inline font-black text-lg tracking-tighter text-slate-800 uppercase">{t.heroTitle}<span className="text-orange-600 italic">{t.heroSpan}</span></span>
            </div>
            <nav className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              {['overview', 'health', 'nutrition', 'workout', 'settings'].map((tab: any) => (
                <button 
                  key={tab} 
                  onClick={() => setActiveTab(tab as TabType)} 
                  className={`shrink-0 px-3.5 py-2.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  {tab === 'settings' ? (language === 'de' ? 'Setup' : 'Setup') : tab}
                </button>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  sessionStorage.removeItem('heliofit_super_auth');
                  window.location.reload();
                }} 
                className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 transition-all"
              >
                <i className="fas fa-lock"></i> {t.lockSystem}
              </button>
              <button onClick={() => setLanguage(language === 'de' ? 'en' : 'de')} className="w-8 h-8 flex items-center justify-center text-[9px] font-black uppercase text-slate-500 bg-white rounded-lg border border-slate-200">{language}</button>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto flex-grow w-full px-4 sm:px-6 lg:px-8 pt-4">
          {!profile ? (
            authView === 'login' ? <AuthScreen onLogin={(u, p) => { 
              const d = db[u]; 
              if (d && d.profile.password === p) { 
                setProfile(d.profile); 
                setWorkoutLogs(d.logs || []); 
                setHealthData(d.health || null); 
                setAnalysis(d.analysis || null); 
                const pa = Array.isArray(d.progressAnalysis) ? d.progressAnalysis : null;
                setProgressAnalysis(pa); 
                setWeeklyPlan(d.weeklyPlan || null); 
                setWorkoutPlan(d.workoutPlan || null); 
                setHealthInsights(d.healthInsights || []); 
                setMockMode(false); // Real users get live mode unless env overrides
                return true; 
              } 
              return false; 
            }} 
            onMockLogin={() => {
              const mockProfile: UserProfile = {
                name: 'MockUser',
                age: 30,
                weight: 80,
                height: 180,
                gender: 'male',
                goals: [FitnessGoal.MUSCLE_GAIN],
                activityLevel: ActivityLevel.ACTIVE,
                likedRecipes: [
                  { name: "Skyr mit Beeren & Nüssen", ingredients: ["250 g Skyr", "100 g Beeren", "30 g Mandeln"], instructions: ["Skyr in Schale geben", "Beeren waschen", "Nüsse hacken und drüberstreuen"], calories: 350, protein: 30, carbs: 20, fats: 15, prepTime: "5m", requiredAppliances: [], usageCount: 5 },
                  { name: "Lachs-Curry mit Reis", ingredients: ["150 g Lachs", "100 g Basmatireis", "200 g Brokkoli", "50 ml Kokosmilch"], instructions: ["Reis kochen", "Lachs würfeln und anbraten", "Brokkoli und Kokosmilch zugeben"], calories: 650, protein: 35, carbs: 55, fats: 25, prepTime: "20m", requiredAppliances: ["Herd", "Pfanne"], usageCount: 3 }
                ]
              };
              setProfile(mockProfile);
              setMockMode(true); // Mock user strictly uses mock Gemini
            }}
            onRegister={() => setAuthView('register')} 
            language={language} 
            existingUsers={Object.keys(db)} 
          /> : <UserProfileForm onSubmit={handleRegister} onCancel={() => setAuthView('login')} language={language} />
          ) : (
            <div className="space-y-6 animate-fade-in">
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
                    setDb(prev => ({...prev, [up.name]: {...prev[up.name], profile: up}})); 
                  }} 
                  onResetSync={handleResetGoogle}
                  isAnalyzing={isAnalyzing} 
                />
              )}
              {activeTab === 'health' && (
                <HealthTab 
                  profile={profile} 
                  healthData={healthData} 
                  insights={healthInsights} 
                  onUpdateInsights={handleUpdateHealthInsights} 
                  onResetSync={handleResetGoogle} 
                  onUploadData={(d) => { 
                    setHealthData(d); 
                    setDb(prev => ({...prev, [profile.name]: {...prev[profile.name], health: d}})); 
                  }} 
                  isLoading={isSyncingHealth || isSyncingWithings || isSyncingHealthBridge} 
                  language={language} 
                />
              )}
              {activeTab === 'settings' && (
                <SettingsTab
                  profile={profile}
                  healthData={healthData}
                  onSync={handleSyncHealth}
                  onResetSync={handleResetGoogle}
                  onSyncWithings={handleSyncWithings}
                  onResetWithings={handleResetWithings}
                  onUpdateWithingsConfig={handleUpdateWithingsConfig}
                  onSyncHealthBridge={handleSyncHealthBridge}
                  onResetHealthBridge={handleResetHealthBridge}
                  onUpdateHealthBridgeConfig={handleUpdateHealthBridgeConfig}
                  onUploadData={(d) => { 
                    setHealthData(d); 
                    setDb(prev => ({...prev, [profile.name]: {...prev[profile.name], health: d}})); 
                  }}
                  isLoading={isSyncingHealth || isSyncingWithings || isSyncingHealthBridge}
                  language={language}
                />
              )}
              {activeTab === 'nutrition' && (
                <NutritionTab 
                  weeklyPlan={weeklyPlan} 
                  onGeneratePlan={async (pfs) => { 
                    setIsGeneratingPlan(true); 
                    try { 
                      const pl = await generateMealPlan(profile, analysis!.targets, pfs, language); 
                      setWeeklyPlan(pl); 
                      
                      // Increment usageCount for recipes used in the plan
                      if (profile && profile.likedRecipes) {
                        const usedRecipeNames = new Set<string>();
                        Object.values(pl).forEach(day => {
                          Object.values(day).forEach(meal => {
                            if (meal && (meal as Recipe).name) {
                              usedRecipeNames.add((meal as Recipe).name);
                            }
                          });
                        });

                        const updatedLikedRecipes = profile.likedRecipes.map(r => {
                          if (usedRecipeNames.has(r.name)) {
                            return { ...r, usageCount: (r.usageCount || 0) + 1 };
                          }
                          return r;
                        });

                        const updatedProfile = { ...profile, likedRecipes: updatedLikedRecipes };
                        setProfile(updatedProfile);
                        setDb(prev => ({
                          ...prev, 
                          [profile.name]: {
                            ...prev[profile.name], 
                            weeklyPlan: pl,
                            profile: updatedProfile
                          }
                        }));
                      } else {
                        setDb(prev => ({...prev, [profile.name]: {...prev[profile.name], weeklyPlan: pl}}));
                      }
                    } catch(e){
                      console.error("Failed to generate plan", e);
                    } finally {
                      setIsGeneratingPlan(false); 
                    } 
                  }} 
                  onUpdateWeeklyPlan={(d, pl) => setWeeklyPlan(prev => ({...prev, [d]: pl}))} 
                  isLoading={isGeneratingPlan} 
                  language={language} 
                  profile={profile} 
                  targets={analysis?.targets} 
                  onUpdateProfile={(up) => { 
                    setProfile(up); 
                    setDb(prev => ({...prev, [up.name]: {...prev[up.name], profile: up}})); 
                  }} 
                />
              )}
              {activeTab === 'workout' && <WorkoutTab workoutProgram={workoutPlan} workoutLogs={workoutLogs} onGenerateWorkout={handleGenerateWorkout} onSaveLog={(log) => { const logs = [log, ...workoutLogs]; setWorkoutLogs(logs); setDb(prev => ({...prev, [profile.name]: {...prev[profile.name], logs}})); }} onUpdateProfile={(up) => { setProfile(up); setDb(prev => ({...prev, [up.name]: {...prev[up.name], profile: up}})); }} isLoading={isGeneratingWorkout} language={language} profile={profile} />}
            </div>
          )}
        </main>
      </div>
    </>
  );
};
export default App;
