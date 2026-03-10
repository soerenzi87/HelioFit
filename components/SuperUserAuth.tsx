
import React, { useState } from 'react';

interface SuperUserAuthProps {
  onUnlock: (password: string) => boolean;
  language: 'de' | 'en';
}

const SuperUserAuth: React.FC<SuperUserAuthProps> = ({ onUnlock, language }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const t = language === 'de' ? {
    title: 'HelioFit System-Lock',
    sub: 'Autorisierung erforderlich für verschlüsselten Zugriff',
    placeholder: 'Master-Passwort eingeben',
    unlock: 'System entsperren',
    error: 'Zugriff verweigert - Falsches Passwort'
  } : {
    title: 'HelioFit System Lock',
    sub: 'Authorization required for encrypted access',
    placeholder: 'Enter Master Password',
    unlock: 'Unlock System',
    error: 'Access Denied - Invalid Password'
  };

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUnlock(password)) {
      setError(false);
    } else {
      setError(true);
      setPassword('');
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-[#0a0c10] flex items-center justify-center p-6 animate-fade-in">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-orange-500/20 via-transparent to-transparent"></div>
        <div className="grid grid-cols-12 h-full w-full opacity-10">
          {Array.from({ length: 144 }).map((_, i) => (
            <div key={i} className="border-[0.5px] border-slate-700 h-16"></div>
          ))}
        </div>
      </div>

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-[2.5rem] sm:rounded-[3rem] p-6 sm:p-10 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden group">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-orange-500 to-transparent"></div>
        
        <div className="text-center mb-8 sm:mb-10">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-2xl sm:rounded-3xl flex items-center justify-center text-slate-900 text-3xl sm:text-4xl font-black mx-auto mb-6 sm:mb-8 shadow-[0_0_30px_rgba(255,255,255,0.1)] italic animate-pulse">H</div>
          <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tighter mb-3">{t.title}</h2>
          <p className="text-slate-500 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest px-2">{t.sub}</p>
        </div>

        <form onSubmit={handleUnlock} className="space-y-6">
          <div className="relative">
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.placeholder}
              className={`w-full px-4 sm:px-6 py-4 sm:py-5 bg-slate-800 border ${error ? 'border-red-500 ring-2 ring-red-500/20' : 'border-slate-700'} rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none font-bold text-white transition-all text-center tracking-[0.3em] sm:tracking-[0.5em] text-sm sm:text-base placeholder:tracking-normal placeholder:text-slate-600 placeholder:text-xs sm:placeholder:text-sm`}
              autoFocus
            />
            {error && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center mt-3 animate-bounce">{t.error}</p>}
          </div>
          
          <button 
            type="submit" 
            className="w-full py-5 bg-orange-600 hover:bg-orange-500 text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl transition-all transform hover:-translate-y-1 active:scale-[0.98] flex items-center justify-center gap-3"
          >
            <i className="fas fa-shield-halved"></i>
            {t.unlock}
          </button>
        </form>

        <div className="mt-10 pt-8 border-t border-slate-800 text-center">
          <div className="flex justify-center gap-4 text-slate-600 text-xs">
            <i className="fas fa-fingerprint"></i>
            <i className="fas fa-face-viewfinder"></i>
            <i className="fas fa-key"></i>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuperUserAuth;
