
import React, { useState, useRef } from 'react';
import { UserProfile, HealthData, Language, FitnessGoal, ActivityLevel } from '../types';
import { processAppleHealthFile } from '../services/appleHealthService';

interface SettingsTabProps {
  profile: UserProfile;
  healthData: HealthData | null;
  onSync: () => void;
  onResetSync: () => void;
  onSyncWithings: () => void;
  onResetWithings: () => void;
  onUpdateWithingsConfig: (clientId: string, clientSecret: string) => void;
  onSyncHealthBridge: () => void;
  onResetHealthBridge: () => void;
  onUpdateHealthBridgeConfig: (baseUrl: string, username?: string, password?: string, apiKey?: string) => void;
  onPushSync: (appType: 'scale_bridge' | 'zepp_bridge', mode?: 'history') => void;
  isPushSyncingScale: boolean;
  isPushSyncingZepp: boolean;
  onUploadData: (data: HealthData, fileName: string) => void;
  onUpdateProfile: (profile: UserProfile) => void;
  isLoading: boolean;
  language: Language;
}

const SettingsTab: React.FC<SettingsTabProps> = ({ 
  profile, 
  healthData, 
  onSync, 
  onResetSync, 
  onSyncWithings, 
  onResetWithings, 
  onUpdateWithingsConfig, 
  onSyncHealthBridge,
  onResetHealthBridge,
  onUpdateHealthBridgeConfig,
  onPushSync,
  isPushSyncingScale,
  isPushSyncingZepp,
  onUploadData,
  onUpdateProfile,
  isLoading,
  language
}) => {
  // Profile State
  const [editProfile, setEditProfile] = useState<UserProfile>({ ...profile });
  const [withingsClientId, setWithingsClientId] = useState(profile.withingsConfig?.clientId || '');
  const [withingsClientSecret, setWithingsClientSecret] = useState(profile.withingsConfig?.clientSecret || '');
  const [hbBaseUrl, setHbBaseUrl] = useState(profile.healthBridgeConfig?.baseUrl || 'https://health.soerenzieger.de');
  const [hbUsername, setHbUsername] = useState(profile.healthBridgeConfig?.username || '');
  const [hbPassword, setHbPassword] = useState(profile.healthBridgeConfig?.password || '');
  const [hbApiKey, setHbApiKey] = useState(profile.healthBridgeConfig?.apiKey || '');
  
  // AI Config State
  const [geminiKey, setGeminiKey] = useState(profile.aiConfig?.geminiKey || '');
  const [openaiKey, setOpenaiKey] = useState(profile.aiConfig?.openaiKey || '');
  const [claudeKey, setClaudeKey] = useState(profile.aiConfig?.claudeKey || '');

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
      alert("Fehler beim Verarbeiten.");
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
      aiConfig: { 
        geminiKey, 
        openaiKey, 
        claudeKey, 
        preferredProvider: profile.aiConfig?.preferredProvider || 'gemini' 
      } 
    });
    alert(language === 'de' ? 'Profil gespeichert!' : 'Profile saved!');
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
    syncTitle: 'Datenquellen / Sync',
    syncSub: 'Verwalte deine Gesundheitsdaten und automatische Synchronisation',
    googleStatus: 'Google Health Sync',
    withingsStatus: 'Withings API Sync',
    healthBridgeStatus: 'HealthBridge API Sync',
    resetSync: 'Verbindung trennen',
    googleActive: 'Verbunden & Live',
    googleInactive: 'Nicht verbunden',
    reUpload: 'Datei aktualisieren',
    withingsBtn: 'Withings Sync',
    update: 'Aktualisieren',
    syncBtn: 'Google Health Sync',
    appleBtn: 'Apple Health Upload',
    noSyncSub: 'Lade deinen Apple Health Export hoch oder verbinde Google Health.',
    save: 'Speichern',
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
    syncTitle: 'Data Sources / Sync',
    syncSub: 'Manage your health data and automatic synchronization',
    googleStatus: 'Google Health Sync',
    withingsStatus: 'Withings API Sync',
    healthBridgeStatus: 'HealthBridge API Sync',
    resetSync: 'Disconnect',
    googleActive: 'Connected & Live',
    googleInactive: 'Not connected',
    reUpload: 'Update file',
    withingsBtn: 'Withings Sync',
    update: 'Update',
    syncBtn: 'Google Health Sync',
    appleBtn: 'Apple Health Upload',
    noSyncSub: 'Upload Apple Health export or connect Google Health.',
    save: 'Save',
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

  return (
    <div className="space-y-12 pb-32 animate-fade-in relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-3">
          <p className="text-indigo-500 text-[10px] font-black uppercase tracking-[0.4em] mb-1">Configuration</p>
          <h2 className="text-6xl font-black text-white tracking-tighter uppercase leading-none">{t.title}</h2>
          <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-xs">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="px-6 py-3 bg-white/5 border border-white/5 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
            System Active
          </div>
        </div>
      </div>

      {/* ── PROFILE PERSONALIZATION ───────────────────────────────────── */}
      <div className="bg-[#1a1f26]/80 backdrop-blur-3xl rounded-[3.5rem] p-10 lg:p-14 shadow-[0_50px_100px_rgba(0,0,0,0.5)] border border-white/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-12 opacity-5 text-[15rem] pointer-events-none translate-x-12 -translate-y-12 group-hover:text-indigo-500 transition-colors">
          <i className="fas fa-user-gear"></i>
        </div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 mb-16 relative z-10">
          <div className="space-y-4">
            <span className="px-4 py-2 bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest">Security Level: High</span>
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
                 <i className="fas fa-circle-info text-indigo-500"></i> Identity Verification
               </p>
               <p className="text-xs text-slate-400 font-medium leading-relaxed italic">Your profile data is encrypted using end-to-end Helio Protocols.</p>
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
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
            {/* Gemini */}
            <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-white/5 space-y-6 group/ai hover:border-indigo-500/30 transition-all">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-indigo-600/10 rounded-[1.25rem] border border-indigo-500/20 flex items-center justify-center text-indigo-500 text-xl font-black italic">
                    <i className="fas fa-sparkles"></i>
                  </div>
                  <div>
                    <p className="font-black text-sm uppercase tracking-widest text-white">Google Gemini</p>
                    <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Active Provider</p>
                  </div>
                </div>
                {geminiKey && <i className="fas fa-check-circle text-emerald-500 text-lg"></i>}
              </div>
              <div className="space-y-3">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Master API Key</label>
                <div className="relative group/key">
                   <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within/key:text-indigo-500 transition-colors">
                    <i className="fas fa-key"></i>
                  </div>
                  <input 
                    type="password" 
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="AIzaSyXXXXXXXXXXXXXXXXXXXXXXXX"
                    className="w-full bg-slate-950 border border-white/5 rounded-2xl pl-12 pr-6 py-4 text-xs font-black text-white outline-none focus:ring-2 focus:ring-indigo-600/50 transition-all shadow-inner"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* OpenAI Placeholder */}
              <div className="bg-slate-900 border border-white/5 p-6 rounded-[2rem] opacity-40 group hover:opacity-100 transition-all grayscale hover:grayscale-0">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-emerald-600/10 rounded-2xl border border-emerald-500/20 flex items-center justify-center text-emerald-500 text-xl">
                    <i className="fas fa-bolt"></i>
                  </div>
                  <div>
                    <p className="font-black text-[10px] uppercase tracking-widest text-white">OpenAI</p>
                    <p className="text-[7px] font-bold text-emerald-500 uppercase tracking-widest">v2.0 Beta</p>
                  </div>
                </div>
                <input 
                  type="password" 
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-slate-950 border border-white/5 rounded-xl px-4 py-3 text-[10px] font-black text-white outline-none cursor-not-allowed"
                  disabled
                />
              </div>

               {/* Claude Placeholder */}
               <div className="bg-slate-900 border border-white/5 p-6 rounded-[2rem] opacity-40 group hover:opacity-100 transition-all grayscale hover:grayscale-0">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-amber-600/10 rounded-2xl border border-amber-500/20 flex items-center justify-center text-amber-500 text-xl">
                    <i className="fas fa-ghost"></i>
                  </div>
                  <div>
                    <p className="font-black text-[10px] uppercase tracking-widest text-white">Claude</p>
                    <p className="text-[7px] font-bold text-amber-500 uppercase tracking-widest">Coming Soon</p>
                  </div>
                </div>
                <input 
                  type="password" 
                  value={claudeKey}
                  onChange={(e) => setClaudeKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full bg-slate-950 border border-white/5 rounded-xl px-4 py-3 text-[10px] font-black text-white outline-none cursor-not-allowed"
                  disabled
                />
              </div>
            </div>
            
            <button 
              onClick={handleUpdateProfile}
              className="w-full py-6 bg-slate-950 text-white rounded-[2rem] font-black uppercase tracking-widest text-[11px] hover:bg-black transition-all border border-white/10 shadow-2xl active:scale-95"
            >
              {t.save} Configuration
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
            <div className="bg-slate-950 p-10 rounded-[3rem] border border-indigo-500/20 shadow-2xl relative overflow-hidden group">
               <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <i className="fas fa-tower-broadcast text-7xl text-white"></i>
              </div>
              
              <div className="relative z-10 space-y-8">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-indigo-600/20 rounded-3xl flex items-center justify-center text-indigo-500 text-2xl border border-indigo-600/30">
                      <i className="fas fa-link"></i>
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-white uppercase tracking-tight">HealthBridge Core</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <div className={`w-2 h-2 rounded-full ${profile.healthBridgeTokens ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          {profile.healthBridgeTokens ? 'Cloud Connected' : 'Endpoint Offline'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 w-full sm:w-auto">
                    {profile.healthBridgeTokens && (
                      <button onClick={onResetHealthBridge} className="px-6 py-4 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-2xl font-black uppercase tracking-widest text-[9px] border border-red-500/20 transition-all">{t.resetSync}</button>
                    )}
                    <button 
                      onClick={() => onUpdateHealthBridgeConfig(hbBaseUrl, hbUsername, hbPassword, hbApiKey)}
                      className="flex-grow px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-widest text-[9px] shadow-xl border border-indigo-400/20 transition-all"
                    >
                      {t.save} Endpoint
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">Bridge Base URL</label>
                    <input type="text" value={hbBaseUrl} onChange={(e) => setHbBaseUrl(e.target.value)} className="w-full bg-slate-900 border border-white/5 rounded-2xl px-6 py-4 text-xs font-black text-white outline-none focus:ring-2 focus:ring-indigo-600 shadow-inner placeholder:text-slate-800" placeholder="https://..." />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">Access Token</label>
                      <input type="password" value={hbApiKey} onChange={(e) => setHbApiKey(e.target.value)} className="w-full bg-slate-900 border border-white/5 rounded-2xl px-6 py-4 text-xs font-black text-white outline-none focus:ring-2 focus:ring-indigo-600 shadow-inner placeholder:text-slate-800" placeholder="••••••••" />
                    </div>
                    <div className="flex gap-3 pt-7">
                       <button 
                         onClick={() => onPushSync('scale_bridge')} 
                         disabled={!hbApiKey || isPushSyncingScale}
                         className="flex-1 bg-white/5 hover:bg-indigo-600 rounded-2xl border border-white/5 flex items-center justify-center gap-3 text-white transition-all group/btn disabled:opacity-30"
                       >
                         <i className={`fas ${isPushSyncingScale ? 'fa-spinner fa-spin' : 'fa-weight-scale'} text-sm`}></i>
                         <span className="text-[9px] font-black uppercase tracking-widest">Xiaomi</span>
                       </button>
                       <button 
                         onClick={() => onPushSync('zepp_bridge')} 
                         disabled={!hbApiKey || isPushSyncingZepp}
                         className="flex-1 bg-white/5 hover:bg-blue-600 rounded-2xl border border-white/5 flex items-center justify-center gap-3 text-white transition-all group/btn disabled:opacity-30"
                       >
                         <i className={`fas ${isPushSyncingZepp ? 'fa-spinner fa-spin' : 'fa-heart-pulse'} text-sm`}></i>
                         <span className="text-[9px] font-black uppercase tracking-widest">Connect</span>
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
          </div>
        </div>
      </div>

      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xml,.zip" className="hidden" />
      {isParsingApple && (
        <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center animate-fade-in">
          <div className="w-24 h-24 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin mb-10 shadow-[0_0_50px_rgba(79,70,229,0.3)]"></div>
          <p className="text-white font-black uppercase tracking-[0.5em] text-xs animate-pulse">Decrypting Health Data Packet...</p>
        </div>
      )}
    </div>
  );
};

export default SettingsTab;
