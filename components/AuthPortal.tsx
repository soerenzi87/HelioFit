
import React, { useState, useEffect } from 'react';
import { initGoogleLogin, renderGoogleButton } from '../services/authService';
import { Language } from '../types';

interface AuthPortalProps {
  onLogin: (user: { email: string; name: string; isGoogle: boolean; password?: string }) => void | Promise<void>;
  onRegister: () => void;
  language: Language;
  isApprovalPending?: boolean;
}

type AuthView = 'initial' | 'email-login' | 'register' | 'pending-approval';

const AuthPortal: React.FC<AuthPortalProps> = ({ onLogin, onRegister, language, isApprovalPending }) => {
  const [view, setView] = useState<AuthView>('initial');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    if (isApprovalPending) {
      setView('pending-approval');
    }
  }, [isApprovalPending]);

  useEffect(() => {
    if (view === 'initial' || view === 'email-login') {
      initGoogleLogin(async (user) => {
        setIsLoggingIn(true);
        try { await onLogin({ ...user, isGoogle: true }); } finally { setIsLoggingIn(false); }
      });
      renderGoogleButton('google-signin-btn');
    }
  }, [view, onLogin]);

  const t = language === 'de' ? {
    title: 'HelioFit AI',
    sub: 'Intelligente Performance-Analyse',
    tagline: 'Personalized Excellence.',
    googleBtn: 'Mit Google anmelden',
    emailBtn: 'Mit E-Mail anmelden',
    registerBtn: 'Neues Konto erstellen',
    or: 'ODER',
    backBtn: 'Zurück',
    loginBtn: 'Anmelden',
    emailPlaceholder: 'E-Mail Adresse',
    passwordPlaceholder: 'Passwort',
    error: 'Ungültige Anmeldedaten',
    pendingTitle: 'Konto wartet auf Freigabe',
    pendingMsg: 'Dein Konto wurde erfolgreich erstellt. Ein Administrator muss dich nun freischalten, bevor du die App nutzen kannst.',
    pendingBack: 'Zurück zur Anmeldung',
    securityEncryption: 'Ende-zu-Ende-Verschlüsselung',
    securityIdentity: 'Sichere Identität',
    securityAi: 'Helio KI-gestützt',
    securityProtocol: 'Sicheres Helio Cloud-Protokoll',
  } : {
    title: 'HelioFit AI',
    sub: 'Intelligent Performance Analysis',
    tagline: 'Personalized Excellence.',
    googleBtn: 'Sign in with Google',
    emailBtn: 'Sign in with Email',
    registerBtn: 'Create new account',
    or: 'OR',
    backBtn: 'Back',
    loginBtn: 'Sign In',
    emailPlaceholder: 'Email Address',
    passwordPlaceholder: 'Password',
    error: 'Invalid credentials',
    pendingTitle: 'Account Pending Approval',
    pendingMsg: 'Your account has been created. An administrator must approve your account before you can use the app.',
    pendingBack: 'Back to Login',
    securityEncryption: 'End-to-End Encryption',
    securityIdentity: 'Secure Identity',
    securityAi: 'Helio AI Powered',
    securityProtocol: 'Secure Helio Cloud Protocol',
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email && password) {
      setIsLoggingIn(true);
      try { await onLogin({ email, name: email.split('@')[0], isGoogle: false, password }); } finally { setIsLoggingIn(false); }
    } else {
      setError(t.error);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-[#0a0c10] flex items-center justify-center p-6 animate-fade-in overflow-hidden">
      {/* Premium Background Elements */}
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <div className="absolute -top-20 -left-20 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute -bottom-20 -right-20 w-[600px] h-[600px] bg-amber-600/10 rounded-full blur-[120px]"></div>
        
        {/* Animated Grid */}
        <div className="absolute inset-0 bg-[url('https://grain-y.com/assets/images/noise.png')] opacity-[0.03] mix-blend-overlay"></div>
        <div className="grid grid-cols-12 h-full w-full opacity-5">
          {Array.from({ length: 144 }).map((_, i) => (
            <div key={i} className="border-[0.5px] border-white/10 h-20"></div>
          ))}
        </div>
      </div>

      <div className="w-full max-w-lg bg-[#1a1f26]/80 backdrop-blur-3xl border border-white/5 rounded-[2rem] sm:rounded-[4rem] p-6 sm:p-10 lg:p-14 shadow-[0_50px_100px_rgba(0,0,0,0.5)] relative overflow-hidden transition-all duration-700">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-indigo-600/50 to-transparent"></div>
        
        <div className="text-center mb-8 sm:mb-12">
          <div className="w-16 h-16 sm:w-24 sm:h-24 bg-white rounded-[1.5rem] sm:rounded-[2.5rem] flex items-center justify-center text-slate-900 text-2xl sm:text-4xl font-black mx-auto mb-6 sm:mb-10 shadow-[0_20px_40px_rgba(255,255,255,0.1)] italic relative group">
            <div className="absolute inset-0 bg-indigo-600 rounded-[1.5rem] sm:rounded-[2.5rem] animate-ping opacity-10 group-hover:opacity-20 transition-opacity"></div>
            <span className="relative z-10">H</span>
          </div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">{t.title}</h2>
          <div className="flex flex-col items-center gap-3">
            <p className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.4em] mb-1">{t.sub}</p>
            <div className="h-0.5 w-12 bg-indigo-600/40 rounded-full"></div>
            <p className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] italic mt-2">{t.tagline}</p>
          </div>
        </div>

        <div className="space-y-6">
          {view === 'initial' && (
            <div className="space-y-6 animate-fade-in">
              <div id="google-signin-btn" className="w-full flex justify-center scale-110 mb-4 px-4 overflow-hidden rounded-2xl"></div>
              
              <div className="flex items-center gap-6 py-4 px-6">
                <div className="flex-grow h-[1px] bg-white/5"></div>
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest leading-none">{t.or}</span>
                <div className="flex-grow h-[1px] bg-white/5"></div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <button 
                  onClick={() => setView('email-login')}
                  className="w-full py-4 sm:py-6 bg-white/5 hover:bg-white/10 text-white rounded-2xl sm:rounded-[2rem] font-black uppercase tracking-widest text-[11px] transition-all flex items-center justify-center gap-4 border border-white/10 group shadow-xl"
                >
                  <i className="fas fa-envelope text-indigo-500 group-hover:scale-125 transition-transform"></i> {t.emailBtn}
                </button>

                <button 
                  onClick={onRegister}
                  className="w-full py-4 sm:py-6 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 rounded-2xl sm:rounded-[2rem] font-black uppercase tracking-widest text-[11px] transition-all flex items-center justify-center gap-4 border border-indigo-500/20 group"
                >
                  <i className="fas fa-user-plus group-hover:scale-125 transition-transform"></i> {t.registerBtn}
                </button>
              </div>
            </div>
          )}

          {view === 'email-login' && (
            <form onSubmit={handleEmailLogin} className="space-y-6 animate-fade-in">
              <div className="space-y-4">
                <div className="relative group">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-500 transition-colors">
                    <i className="fas fa-at"></i>
                  </div>
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.emailPlaceholder}
                    className="w-full pl-14 pr-6 py-5 bg-slate-900/50 border border-white/5 rounded-[1.5rem] focus:ring-2 focus:ring-indigo-600 outline-none font-black text-white transition-all text-sm placeholder:text-slate-700"
                    required
                  />
                </div>
                <div className="relative group">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-500 transition-colors">
                    <i className="fas fa-key"></i>
                  </div>
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t.passwordPlaceholder}
                    className="w-full pl-14 pr-6 py-5 bg-slate-900/50 border border-white/5 rounded-[1.5rem] focus:ring-2 focus:ring-indigo-600 outline-none font-black text-white transition-all text-sm placeholder:text-slate-700"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 animate-shake">
                  <i className="fas fa-triangle-exclamation text-red-500"></i>
                  <p className="text-red-400 text-[10px] font-black uppercase tracking-widest">{error}</p>
                </div>
              )}

              <button 
                type="submit"
                className="w-full py-4 sm:py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl sm:rounded-[2rem] font-black uppercase tracking-[0.2em] text-[12px] transition-all shadow-[0_20px_50px_rgba(79,70,229,0.3)] active:scale-95"
              >
                {t.loginBtn}
              </button>

              <button 
                type="button"
                onClick={() => setView('initial')}
                className="w-full py-2 text-slate-500 font-black uppercase tracking-widest text-[9px] hover:text-white transition-all flex items-center justify-center gap-3"
              >
                <i className="fas fa-arrow-left"></i> {t.backBtn}
              </button>
            </form>
          )}

          {view === 'pending-approval' && (
            <div className="text-center space-y-10 animate-fade-in py-6">
              <div className="w-20 h-20 sm:w-28 sm:h-28 bg-indigo-600/10 rounded-[2.5rem] flex items-center justify-center text-indigo-500 text-3xl sm:text-5xl mx-auto mb-8 border border-indigo-500/20 shadow-2xl animate-pulse">
                <i className="fas fa-clock"></i>
              </div>
              <div className="space-y-4">
                <h3 className="text-2xl font-black text-white uppercase tracking-tight">{t.pendingTitle}</h3>
                <p className="text-slate-400 text-xs font-medium leading-relaxed px-6">{t.pendingMsg}</p>
              </div>
              
              <button 
                onClick={() => {
                  window.location.reload(); 
                }}
                className="w-full py-4 sm:py-6 bg-white/5 hover:bg-white/10 text-white rounded-2xl sm:rounded-[2rem] font-black uppercase tracking-widest text-[11px] transition-all border border-white/10 shadow-xl mt-6"
              >
                <i className="fas fa-arrow-left"></i> {t.pendingBack}
              </button>
            </div>
          )}

          <div className="mt-8 sm:mt-14 pt-6 sm:pt-10 border-t border-white/5 text-center">
            <div className="flex justify-center gap-6 sm:gap-10 text-slate-700 text-lg mb-6">
              <i className="fas fa-shield-halved hover:text-indigo-500 transition-colors cursor-help" title={t.securityEncryption}></i>
              <i className="fas fa-fingerprint hover:text-indigo-500 transition-colors cursor-help" title={t.securityIdentity}></i>
              <i className="fas fa-microchip hover:text-indigo-500 transition-colors cursor-help" title={t.securityAi}></i>
            </div>
            <p className="text-[9px] text-slate-700 font-black uppercase tracking-[0.5em]">{t.securityProtocol}</p>
          </div>
        </div>
      </div>
    </div>
  );
};


export default AuthPortal;
