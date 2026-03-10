
import React, { useState, useRef } from 'react';
import { UserProfile, HealthData, Language } from '../types';
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
  onUploadData: (data: HealthData, fileName: string) => void;
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
  onUploadData, 
  isLoading, 
  language 
}) => {
  const [withingsClientId, setWithingsClientId] = useState(profile.withingsConfig?.clientId || '');
  const [withingsClientSecret, setWithingsClientSecret] = useState(profile.withingsConfig?.clientSecret || '');
  const [hbBaseUrl, setHbBaseUrl] = useState(profile.healthBridgeConfig?.baseUrl || 'https://health.soerenzieger.de');
  const [hbUsername, setHbUsername] = useState(profile.healthBridgeConfig?.username || '');
  const [hbPassword, setHbPassword] = useState(profile.healthBridgeConfig?.password || '');
  const [hbApiKey, setHbApiKey] = useState(profile.healthBridgeConfig?.apiKey || '');
  const [isParsingApple, setIsParsingApple] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const t = language === 'de' ? {
    title: 'Einstellungen & Schnittstellen',
    subtitle: 'Verwalte deine Datenquellen und technischen Integrationen',
    syncStatus: 'Datenquellen & Sync',
    googleStatus: 'Google Health Sync',
    withingsStatus: 'Withings API Sync',
    healthBridgeStatus: 'HealthBridge API Sync',
    healthBridgeBtn: 'HealthBridge Sync',
    resetSync: 'Verbindung trennen',
    googleActive: 'Verbunden & Live',
    googleInactive: 'Nicht verbunden',
    reUpload: 'Datei aktualisieren',
    withingsBtn: 'Withings Sync',
    update: 'Aktualisieren',
    syncBtn: 'Google Health Sync',
    appleBtn: 'Apple Health Upload',
    noSyncSub: 'Lade deinen Apple Health Export hoch oder verbinde Google Health.',
    save: 'Konfiguration Speichern'
  } : {
    title: 'Settings & Interfaces',
    subtitle: 'Manage your data sources and technical integrations',
    syncStatus: 'Data Sources',
    googleStatus: 'Google Health Sync',
    withingsStatus: 'Withings API Sync',
    healthBridgeStatus: 'HealthBridge API Sync',
    healthBridgeBtn: 'HealthBridge Sync',
    resetSync: 'Disconnect Connection',
    googleActive: 'Connected & Live',
    googleInactive: 'Not connected',
    reUpload: 'Update file',
    withingsBtn: 'Withings Sync',
    update: 'Update',
    syncBtn: 'Google Health Sync',
    appleBtn: 'Apple Health Upload',
    noSyncSub: 'Upload Apple Health export or connect Google Health.',
    save: 'Save Configuration'
  };

  return (
    <div className="space-y-8 pb-20 animate-fade-in">
      <div className="space-y-2">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">{t.title}</h2>
        <p className="text-slate-500 font-medium">{t.subtitle}</p>
      </div>

      <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-slate-100 shadow-xl space-y-8">
        <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
          <i className="fas fa-plug text-emerald-500"></i> {t.syncStatus}
        </h4>
        
        <div className="grid grid-cols-1 gap-6">
          {/* Apple Health */}
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center"><i className="fab fa-apple text-xl text-slate-900"></i></div>
                <p className="font-black text-sm uppercase tracking-widest text-slate-900">Apple Health (Historical)</p>
              </div>
              <button onClick={() => fileInputRef.current?.click()} className="text-[9px] font-black uppercase text-indigo-700 bg-indigo-50 px-4 py-2 rounded-xl hover:bg-indigo-100 border border-indigo-100">{t.reUpload}</button>
            </div>
            {healthData?.sources?.appleFiles && healthData.sources.appleFiles.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {healthData.sources.appleFiles.map(f => (
                  <span key={f} className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 flex items-center gap-2 shadow-sm">
                    <i className="fas fa-file-circle-check text-emerald-500"></i> {f}
                  </span>
                ))}
              </div>
            ) : <p className="text-[10px] italic text-slate-500 font-medium">{t.noSyncSub}</p>}
          </div>

          {/* Google Fit */}
          <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center"><i className="fab fa-google text-xl text-emerald-600"></i></div>
                <div>
                  <p className="font-black text-sm uppercase tracking-widest text-emerald-900">{t.googleStatus}</p>
                  <p className={`text-[9px] font-bold uppercase tracking-widest ${sessionStorage.getItem('google_fit_token') ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {sessionStorage.getItem('google_fit_token') ? t.googleActive : t.googleInactive}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {sessionStorage.getItem('google_fit_token') && (
                  <button 
                    onClick={onResetSync} 
                    className="flex-1 sm:flex-none text-[9px] font-black uppercase text-red-500 bg-red-50 border border-red-100 hover:bg-red-500 hover:text-white transition-all px-4 py-2 rounded-xl"
                  >
                    {t.resetSync}
                  </button>
                )}
                <button onClick={onSync} className="flex-1 sm:flex-none text-[9px] font-black uppercase text-white bg-emerald-600 px-6 py-2 rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-100 border border-emerald-500">{t.syncBtn}</button>
              </div>
            </div>
          </div>

          {/* Withings */}
          <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center"><i className="fas fa-weight-scale text-xl text-blue-600"></i></div>
                <div>
                  <p className="font-black text-sm uppercase tracking-widest text-blue-900">{t.withingsStatus}</p>
                  <p className={`text-[9px] font-bold uppercase tracking-widest ${profile.withingsTokens ? 'text-blue-600' : 'text-slate-400'}`}>
                    {profile.withingsTokens ? t.googleActive : t.googleInactive}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {profile.withingsTokens && (
                  <button 
                    onClick={onResetWithings} 
                    className="flex-1 sm:flex-none text-[9px] font-black uppercase text-red-500 bg-red-50 border border-red-100 hover:bg-red-500 hover:text-white transition-all px-4 py-2 rounded-xl"
                  >
                    {t.resetSync}
                  </button>
                )}
                <button 
                  onClick={onSyncWithings} 
                  disabled={!withingsClientId || !withingsClientSecret}
                  className="flex-1 sm:flex-none text-[9px] font-black uppercase text-white bg-blue-600 px-6 py-2 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-100 border border-blue-500 disabled:opacity-50"
                >
                  {profile.withingsTokens ? t.update : t.withingsBtn}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-blue-900 uppercase tracking-widest ml-1">Client ID</label>
                <input 
                  type="text" 
                  value={withingsClientId}
                  onChange={(e) => setWithingsClientId(e.target.value)}
                  placeholder="Withings Client ID"
                  className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-blue-900 uppercase tracking-widest ml-1">Client Secret</label>
                <input 
                  type="password" 
                  value={withingsClientSecret}
                  onChange={(e) => setWithingsClientSecret(e.target.value)}
                  placeholder="Withings Client Secret"
                  className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            <div className="mt-4 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
              <label className="text-[9px] font-black text-blue-900 uppercase tracking-widest block mb-1">Current Callback URL (Copy to Withings Dashboard)</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white px-2 py-1 rounded border border-blue-100 text-[10px] font-mono text-blue-700 break-all">
                  {`${window.location.origin}/api/auth/withings/callback`}
                </code>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/api/auth/withings/callback`);
                  }}
                  className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                  title="Copy to clipboard"
                >
                  <i className="fas fa-copy"></i>
                </button>
              </div>
            </div>
            
            <button 
              onClick={() => onUpdateWithingsConfig(withingsClientId, withingsClientSecret)}
              className="mt-4 w-full py-2 bg-white border border-blue-200 text-blue-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-sm"
            >
              <i className="fas fa-save mr-1"></i> {t.save}
            </button>
          </div>

          {/* HealthBridge */}
          <div className="bg-purple-50 p-6 rounded-3xl border border-purple-100">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center"><i className="fas fa-bridge text-xl text-purple-600"></i></div>
                <div>
                  <p className="font-black text-sm uppercase tracking-widest text-purple-900">{t.healthBridgeStatus}</p>
                  <p className={`text-[9px] font-bold uppercase tracking-widest ${profile.healthBridgeTokens ? 'text-purple-600' : 'text-slate-400'}`}>
                    {profile.healthBridgeTokens ? t.googleActive : t.googleInactive}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {profile.healthBridgeTokens && (
                  <button 
                    onClick={onResetHealthBridge} 
                    className="flex-1 sm:flex-none text-[9px] font-black uppercase text-red-500 bg-red-50 border border-red-100 hover:bg-red-500 hover:text-white transition-all px-4 py-2 rounded-xl"
                  >
                    {t.resetSync}
                  </button>
                )}
                <button 
                  onClick={onSyncHealthBridge} 
                  disabled={!hbBaseUrl || !hbUsername}
                  className="flex-1 sm:flex-none text-[9px] font-black uppercase text-white bg-purple-600 px-6 py-2 rounded-xl hover:bg-purple-700 shadow-lg shadow-purple-100 border border-purple-500 disabled:opacity-50"
                >
                  {profile.healthBridgeTokens ? t.update : t.healthBridgeBtn}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-purple-900 uppercase tracking-widest ml-1">Base URL</label>
                <input 
                  type="text" 
                  value={hbBaseUrl}
                  onChange={(e) => setHbBaseUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-white border border-purple-100 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-purple-900 uppercase tracking-widest ml-1">API Key (Recommended)</label>
                <input 
                  type="password" 
                  value={hbApiKey}
                  onChange={(e) => setHbApiKey(e.target.value)}
                  placeholder="API Key"
                  className="w-full bg-white border border-purple-100 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-purple-900 uppercase tracking-widest ml-1">Username (Fallback)</label>
                <input 
                  type="text" 
                  value={hbUsername}
                  onChange={(e) => setHbUsername(e.target.value)}
                  placeholder="Username"
                  className="w-full bg-white border border-purple-100 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-purple-900 uppercase tracking-widest ml-1">Password (Fallback)</label>
                <input 
                  type="password" 
                  value={hbPassword}
                  onChange={(e) => setHbPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full bg-white border border-purple-100 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>
            </div>
            
            <button 
              onClick={() => onUpdateHealthBridgeConfig(hbBaseUrl, hbUsername, hbPassword, hbApiKey)}
              className="mt-4 w-full py-2 bg-white border border-purple-200 text-purple-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all shadow-sm"
            >
              <i className="fas fa-save mr-1"></i> {t.save}
            </button>
          </div>
        </div>
      </div>
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xml,.zip" className="hidden" />
      {isParsingApple && (
        <div className="fixed inset-0 z-[200] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mb-6"></div>
          <p className="text-slate-500 font-black uppercase tracking-widest text-[10px] animate-pulse">{t.appleBtn}...</p>
        </div>
      )}
    </div>
  );
};

export default SettingsTab;
