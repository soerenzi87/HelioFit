
import React, { useState } from 'react';
import { Language } from '../types';

interface AuthScreenProps {
  onLogin: (username: string, password: string) => boolean;
  onRegister: () => void;
  onMockLogin: () => void;
  language: Language;
  existingUsers: string[];
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin, onRegister, onMockLogin, language, existingUsers }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const t = language === 'de' ? {
    loginTitle: 'Profilverwaltung',
    loginSub: 'Wählen Sie einen Benutzer oder legen Sie ein neues Profil an.',
    username: 'Benutzername',
    password: 'Profil-Passwort',
    loginBtn: 'Profil öffnen',
    registerBtn: 'Neuen Nutzer anlegen',
    mockBtn: 'Demo Modus (Mock-Daten)',
    error: 'Ungültiges Passwort für dieses Profil',
    selectUser: 'Gespeicherte Profile',
    noAccount: 'Weiterer Nutzer benötigt?',
    backup: 'Daten sichern',
    restore: 'Daten wiederherstellen',
    restoreSuccess: 'Daten erfolgreich wiederhergestellt!',
    restoreError: 'Fehler beim Wiederherstellen der Daten.'
  } : {
    loginTitle: 'Profile Management',
    loginSub: 'Select a user or create a new profile.',
    username: 'Username',
    password: 'Profile Password',
    loginBtn: 'Open Profile',
    registerBtn: 'Create New User',
    mockBtn: 'Demo Mode (Mock Data)',
    error: 'Invalid password for this profile',
    selectUser: 'Saved Profiles',
    noAccount: 'Need another user?',
    backup: 'Backup Data',
    restore: 'Restore Data',
    restoreSuccess: 'Data restored successfully!',
    restoreError: 'Error restoring data.'
  };

  const handleBackup = () => {
    const saved = localStorage.getItem('heliofit_manual_db_v1');
    if (!saved) return;
    const blob = new Blob([saved], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `heliofit_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        JSON.parse(content); // Validate JSON
        localStorage.setItem('heliofit_manual_db_v1', content);
        alert(t.restoreSuccess);
        window.location.reload();
      } catch (err) {
        alert(t.restoreError);
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const success = onLogin(username, password);
    if (!success) setError(t.error);
  };

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-xl bg-white rounded-[2.5rem] sm:rounded-[3rem] shadow-2xl p-6 sm:p-10 lg:p-14 border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] text-9xl pointer-events-none rotate-12"><i className="fas fa-users-gear"></i></div>
        
        <div className="text-center mb-10 sm:mb-12">
          <h2 className="text-xl sm:text-4xl font-black text-slate-900 uppercase tracking-tighter leading-tight mb-4">{t.loginTitle}</h2>
          <p className="text-slate-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-4 mb-6">{t.loginSub}</p>
          
          <div className="flex justify-center gap-4">
            <button onClick={handleBackup} className="text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-all flex items-center gap-2">
              <i className="fas fa-download"></i> {t.backup}
            </button>
            <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-all flex items-center gap-2 cursor-pointer">
              <i className="fas fa-upload"></i> {t.restore}
              <input type="file" className="hidden" accept=".json" onChange={handleRestore} />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="space-y-6">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.selectUser}</label>
            <div className="grid grid-cols-1 gap-3">
              {existingUsers.map(user => (
                <button 
                  key={user} 
                  onClick={() => { setUsername(user); setError(''); }} 
                  className={`flex items-center gap-4 p-5 rounded-2xl border transition-all text-left ${username === user ? 'bg-slate-900 border-slate-900 text-white shadow-xl scale-[1.02]' : 'bg-slate-50 border-slate-100 text-slate-600 hover:border-orange-300'}`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${username === user ? 'bg-white/10' : 'bg-white shadow-sm'}`}>
                    {user.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-black text-sm">{user}</span>
                  {username === user && <i className="fas fa-circle-check ml-auto text-orange-500"></i>}
                </button>
              ))}
            </div>
            
            <div className="pt-6 border-t border-slate-50">
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-4">{t.noAccount}</p>
              <button onClick={onRegister} className="w-full py-4 bg-orange-50 text-orange-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-orange-100 transition-all flex items-center justify-center gap-2">
                <i className="fas fa-user-plus"></i> {t.registerBtn}
              </button>
              <button onClick={onMockLogin} className="w-full py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-100 transition-all flex items-center justify-center gap-2 border border-indigo-100">
                <i className="fas fa-flask"></i> {t.mockBtn}
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 flex flex-col justify-center">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.username}</label>
                <input 
                  type="text" 
                  value={username} 
                  readOnly 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-slate-400 cursor-not-allowed outline-none" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.password}</label>
                <input 
                  type="password" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none font-bold text-slate-900 transition-all shadow-sm" 
                  required 
                  placeholder="••••••"
                />
              </div>
            </div>
            {error && <p className="text-red-600 text-[10px] font-black uppercase text-center bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}
            <button 
              type="submit" 
              disabled={!username}
              className={`w-full py-5 sm:py-6 rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl transition-all transform flex items-center justify-center gap-3 ${username ? 'bg-slate-900 text-white hover:bg-orange-600 hover:-translate-y-1' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
            >
              <i className="fas fa-door-open"></i>
              {t.loginBtn}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
