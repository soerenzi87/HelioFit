
import React, { useState, useRef } from 'react';
import { UserProfile, HealthData, Language, FitnessGoal, ActivityLevel, HealthDataSource, HealthMetricPreferenceKey, DEFAULT_HEALTH_SOURCE_PREFERENCES, AIContextSize, AI_CONTEXT_PRESETS } from '../types';
import { processAppleHealthFile } from '../services/appleHealthService';

const GeminiLogo = () => (
  <svg viewBox="0 0 64 64" className="w-8 h-8" aria-hidden="true">
    <defs>
      <linearGradient id="geminiGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#60A5FA" />
        <stop offset="45%" stopColor="#A78BFA" />
        <stop offset="100%" stopColor="#F59E0B" />
      </linearGradient>
    </defs>
    <path
      d="M32 6c2.8 11.6 4.9 13.7 16.5 16.5C36.9 25.3 34.8 27.4 32 39 29.2 27.4 27.1 25.3 15.5 22.5 27.1 19.7 29.2 17.6 32 6Z"
      fill="url(#geminiGradient)"
    />
    <path
      d="M49 30c1.7 7 3 8.3 10 10-7 1.7-8.3 3-10 10-1.7-7-3-8.3-10-10 7-1.7 8.3-3 10-10Z"
      fill="url(#geminiGradient)"
      opacity="0.9"
    />
  </svg>
);

const HEALTH_SOURCE_METRICS: HealthMetricPreferenceKey[] = [
  'steps',
  'activeEnergy',
  'distance',
  'activityMinutes',
  'restingHeartRate',
  'hrv',
  'bloodPressureSys',
  'oxygenSaturation',
  'respiratoryRate',
  'bodyTemperature',
  'weight',
  'bodyFat',
  'sleepHours',
];

interface SettingsTabProps {
  profile: UserProfile;
  healthData: HealthData | null;
  onSync: () => void;
  onResetSync: () => void;
  onSyncHealthBridge: () => void;
  onResetHealthBridge: () => void;
  onUpdateHealthBridgeConfig: (baseUrl: string, username?: string, password?: string, apiKey?: string) => void;
  onPushSync: (appType: 'scale_bridge' | 'zepp_bridge', mode?: 'history') => void;
  isPushSyncingScale: boolean;
  isPushSyncingZepp: boolean;
  onUploadData: (data: HealthData, fileName: string) => void;
  onUpdateProfile: (profile: UserProfile) => void;
  onResetMockData?: () => void;
  onResetAllData?: () => void;
  isLoading: boolean;
  language: Language;
  mode?: 'all' | 'profile' | 'technical';
}

const SettingsTab: React.FC<SettingsTabProps> = ({ 
  profile, 
  healthData, 
  onSync, 
  onResetSync, 
  onSyncHealthBridge,
  onResetHealthBridge,
  onUpdateHealthBridgeConfig,
  onPushSync,
  isPushSyncingScale,
  isPushSyncingZepp,
  onUploadData,
  onUpdateProfile,
  onResetMockData,
  onResetAllData,
  isLoading,
  language,
  mode = 'all'
}) => {
  const showProfileSection = mode !== 'technical';
  const showTechnicalSection = mode !== 'profile';
  // Profile State
  const [editProfile, setEditProfile] = useState<UserProfile>({ ...profile });
  const [hbBaseUrl, setHbBaseUrl] = useState(profile.healthBridgeConfig?.baseUrl || 'https://health.soerenzieger.de');
  const [hbUsername, setHbUsername] = useState(profile.healthBridgeConfig?.username || '');
  const [hbPassword, setHbPassword] = useState(profile.healthBridgeConfig?.password || '');
  const [hbApiKey, setHbApiKey] = useState(profile.healthBridgeConfig?.apiKey || '');
  
  // AI Config State
  const [geminiKey, setGeminiKey] = useState(profile.aiConfig?.geminiKey || '');
  const [openaiKey, setOpenaiKey] = useState(profile.aiConfig?.openaiKey || '');
  const [claudeKey, setClaudeKey] = useState(profile.aiConfig?.claudeKey || '');
  const [preferredProvider, setPreferredProvider] = useState<'gemini' | 'openai' | 'claude'>(profile.aiConfig?.preferredProvider || 'gemini');
  const [contextSize, setContextSize] = useState<AIContextSize>(profile.aiConfig?.contextSize || 'medium');

  const [isParsingApple, setIsParsingApple] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profilePicRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsingApple(true);
    try {
      const data = await processAppleHealthFile(file);
      onUploadData(data, file.name);
    } catch (err) {
      console.error(err);
      alert(language === 'de' ? "Fehler beim Verarbeiten." : "Error processing file.");
    } finally {
      setIsParsingApple(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleProfilePicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setEditProfile(prev => ({ ...prev, profilePicture: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateProfile = () => {
    onUpdateProfile({ 
      ...editProfile, 
      healthSourcePreferences: {
        ...DEFAULT_HEALTH_SOURCE_PREFERENCES,
        ...(editProfile.healthSourcePreferences || {}),
      },
      aiConfig: {
        geminiKey,
        openaiKey,
        claudeKey,
        preferredProvider,
        contextSize
      } 
    });
    alert(language === 'de' ? 'Profil gespeichert!' : 'Profile saved!');
  };

  const metricCoverage = healthData?.sources?.metricCoverage || {};
  // Only show sources that are connected AND have actual metric data
  const activeSources = ([
    (healthData?.sources?.appleFiles?.length || 0) > 0 && (metricCoverage.apple || []).length ? 'apple' : null,
    (sessionStorage.getItem('google_fit_token') || healthData?.sources?.googleSynced) && (metricCoverage.google || []).length ? 'google' : null,
    (profile.healthBridgeTokens || healthData?.sources?.xiaomiScaleSynced) && (metricCoverage.xiaomiScale || []).length ? 'xiaomiScale' : null,
    (profile.healthBridgeTokens || healthData?.sources?.healthSyncSynced) && (metricCoverage.healthSync || []).length ? 'healthSync' : null,
  ].filter(Boolean) as HealthDataSource[]);

  const getAvailableSourcesForMetric = (metricKey: HealthMetricPreferenceKey) =>
    activeSources.filter((sourceKey) => (metricCoverage[sourceKey] || []).includes(metricKey));

  const formatSyncTimestamp = (value?: string) => {
    if (!value) {
      return language === 'de' ? 'Noch kein Sync' : 'No sync yet';
    }
    return new Date(value).toLocaleString(language === 'de' ? 'de-DE' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const t = language === 'de' ? {
    title: 'Setup',
    subtitle: 'Profil, Datenquellen und Integrationen verwalten',
    profileCard: 'Profil anpassen',
    saveProfile: 'Profil speichern',
    username: 'Benutzername',
    password: 'Passwort',
    age: 'Alter',
    weight: 'Gewicht',
    height: 'Grösse',
    bodyFat: 'Körperfett',
    gender: 'Geschlecht',
    activity: 'Aktivitätslevel',
    goals: 'Ziele',
    uploadPic: 'Profilbild hochladen',
    aiTitle: 'KI-Anbindungen',
    aiSub: 'Pflege deine API-Schlüssel für generative KI-Funktionen',
    contextSizeLabel: 'KI-Kontextgröße',
    contextSizeSub: 'Bestimmt wie viele Daten an die KI gesendet werden',
    contextSmall: 'Klein',
    contextMedium: 'Mittel',
    contextLarge: 'Groß',
    contextSmallDesc: '7 Tage / 3 Wochen',
    contextMediumDesc: '14 Tage / 6 Wochen',
    contextLargeDesc: '30 Tage / 10 Wochen',
    syncTitle: 'Datenquellen / Sync',
    syncSub: 'Verwalte deine Gesundheitsdaten und automatische Synchronisation',
    googleStatus: 'Google Health Sync',
    healthBridgeStatus: 'HealthBridge API Sync',
    resetSync: 'Verbindung trennen',
    googleActive: 'Verbunden & Live',
    googleInactive: 'Nicht verbunden',
    reUpload: 'Datei aktualisieren',
    update: 'Aktualisieren',
    syncBtn: 'Google Health Sync',
    appleBtn: 'Apple Health Upload',
    noSyncSub: 'Lade deinen Apple Health Export hoch oder verbinde Google Health.',
    save: 'Speichern',
    configuration: 'Konfiguration',
    systemActive: 'System aktiv',
    securityLevel: 'Sicherheitsstufe: Hoch',
    identityVerification: 'Identitätsprüfung',
    encryptionHint: 'Deine Profildaten werden mit Ende-zu-Ende-Helio-Protokollen verschlüsselt.',
    saveConfiguration: 'Konfiguration speichern',
    sourcePriorityTitle: 'Quellen je Wert',
    sourcePrioritySub: 'Wähle, welche Quelle bei zusammengeführten Gesundheitswerten bevorzugt wird.',
    sourceFallbackHint: 'Fehlt der bevorzugte Wert, nutzt HelioFit automatisch eine andere verfügbare Quelle.',
    sourceOnlyActiveHint: 'Es werden nur aktive Datenverbindungen angezeigt, die diesen Wert bereits geliefert haben.',
    dataSource: 'Datenquelle',
    noSourceAvailable: 'Noch keine aktive Quelle mit diesem Wert erkannt',
    resetMockData: 'Mockdaten zurücksetzen',
    resetMockDataSub: 'Setzt Demo-Gesundheitsdaten und Demo-Gewichtsverlauf auf den Standardzustand zurück.',
    resetAllData: 'Alle Daten zurücksetzen',
    resetAllDataTitle: 'Kompletter Daten-Reset',
    resetAllDataSub: 'Löscht Trainingshistorie, Gesundheitsdaten, Pläne, Favoriten, Analysen und gespeicherte Verbindungen für diesen Account.',
    resetAllDataConfirm: 'Möchtest du wirklich alle HelioFit-Daten dieses Accounts zurücksetzen? Dieser Schritt kann nicht rückgängig gemacht werden.',
    lastSyncLabel: 'Letzter Sync',
    sourcesMap: {
      google: 'Google Fit',
      apple: 'Apple Health',
      xiaomiScale: 'Xiaomi Scale',
      healthSync: 'Health Sync',
    },
    metricSourceLabels: {
      steps: 'Schritte',
      activeEnergy: 'Aktive Kalorien',
      distance: 'Distanz',
      activityMinutes: 'Aktive Minuten',
      restingHeartRate: 'Ruhepuls',
      hrv: 'HRV',
      bloodPressureSys: 'Blutdruck',
      oxygenSaturation: 'Sauerstoffsättigung',
      respiratoryRate: 'Atemfrequenz',
      bodyTemperature: 'Körpertemperatur',
      weight: 'Gewicht',
      bodyFat: 'Körperfett',
      sleepHours: 'Schlaf',
    },
    genderMale: 'Männlich', genderFemale: 'Weiblich', genderOther: 'Andere',
    goalsMap: {
      [FitnessGoal.WEIGHT_LOSS]: 'Abnehmen', [FitnessGoal.MUSCLE_GAIN]: 'Muskelaufbau',
      [FitnessGoal.MAINTENANCE]: 'Gewicht halten', [FitnessGoal.ATHLETIC_PERFORMANCE]: 'Performance',
      [FitnessGoal.FLEXIBILITY]: 'Mobilität', [FitnessGoal.ENDURANCE]: 'Ausdauer',
    },
    activityMap: {
      [ActivityLevel.SEDENTARY]: 'Sitzend', [ActivityLevel.MODERATE]: 'Moderat',
      [ActivityLevel.ACTIVE]: 'Aktiv', [ActivityLevel.VERY_ACTIVE]: 'Sehr Aktiv',
    }
  } : {
    title: 'Setup',
    subtitle: 'Manage profile, data sources and integrations',
    profileCard: 'Personalize Profile',
    saveProfile: 'Save Profile',
    username: 'Username',
    password: 'Password',
    age: 'Age',
    weight: 'Weight',
    height: 'Height',
    bodyFat: 'Body Fat',
    gender: 'Gender',
    activity: 'Activity Level',
    goals: 'Goals',
    uploadPic: 'Upload Profile Picture',
    aiTitle: 'AI Connections',
    aiSub: 'Manage your API keys for generative AI features',
    contextSizeLabel: 'AI Context Size',
    contextSizeSub: 'Controls how much data is sent to the AI',
    contextSmall: 'Small',
    contextMedium: 'Medium',
    contextLarge: 'Large',
    contextSmallDesc: '7 days / 3 weeks',
    contextMediumDesc: '14 days / 6 weeks',
    contextLargeDesc: '30 days / 10 weeks',
    syncTitle: 'Data Sources / Sync',
    syncSub: 'Manage your health data and automatic synchronization',
    googleStatus: 'Google Health Sync',
    healthBridgeStatus: 'HealthBridge API Sync',
    resetSync: 'Disconnect',
    googleActive: 'Connected & Live',
    googleInactive: 'Not connected',
    reUpload: 'Update file',
    update: 'Update',
    syncBtn: 'Google Health Sync',
    appleBtn: 'Apple Health Upload',
    noSyncSub: 'Upload Apple Health export or connect Google Health.',
    save: 'Save',
    configuration: 'Configuration',
    systemActive: 'System Active',
    securityLevel: 'Security Level: High',
    identityVerification: 'Identity Verification',
    encryptionHint: 'Your profile data is encrypted using end-to-end Helio protocols.',
    saveConfiguration: 'Save Configuration',
    sourcePriorityTitle: 'Source Per Metric',
    sourcePrioritySub: 'Choose which source should be preferred for merged health values.',
    sourceFallbackHint: 'If the preferred source has no value, HelioFit will automatically fall back to another available source.',
    sourceOnlyActiveHint: 'Only active data connections that have already delivered this metric are shown.',
    dataSource: 'Data source',
    noSourceAvailable: 'No active source has delivered this metric yet',
    resetMockData: 'Reset Mock Data',
    resetMockDataSub: 'Resets demo health data and demo weight history back to the default state.',
    resetAllData: 'Reset All Data',
    resetAllDataTitle: 'Full Data Reset',
    resetAllDataSub: 'Deletes workout history, health data, plans, favorites, analyses, and saved connections for this account.',
    resetAllDataConfirm: 'Do you really want to reset all HelioFit data for this account? This cannot be undone.',
    lastSyncLabel: 'Last sync',
    sourcesMap: {
      google: 'Google Fit',
      apple: 'Apple Health',
      xiaomiScale: 'Xiaomi Scale',
      healthSync: 'Health Sync',
    },
    metricSourceLabels: {
      steps: 'Steps',
      activeEnergy: 'Active Calories',
      distance: 'Distance',
      activityMinutes: 'Active Minutes',
      restingHeartRate: 'Resting Heart Rate',
      hrv: 'HRV',
      bloodPressureSys: 'Blood Pressure',
      oxygenSaturation: 'Oxygen Saturation',
      respiratoryRate: 'Respiratory Rate',
      bodyTemperature: 'Body Temperature',
      weight: 'Weight',
      bodyFat: 'Body Fat',
      sleepHours: 'Sleep',
    },
    genderMale: 'Male', genderFemale: 'Female', genderOther: 'Other',
    goalsMap: {
      [FitnessGoal.WEIGHT_LOSS]: 'Weight Loss', [FitnessGoal.MUSCLE_GAIN]: 'Muscle Gain',
      [FitnessGoal.MAINTENANCE]: 'Maintenance', [FitnessGoal.ATHLETIC_PERFORMANCE]: 'Performance',
      [FitnessGoal.FLEXIBILITY]: 'Flexibility', [FitnessGoal.ENDURANCE]: 'Endurance',
    },
    activityMap: {
      [ActivityLevel.SEDENTARY]: 'Sedentary', [ActivityLevel.MODERATE]: 'Moderate',
      [ActivityLevel.ACTIVE]: 'Active', [ActivityLevel.VERY_ACTIVE]: 'Very Active',
    }
  };

  const handleResetAllData = () => {
    if (!onResetAllData) return;
    if (window.confirm(t.resetAllDataConfirm)) {
      onResetAllData();
    }
  };

  return (
    <div className="space-y-12 pb-32 animate-fade-in relative">
      {mode === 'all' && (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="space-y-3">
            <p className="text-indigo-500 text-[10px] font-black uppercase tracking-[0.4em] mb-1">{t.configuration}</p>
            <h2 className="text-6xl font-black text-white tracking-tighter uppercase leading-none">{t.title}</h2>
            <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-xs">{t.subtitle}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-6 py-3 bg-white/5 border border-white/5 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
              {t.systemActive}
            </div>
          </div>
        </div>
      )}

      {showProfileSection && <div className="bg-[#1a1f26]/80 backdrop-blur-3xl rounded-[3.5rem] p-10 lg:p-14 shadow-[0_50px_100px_rgba(0,0,0,0.5)] border border-white/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-12 opacity-5 text-[15rem] pointer-events-none translate-x-12 -translate-y-12 group-hover:text-indigo-500 transition-colors">
          <i className="fas fa-user-gear"></i>
        </div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 mb-16 relative z-10">
          <div className="space-y-4">
            <span className="px-4 py-2 bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest">{t.securityLevel}</span>
            <h3 className="text-4xl font-black text-white tracking-tight uppercase leading-none">{t.profileCard}</h3>
          </div>
          <button 
            onClick={handleUpdateProfile}
            className="w-full lg:w-auto px-12 py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] font-black uppercase tracking-[0.1em] text-sm transition-all shadow-[0_20px_50px_rgba(79,70,229,0.3)] active:scale-95 border border-indigo-400/20"
          >
            <i className="fas fa-save mr-3"></i> {t.saveProfile}
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-16 relative z-10">
          {/* Profile Picture Column */}
          <div className="space-y-8">
            <div className="aspect-square bg-slate-900 rounded-[3rem] flex items-center justify-center overflow-hidden border border-white/5 shadow-2xl group relative cursor-pointer" onClick={() => profilePicRef.current?.click()}>
              {editProfile.profilePicture ? (
                <img src={editProfile.profilePicture} alt="Profile" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
              ) : (
                <div className="text-[10rem] font-black text-indigo-500/20 italic">{editProfile.name?.[0]?.toUpperCase()}</div>
              )}
              <div className="absolute inset-0 bg-indigo-600/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-4 backdrop-blur-sm">
                <div className="w-16 h-16 rounded-3xl bg-white text-slate-900 flex items-center justify-center shadow-2xl">
                  <i className="fas fa-camera text-2xl"></i>
                </div>
                <p className="text-white text-[10px] font-black uppercase tracking-widest">{t.uploadPic}</p>
              </div>
            </div>
            <div className="p-6 bg-white/5 border border-white/5 rounded-[2rem] space-y-4">
               <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                 <i className="fas fa-circle-info text-indigo-500"></i> {t.identityVerification}
               </p>
               <p className="text-xs text-slate-400 font-medium leading-relaxed italic">{t.encryptionHint}</p>
            </div>
            <input type="file" ref={profilePicRef} onChange={handleProfilePicChange} accept="image/*" className="hidden" />
          </div>

          {/* Fields Grid */}
          <div className="space-y-12">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.username}</label>
                <div className="relative group">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-500 transition-colors">
                    <i className="fas fa-at"></i>
                  </div>
                  <input 
                    type="text" 
                    value={editProfile.name}
                    onChange={(e) => setEditProfile(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full pl-14 pr-6 py-5 bg-slate-900 border border-white/5 rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none font-bold text-white transition-all shadow-inner"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.password}</label>
                <div className="relative group">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-500 transition-colors">
                    <i className="fas fa-key"></i>
                  </div>
                  <input 
                    type="password" 
                    value={editProfile.password || ''}
                    onChange={(e) => setEditProfile(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="••••••••"
                    className="w-full pl-14 pr-6 py-5 bg-slate-900 border border-white/5 rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none font-bold text-white transition-all shadow-inner"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: t.age, val: editProfile.age, key: 'age', unit: '' },
                { label: t.weight, val: editProfile.weight, key: 'weight', unit: 'kg' },
                { label: t.height, val: editProfile.height, key: 'height', unit: 'cm' },
                { label: t.bodyFat, val: editProfile.bodyFat || 0, key: 'bodyFat', unit: '%' }
              ].map((f) => (
                <div key={f.key} className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{f.label}</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={f.val}
                      onChange={(e) => setEditProfile(prev => ({ ...prev, [f.key]: Number(e.target.value) }))}
                      className="w-full px-6 py-5 bg-slate-900 border border-white/5 rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none font-black text-white text-center transition-all shadow-inner"
                    />
                    {f.unit && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-600 uppercase">{f.unit}</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.gender}</label>
                <select 
                  value={editProfile.gender}
                  onChange={(e) => setEditProfile(prev => ({ ...prev, gender: e.target.value as any }))}
                  className="w-full px-8 py-5 bg-slate-900 border border-white/5 rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none font-bold text-white transition-all appearance-none cursor-pointer"
                >
                  <option value="male">{t.genderMale}</option>
                  <option value="female">{t.genderFemale}</option>
                  <option value="other">{t.genderOther}</option>
                </select>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.activity}</label>
                <select 
                  value={editProfile.activityLevel}
                  onChange={(e) => setEditProfile(prev => ({ ...prev, activityLevel: e.target.value as any }))}
                  className="w-full px-8 py-5 bg-slate-900 border border-white/5 rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none font-bold text-white transition-all appearance-none cursor-pointer"
                >
                  {Object.entries(t.activityMap).map(([key, val]) => (
                    <option key={key} value={key}>{val}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-6">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.goals}</label>
              <div className="flex flex-wrap gap-3">
                {Object.values(FitnessGoal).map(goal => {
                  const isActive = editProfile.goals.includes(goal);
                  return (
                    <button 
                      key={goal} 
                      onClick={() => setEditProfile(prev => ({ ...prev, goals: prev.goals.includes(goal) ? prev.goals.filter(g => g !== goal) : [...prev.goals, goal] }))}
                      className={`px-8 py-4 rounded-[1.5rem] border text-[11px] font-black uppercase tracking-widest transition-all ${isActive ? 'bg-indigo-600 border-indigo-500 text-white shadow-[0_15px_40px_rgba(79,70,229,0.4)]' : 'bg-slate-900 border-white/5 text-slate-500 hover:border-white/20 hover:text-slate-300'}`}
                    >
                      {t.goalsMap[goal]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>}

      {showTechnicalSection && profile.mockMode && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-[2.5rem] p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 bg-amber-500/20 rounded-2xl flex items-center justify-center text-amber-500 text-xl shrink-0">
              <i className="fas fa-flask"></i>
            </div>
            <div>
              <h4 className="text-white font-black uppercase tracking-tight text-sm">
                {language === 'de' ? 'Demo-Modus aktiv' : 'Demo Mode Active'}
              </h4>
              <p className="text-amber-400/70 text-[10px] font-bold uppercase tracking-widest mt-1">
                {language === 'de'
                  ? 'Gesundheitsdaten werden simuliert — Konnektoren und KI-Anbindungen sind deaktiviert'
                  : 'Health data is simulated — Connectors and AI connections are disabled'}
              </p>
              <p className="text-xs text-amber-200/80 mt-3">{t.resetMockDataSub}</p>
            </div>
          </div>
          <button
            onClick={onResetMockData}
            className="px-8 py-4 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 rounded-2xl border border-amber-400/20 font-black uppercase tracking-widest text-[10px] transition-all"
          >
            <i className="fas fa-rotate-left mr-2"></i>
            {t.resetMockData}
          </button>
        </div>
      )}

      {showTechnicalSection && !profile.mockMode && <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* ── AI CONNECTIONS ────────────────────────────────────────────── */}
        <div className="bg-[#1a1f26]/80 backdrop-blur-3xl p-10 lg:p-14 rounded-[3.5rem] border border-white/5 shadow-2xl space-y-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-10 opacity-5 text-9xl pointer-events-none translate-x-6">
            <i className="fas fa-brain text-white"></i>
          </div>
          
          <div className="relative z-10">
            <p className="text-amber-500 text-[10px] font-black uppercase tracking-[0.4em] mb-3">{t.aiTitle}</p>
            <h3 className="text-3xl font-black text-white tracking-tight uppercase">{t.aiTitle}</h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-2">{t.aiSub}</p>
          </div>

          <div className="space-y-6 relative z-10">
            {/* ── Provider Selection ── */}
            <div className="bg-slate-900 p-6 sm:p-8 rounded-[2.5rem] border border-white/5 space-y-5">
              <div>
                <p className="font-black text-[10px] uppercase tracking-widest text-white mb-1">{language === 'de' ? 'AI-Provider' : 'AI Provider'}</p>
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{language === 'de' ? 'Wähle welche KI-Engine verwendet wird' : 'Choose which AI engine to use'}</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { key: 'gemini' as const, label: 'Gemini', icon: 'fa-google', color: 'indigo', desc: 'Google' },
                  { key: 'openai' as const, label: 'GPT-4.1', icon: 'fa-bolt', color: 'emerald', desc: 'OpenAI' },
                  { key: 'claude' as const, label: 'Claude', icon: 'fa-brain', color: 'amber', desc: 'Anthropic' },
                ]).map(opt => {
                  const hasKey = opt.key === 'gemini' ? !!geminiKey : opt.key === 'openai' ? !!openaiKey : !!claudeKey;
                  const isActive = preferredProvider === opt.key;
                  const colorMap: any = { indigo: { bg: 'bg-indigo-600/20', border: 'border-indigo-500/50', ring: 'ring-indigo-500/30', text: 'text-indigo-400', icon: 'text-indigo-500' }, emerald: { bg: 'bg-emerald-600/20', border: 'border-emerald-500/50', ring: 'ring-emerald-500/30', text: 'text-emerald-400', icon: 'text-emerald-500' }, amber: { bg: 'bg-amber-600/20', border: 'border-amber-500/50', ring: 'ring-amber-500/30', text: 'text-amber-400', icon: 'text-amber-500' } };
                  const c = colorMap[opt.color];
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setPreferredProvider(opt.key)}
                      className={`p-4 rounded-2xl border text-center transition-all relative ${
                        isActive ? `${c.bg} ${c.border} ring-2 ${c.ring}` : 'bg-slate-950 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <i className={`fab ${opt.icon} text-xl mb-2 ${isActive ? c.icon : 'text-slate-600'}`}></i>
                      <p className={`font-black text-[10px] uppercase tracking-widest ${isActive ? 'text-white' : 'text-slate-400'}`}>{opt.label}</p>
                      <p className="text-[7px] font-bold text-slate-600 uppercase tracking-widest mt-1">{opt.desc}</p>
                      {hasKey && <i className="fas fa-check-circle text-emerald-500 text-[10px] absolute top-2 right-2"></i>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── API Keys ── */}
            <div className="grid grid-cols-1 gap-4">
              {/* Gemini Key */}
              <div className={`bg-slate-900 p-6 rounded-[2rem] border space-y-4 transition-all ${preferredProvider === 'gemini' ? 'border-indigo-500/30' : 'border-white/5'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-600/10 rounded-xl border border-indigo-500/20 flex items-center justify-center">
                      <GeminiLogo />
                    </div>
                    <div>
                      <p className="font-black text-[10px] uppercase tracking-widest text-white">Google Gemini</p>
                      {preferredProvider === 'gemini' && <p className="text-[7px] font-black text-indigo-400 uppercase tracking-widest">{language === 'de' ? 'Aktiv' : 'Active'}</p>}
                    </div>
                  </div>
                  {geminiKey && <i className="fas fa-check-circle text-emerald-500"></i>}
                </div>
                <div className="relative group/key">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600"><i className="fas fa-key text-xs"></i></div>
                  <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} placeholder="AIzaSy..." className="w-full bg-slate-950 border border-white/5 rounded-xl pl-10 pr-4 py-3 text-[10px] font-black text-white outline-none focus:ring-2 focus:ring-indigo-600/50 transition-all" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* OpenAI Key */}
                <div className={`bg-slate-900 p-6 rounded-[2rem] border space-y-4 transition-all ${preferredProvider === 'openai' ? 'border-emerald-500/30' : 'border-white/5'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-600/10 rounded-xl border border-emerald-500/20 flex items-center justify-center text-emerald-500"><i className="fas fa-bolt"></i></div>
                      <div>
                        <p className="font-black text-[10px] uppercase tracking-widest text-white">OpenAI</p>
                        {preferredProvider === 'openai' && <p className="text-[7px] font-black text-emerald-400 uppercase tracking-widest">{language === 'de' ? 'Aktiv' : 'Active'}</p>}
                      </div>
                    </div>
                    {openaiKey && <i className="fas fa-check-circle text-emerald-500"></i>}
                  </div>
                  <input type="password" value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} placeholder="sk-..." className="w-full bg-slate-950 border border-white/5 rounded-xl px-4 py-3 text-[10px] font-black text-white outline-none focus:ring-2 focus:ring-emerald-600/50 transition-all" />
                </div>

                {/* Claude Key */}
                <div className={`bg-slate-900 p-6 rounded-[2rem] border space-y-4 transition-all ${preferredProvider === 'claude' ? 'border-amber-500/30' : 'border-white/5'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-600/10 rounded-xl border border-amber-500/20 flex items-center justify-center text-amber-500"><i className="fas fa-brain"></i></div>
                      <div>
                        <p className="font-black text-[10px] uppercase tracking-widest text-white">Claude</p>
                        {preferredProvider === 'claude' && <p className="text-[7px] font-black text-amber-400 uppercase tracking-widest">{language === 'de' ? 'Aktiv' : 'Active'}</p>}
                      </div>
                    </div>
                    {claudeKey && <i className="fas fa-check-circle text-emerald-500"></i>}
                  </div>
                  <input type="password" value={claudeKey} onChange={e => setClaudeKey(e.target.value)} placeholder="sk-ant-..." className="w-full bg-slate-950 border border-white/5 rounded-xl px-4 py-3 text-[10px] font-black text-white outline-none focus:ring-2 focus:ring-amber-600/50 transition-all" />
                </div>
              </div>
            </div>

            {/* Context Size Selector */}
            <div className="bg-slate-900 p-6 sm:p-8 rounded-[2.5rem] border border-white/5 space-y-5">
              <div>
                <p className="font-black text-[10px] uppercase tracking-widest text-white mb-1">{t.contextSizeLabel}</p>
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{t.contextSizeSub}</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { key: 'small' as AIContextSize, label: t.contextSmall, desc: t.contextSmallDesc, icon: 'fa-compress' },
                  { key: 'medium' as AIContextSize, label: t.contextMedium, desc: t.contextMediumDesc, icon: 'fa-equals' },
                  { key: 'large' as AIContextSize, label: t.contextLarge, desc: t.contextLargeDesc, icon: 'fa-expand' },
                ]).map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setContextSize(opt.key)}
                    className={`p-4 rounded-2xl border text-center transition-all ${
                      contextSize === opt.key
                        ? 'bg-indigo-600/20 border-indigo-500/50 ring-2 ring-indigo-500/30'
                        : 'bg-slate-950 border-white/5 hover:border-white/10'
                    }`}
                  >
                    <i className={`fas ${opt.icon} text-lg mb-2 ${contextSize === opt.key ? 'text-indigo-400' : 'text-slate-600'}`}></i>
                    <p className={`font-black text-[10px] uppercase tracking-widest ${contextSize === opt.key ? 'text-white' : 'text-slate-400'}`}>{opt.label}</p>
                    <p className="text-[7px] font-bold text-slate-600 uppercase tracking-widest mt-1">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            
            <button 
              onClick={handleUpdateProfile}
              className="w-full py-6 bg-slate-950 text-white rounded-[2rem] font-black uppercase tracking-widest text-[11px] hover:bg-black transition-all border border-white/10 shadow-2xl active:scale-95"
            >
              {t.saveConfiguration}
            </button>

          </div>
        </div>

        {/* ── DATA SOURCES / SYNC ───────────────────────────────────────── */}
        <div className="bg-[#1a1f26]/80 backdrop-blur-3xl p-10 lg:p-14 rounded-[3.5rem] border border-white/5 shadow-2xl space-y-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-10 opacity-5 text-9xl pointer-events-none translate-x-6">
            <i className="fas fa-satellite-dish text-white"></i>
          </div>

          <div className="relative z-10">
            <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.4em] mb-3">{t.syncTitle}</p>
            <h3 className="text-3xl font-black text-white tracking-tight uppercase leading-none">{t.syncTitle}</h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-2">{t.syncSub}</p>
          </div>

          <div className="space-y-6 relative z-10">
            {/* HealthBridge Card */}
            <div className="bg-slate-950 p-5 sm:p-8 md:p-10 rounded-2xl sm:rounded-[2.5rem] border border-indigo-500/20 shadow-2xl relative overflow-hidden group">
               <div className="absolute top-0 right-0 p-4 sm:p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <i className="fas fa-tower-broadcast text-4xl sm:text-7xl text-white"></i>
              </div>

              <div className="relative z-10 space-y-5 sm:space-y-8">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-indigo-600/20 rounded-2xl sm:rounded-3xl flex items-center justify-center text-indigo-500 text-xl sm:text-2xl border border-indigo-600/30 flex-shrink-0">
                      <i className="fas fa-link"></i>
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-base sm:text-xl font-black text-white uppercase tracking-tight truncate">HealthBridge Core</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${profile.healthBridgeTokens ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
                        <p className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">
                          {profile.healthBridgeTokens ? 'Cloud Connected' : 'Endpoint Offline'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
                    {profile.healthBridgeTokens && (
                      <button onClick={onResetHealthBridge} className="px-4 sm:px-6 py-3 sm:py-4 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-[8px] sm:text-[9px] border border-red-500/20 transition-all">{t.resetSync}</button>
                    )}
                    <button
                      onClick={() => onUpdateHealthBridgeConfig(hbBaseUrl, hbUsername, hbPassword, hbApiKey)}
                      className="flex-grow px-5 sm:px-8 py-3 sm:py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-[8px] sm:text-[9px] shadow-xl border border-indigo-400/20 transition-all"
                    >
                      {t.save} Endpoint
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:gap-6">
                  <div className="space-y-2 sm:space-y-3">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">Bridge Base URL</label>
                    <input type="text" value={hbBaseUrl} onChange={(e) => setHbBaseUrl(e.target.value)} className="w-full bg-slate-900 border border-white/5 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-[11px] sm:text-xs font-black text-white outline-none focus:ring-2 focus:ring-indigo-600 shadow-inner placeholder:text-slate-800" placeholder="https://..." />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2 sm:space-y-3">
                      <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">Access Token</label>
                      <input type="password" value={hbApiKey} onChange={(e) => setHbApiKey(e.target.value)} className="w-full bg-slate-900 border border-white/5 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-[11px] sm:text-xs font-black text-white outline-none focus:ring-2 focus:ring-indigo-600 shadow-inner placeholder:text-slate-800" placeholder="••••••••" />
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-0 sm:pt-7">
                       <button 
                         onClick={() => onPushSync('scale_bridge')} 
                         disabled={!hbApiKey || isPushSyncingScale}
                         className="min-h-[88px] px-4 py-3 bg-white/5 hover:bg-indigo-600 rounded-2xl border border-white/5 flex flex-col items-center justify-center gap-2 text-white transition-all group/btn disabled:opacity-30"
                       >
                         <div className="flex items-center gap-3">
                           <i className={`fas ${isPushSyncingScale ? 'fa-spinner fa-spin' : 'fa-weight-scale'} text-sm`}></i>
                           <span className="text-[10px] font-black uppercase tracking-wide text-center leading-tight">
                             {language === 'de' ? 'Xiaomi Scale' : 'Xiaomi Scale'}
                           </span>
                         </div>
                         <span className="text-[8px] font-bold tracking-wide text-slate-300 text-center leading-tight">
                           {t.lastSyncLabel}: {formatSyncTimestamp(profile.healthBridgeTokens?.scale_last_sync)}
                         </span>
                       </button>
                       <button 
                         onClick={() => onPushSync('zepp_bridge')} 
                         disabled={!hbApiKey || isPushSyncingZepp}
                         className="min-h-[88px] px-4 py-3 bg-white/5 hover:bg-blue-600 rounded-2xl border border-white/5 flex flex-col items-center justify-center gap-2 text-white transition-all group/btn disabled:opacity-30"
                       >
                         <div className="flex items-center gap-3">
                           <i className={`fas ${isPushSyncingZepp ? 'fa-spinner fa-spin' : 'fa-heart-pulse'} text-sm`}></i>
                           <span className="text-[10px] font-black uppercase tracking-wide text-center leading-tight">
                             {language === 'de' ? 'Health Sync' : 'Health Sync'}
                           </span>
                         </div>
                         <span className="text-[8px] font-bold tracking-wide text-slate-300 text-center leading-tight">
                           {t.lastSyncLabel}: {formatSyncTimestamp(profile.healthBridgeTokens?.health_sync_last_sync)}
                         </span>
                       </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Apple Health Small */}
              <div className="bg-slate-900/50 p-8 rounded-[2.5rem] border border-white/5 flex items-center justify-between group hover:border-white/20 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-slate-900 text-2xl"><i className="fab fa-apple"></i></div>
                  <div>
                    <p className="font-black text-[11px] uppercase tracking-widest text-white">Apple Health</p>
                    <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">XML Upload</p>
                  </div>
                </div>
                <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 bg-white/5 hover:bg-indigo-600 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white border border-white/5 transition-all">
                  <i className="fas fa-upload text-sm"></i>
                </button>
              </div>

               {/* Google Fit Small */}
               <div className="bg-slate-900/50 p-8 rounded-[2.5rem] border border-white/5 flex items-center justify-between group hover:border-emerald-500/20 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-emerald-500 text-2xl border border-white/5"><i className="fab fa-google text-emerald-500"></i></div>
                  <div>
                    <p className="font-black text-[11px] uppercase tracking-widest text-white">Google Fit</p>
                    <p className={`text-[8px] font-black uppercase tracking-widest ${sessionStorage.getItem('google_fit_token') ? 'text-emerald-500' : 'text-slate-600'}`}>
                      {sessionStorage.getItem('google_fit_token') ? 'Live Stream' : 'Offline'}
                    </p>
                  </div>
                </div>
                <button onClick={onSync} className="w-12 h-12 bg-white/5 hover:bg-emerald-600 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white border border-white/5 transition-all">
                  <i className="fas fa-sync text-sm"></i>
                </button>
              </div>
            </div>

            <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-white/5 space-y-6">
              <div>
                <p className="text-cyan-400 text-[10px] font-black uppercase tracking-[0.3em] mb-2">{t.sourcePriorityTitle}</p>
                <h4 className="text-xl font-black text-white uppercase tracking-tight">{t.sourcePriorityTitle}</h4>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-2">{t.sourcePrioritySub}</p>
                <p className="text-xs text-slate-400 mt-4 leading-relaxed">{t.sourceFallbackHint}</p>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">{t.sourceOnlyActiveHint}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {HEALTH_SOURCE_METRICS.map((metricKey) => {
                  const availableSources = getAvailableSourcesForMetric(metricKey);
                  const currentValue = editProfile.healthSourcePreferences?.[metricKey] || DEFAULT_HEALTH_SOURCE_PREFERENCES[metricKey];
                  const selectValue = availableSources.includes(currentValue) ? currentValue : (availableSources[0] || '');

                  // Skip metrics with no sources
                  if (availableSources.length === 0) return null;

                  // Single source: auto-assign, just show info
                  if (availableSources.length === 1) {
                    return (
                      <div key={metricKey} className="space-y-3">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">
                          {t.metricSourceLabels[metricKey]}
                        </label>
                        <div className="w-full px-5 py-4 bg-slate-950/50 border border-white/5 rounded-2xl text-xs font-black text-slate-400 flex items-center gap-2">
                          <i className="fas fa-link text-[10px] text-emerald-500"></i>
                          {t.sourcesMap[availableSources[0]]}
                        </div>
                      </div>
                    );
                  }

                  // Multiple sources: show selector
                  return (
                    <div key={metricKey} className="space-y-3">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">
                        {t.metricSourceLabels[metricKey]} <span className="text-cyan-400">({availableSources.length} {language === 'de' ? 'Quellen' : 'sources'})</span>
                      </label>
                      <select
                        value={selectValue}
                        onChange={(e) =>
                          setEditProfile((prev) => ({
                            ...prev,
                            healthSourcePreferences: {
                              ...(prev.healthSourcePreferences || {}),
                              [metricKey]: e.target.value as HealthDataSource,
                            },
                          }))
                        }
                        className="w-full px-5 py-4 bg-slate-950 border border-cyan-500/20 rounded-2xl focus:ring-2 focus:ring-cyan-600 outline-none font-black text-white text-xs transition-all appearance-none cursor-pointer"
                      >
                        {availableSources.map((sourceKey) => (
                          <option key={sourceKey} value={sourceKey}>
                            {t.sourcesMap[sourceKey]}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-red-500/10 border border-red-500/20 rounded-[2.5rem] p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-red-500/15 rounded-2xl flex items-center justify-center text-red-400 text-xl shrink-0">
                  <i className="fas fa-triangle-exclamation"></i>
                </div>
                <div>
                  <h4 className="text-white font-black uppercase tracking-tight text-sm">{t.resetAllDataTitle}</h4>
                  <p className="text-red-200/80 text-xs mt-3 max-w-2xl">{t.resetAllDataSub}</p>
                </div>
              </div>
              <button
                onClick={handleResetAllData}
                className="px-8 py-4 bg-red-500/15 hover:bg-red-500 text-red-200 hover:text-white rounded-2xl border border-red-400/20 font-black uppercase tracking-widest text-[10px] transition-all"
              >
                <i className="fas fa-trash-can mr-2"></i>
                {t.resetAllData}
              </button>
            </div>
          </div>
        </div>
      </div>}

      {showTechnicalSection && <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xml,.zip" className="hidden" />}
      {showTechnicalSection && isParsingApple && (
        <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center animate-fade-in">
          <div className="w-24 h-24 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin mb-10 shadow-[0_0_50px_rgba(79,70,229,0.3)]"></div>
          <p className="text-white font-black uppercase tracking-[0.5em] text-xs animate-pulse">Decrypting Health Data Packet...</p>
        </div>
      )}
    </div>
  );
};

export default SettingsTab;
