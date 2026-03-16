
import React, { useState, useEffect } from 'react';
import { UserProfile, AIAnalysis, WeeklyMealPlan, Recipe, FitnessGoal, ActivityLevel, NutritionPreferences, WorkoutProgram, ExistingWorkout, WorkoutLog, HealthData, Language, DailyMealPlan, WorkoutPreferences, HealthInsight, ProgressInsight } from './types';
import Dashboard from './components/Dashboard';
import NutritionTab from './components/NutritionTab';
import WorkoutTab from './components/WorkoutTab';
import HealthTab from './components/HealthTab';
import SettingsTab from './components/SettingsTab';
import UserProfileForm from './components/UserProfileForm';
import AuthPortal from './components/AuthPortal';
import AdminPanel from './components/AdminPanel';
import { analyzeHealthData, generateMealPlan, generateWorkoutPlan, analyzeOverallProgress, analyzeHealthTrends, setMockMode } from './services/geminiService';
import { initGoogleFitAuth, requestGoogleFitAccess, fetchGoogleFitData, revokeGoogleFitAccess } from './services/googleFitService';
import { getWithingsAuthUrl, fetchWithingsData } from './services/withingsService';
import { loginHealthBridge, fetchHealthBridgeData } from './services/healthBridgeService';

type TabType = 'overview' | 'health' | 'nutrition' | 'workout' | 'settings' | 'admin';
type AuthView = 'login' | 'register';

const TRANSLATIONS = {
  de: {
    heroTitle: 'HelioFit ',
    heroSpan: 'AI',
    logout: 'Abmelden',
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
  const [isSuperLoggedIn, setIsSuperLoggedIn] = useState(() => sessionStorage.getItem('heliofit_super_auth') === 'true');
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
  const [isSyncingWithings, setIsSyncingWithings] = useState(false);
  const [isSyncingHealthBridge, setIsSyncingHealthBridge] = useState(false);
  const [isPushSyncingScale, setIsPushSyncingScale] = useState(false);
  const [isPushSyncingZepp, setIsPushSyncingZepp] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => sessionStorage.getItem('google_fit_token'));
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [authView, setAuthView] = useState<AuthView>('login');
  const [db, setDb] = useState<Record<string, any>>({});
  const [isDbLoaded, setIsDbLoaded] = useState(false);

  const t = TRANSLATIONS[language];

  // Load DB from server or localStorage
  useEffect(() => {
    const loadDb = async () => {
      let finalDb: Record<string, any> = {};

      // 1. Try server
      try {
        const response = await fetch('/api/db');
        if (response.ok) {
          const serverDb = await response.json();
          if (serverDb && Object.keys(serverDb).length > 0) {
            finalDb = serverDb;
          }
        }
      } catch (e) {
        console.error("Failed to fetch DB from server", e);
      }

      // 2. Try localStorage (and merge)
      const saved = localStorage.getItem('heliofit_manual_db_v1');
      if (saved) {
        try {
          const localDb = JSON.parse(saved);
          finalDb = { ...finalDb, ...localDb };
        } catch (e) {
          console.error("Failed to parse local DB", e);
        }
      }

      // 3. Migration: Ensure all entries have the { profile, logs, health } structure
      const migratedDb: Record<string, any> = {};
      Object.entries(finalDb).forEach(([key, val]: [string, any]) => {
        if (val && !val.profile) {
          // Old format: val IS the profile
          migratedDb[key] = { profile: val, logs: [], health: null };
        } else {
          migratedDb[key] = val;
        }
      });

      // 4. Seed initial admin if MISSING
      const initialAdminEmail = 'admin@heliofit.ai';
      if (!migratedDb[initialAdminEmail]) {
        const initialAdmin: UserProfile = {
          name: 'Admin',
          email: initialAdminEmail,
          password: 'admin123',
          isApproved: true,
          isAdmin: true,
          age: 30, weight: 75, height: 180, gender: 'male',
          goals: [], activityLevel: ActivityLevel.MODERATE
        };
        migratedDb[initialAdminEmail] = { profile: initialAdmin, logs: [], health: null };
      }

      setDb(migratedDb);
      setIsDbLoaded(true);
    };

    loadDb();
  }, []);

  // Restore profile on refresh
  useEffect(() => {
    if (isDbLoaded && isSuperLoggedIn && !profile) {
      const savedEmail = sessionStorage.getItem('heliofit_user_email');
      if (savedEmail) {
        const userData = db[savedEmail];
        if (userData) {
          setProfile(userData.profile);
          setWorkoutLogs(userData.logs || []);
          setHealthData(userData.health || null);
          setAnalysis(userData.analysis || null);
          setProgressAnalysis(userData.progressAnalysis || null);
          if (userData.profile.isAdmin) setActiveTab('admin');
        }
      }
    }
  }, [isDbLoaded, isSuperLoggedIn, profile, db]);

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
        readings: data.readings,
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

  const handlePushSync = async (appType: 'scale_bridge' | 'zepp_bridge', mode?: 'history') => {
    if (!profile?.healthBridgeConfig) return;
    const syncToken = profile.healthBridgeConfig.apiKey;
    const baseUrl = profile.healthBridgeConfig.baseUrl?.replace(/\/+$/, '') || '';
    if (!syncToken || !baseUrl) {
      alert('HealthBridge ist nicht konfiguriert. Bitte zuerst Sync Token und Base URL setzen.');
      return;
    }

    const setLoading = appType === 'scale_bridge' ? setIsPushSyncingScale : setIsPushSyncingZepp;
    setLoading(true);
    try {
      const url = `${baseUrl}/hb/ingest/${syncToken}/push-sync`;
      const body: Record<string, string> = { app_type: appType };
      if (mode) body.mode = mode;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.detail || `HTTP ${resp.status}`);

      const label = appType === 'scale_bridge' ? 'ScaleBridge' : 'ZeppBridge';
      if (result.status === 'ok') {
        alert(`${label}: Neue Daten empfangen nach ${result.waited_seconds}s – lade Historie...`);
        await handleSyncHealthBridge();
      } else {
        alert(`${label}: Timeout – keine neuen Daten innerhalb von ${result.waited_seconds}s`);
      }
    } catch (e: any) {
      console.error(`Push-sync [${appType}] error:`, e);
      alert(e.message || 'Push-Sync fehlgeschlagen');
    } finally {
      setLoading(false);
    }
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
      {!showSplash && !isSuperLoggedIn && !isRegistering && (
        <AuthPortal 
          language={language} 
          isApprovalPending={isApprovalPending}
          onLogin={(user) => { 
            console.log("Auth attempt:", user);
            
            // Check if user exists in DB
            const existingUser = db[user.email] || db[user.name];
            
            if (existingUser) {
              // If Email Login, verify password
              if (!user.isGoogle && existingUser.profile.password !== user.password) {
                alert(language === 'de' ? "Falsches Passwort" : "Invalid Password");
                return;
              }
              
              // Check for approval
              if (existingUser.profile.isApproved === false) {
                setIsApprovalPending(true);
                return;
              }
              
              setProfile(existingUser.profile);
              if (existingUser.profile.isAdmin) setActiveTab('admin');
              setWorkoutLogs(existingUser.logs || []);
              setHealthData(existingUser.health || null);
              setAnalysis(existingUser.analysis || null);
              const pa = Array.isArray(existingUser.progressAnalysis) ? existingUser.progressAnalysis : null;
              setProgressAnalysis(pa);
              setWeeklyPlan(existingUser.weeklyPlan || null);
              setWorkoutPlan(existingUser.workoutPlan || null);
              setHealthInsights(existingUser.healthInsights || []);
              
              setIsSuperLoggedIn(true); 
              sessionStorage.setItem('heliofit_super_auth', 'true');
              sessionStorage.setItem('heliofit_user_email', user.email);
            } else {
              // User doesn't exist
              if (user.isGoogle) {
                // For Google, we can auto-init a pending profile
                const newProfile: UserProfile = {
                  name: user.email,
                  age: 30, weight: 75, height: 180, gender: 'male',
                  goals: [], activityLevel: ActivityLevel.MODERATE,
                  isApproved: false
                };
                setDb(prev => ({ ...prev, [user.email]: { profile: newProfile, logs: [], health: null } }));
                setIsApprovalPending(true);
                return;
              } else {
                // For Email, if user doesn't exist, it's an error
                alert(language === 'de' ? "Benutzer nicht gefunden" : "User not found");
                return;
              }
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
            onSubmit={(p) => {
              const newProfile = { ...p, isApproved: false };
              handleRegister(newProfile);
              setIsRegistering(false);
              setIsApprovalPending(true);
            }} 
            onCancel={() => setIsRegistering(false)} 
            language={language} 
          />
        </div>
      )}
      <div className={`min-h-screen pt-16 pb-10 px-0 transition-opacity duration-700 ${(!showSplash && isSuperLoggedIn) ? 'opacity-100' : 'opacity-0'} flex flex-col bg-[#0f172a]`}>
        <header className="fixed top-0 left-0 right-0 z-50 bg-[#0f172a]/80 backdrop-blur-md border-b border-white/5 safe-top">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setActiveTab('overview')}>
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black italic shadow-lg text-sm">H</div>
              <span className="hidden xs:inline font-black text-lg tracking-tighter text-white uppercase">{t.heroTitle}<span className="text-orange-600 italic">{t.heroSpan}</span></span>
            </div>
            <nav className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              {!profile?.isAdmin && ['overview', 'health', 'nutrition', 'workout', 'settings'].map((tab: any) => (
                <button 
                   key={tab} 
                   onClick={() => setActiveTab(tab as TabType)} 
                   className={`shrink-0 px-3.5 py-2.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                 >
                   {tab === 'settings' ? (language === 'de' ? 'Setup' : 'Setup') : tab}
                 </button>
              ))}
              {profile?.isAdmin && (
                <button 
                  onClick={() => setActiveTab('admin')} 
                  className={`shrink-0 px-3.5 py-2.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'admin' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'text-orange-500/60 hover:text-orange-500 hover:bg-white/5'}`}
                >
                  {language === 'de' ? 'Benutzerverwaltung' : 'User Management'}
                </button>
              )}
            </nav>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  sessionStorage.removeItem('heliofit_super_auth');
                  sessionStorage.removeItem('heliofit_user_email');
                  setIsSuperLoggedIn(false);
                  setProfile(null);
                }} 
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-red-400 hover:bg-red-400/10 transition-all font-sans"
              >
                <i className="fas fa-right-from-bracket"></i> {t.logout}
              </button>
              <button onClick={() => setLanguage(language === 'de' ? 'en' : 'de')} className="w-8 h-8 flex items-center justify-center text-[9px] font-black uppercase text-slate-400 bg-white/5 rounded-lg border border-white/10">{language}</button>
            </div>
          </div>
        </header>
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
                      if (profile && (profile.email === email || profile.name === email)) {
                        setProfile(updatedProfile);
                      }
                      return { ...prev, [email]: { ...user, profile: updatedProfile } };
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
                      onPushSync={handlePushSync}
                      isPushSyncingScale={isPushSyncingScale}
                      isPushSyncingZepp={isPushSyncingZepp}
                      onUploadData={(d) => {
                        setHealthData(d);
                        setDb(prev => ({...prev, [profile.name]: {...prev[profile.name], health: d}}));
                      }}
                      onUpdateProfile={(up) => {
                        setProfile(up);
                        setDb(prev => ({...prev, [up.name]: {...prev[up.name], profile: up}}));
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
                          const pl = await generateMealPlan(profile, analysis?.targets, pfs, language); 
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
                </>
              )}
            </div>
          ) : null}
        </main>
      </div>
    </>
  );
};
export default App;
