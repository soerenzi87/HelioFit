
import React, { useState, useRef } from 'react';
import { UserProfile, FitnessGoal, ActivityLevel, Language } from '../types';

interface UserProfileFormProps {
  onSubmit: (profile: UserProfile) => void;
  onCancel: () => void;
  language: Language;
}

const UserProfileForm: React.FC<UserProfileFormProps> = ({ onSubmit, onCancel, language }) => {
  const [profile, setProfile] = useState<UserProfile>({
    name: '', password: '', age: 30, weight: 75, height: 180, bodyFat: 20, gender: 'male',
    goals: [], activityLevel: ActivityLevel.MODERATE, profilePicture: ''
  });

  const t = language === 'de' ? {
    welcome: 'Neues Profil', 
    welcomeSub: 'Personalisiere deine Helio-Erfahrung', 
    nameLabel: 'E-Mail Adresse', 
    passwordLabel: 'Passwort',
    age: 'Alter', 
    gender: 'Geschlecht', 
    weight: 'Gewicht (kg)', 
    height: 'Größe (cm)', 
    bodyFat: 'Körperfett (%)', 
    activity: 'Aktivitätslevel', 
    goals: 'Primäre Fokus-Ziele', 
    submit: 'Profil aktivieren', 
    cancel: 'Abbrechen',
    alertName: 'Bitte eine gültige E-Mail Adresse eingeben.', 
    alertGoals: 'Bitte mindestens ein Ziel wählen.',
    genderMale: 'Männlich', genderFemale: 'Weiblich', genderOther: 'Andere',
    goalsMap: {
      [FitnessGoal.WEIGHT_LOSS]: 'Abnehmen', [FitnessGoal.MUSCLE_GAIN]: 'Muskelaufbau',
      [FitnessGoal.MAINTENANCE]: 'Erhaltung', [FitnessGoal.ATHLETIC_PERFORMANCE]: 'Performance',
      [FitnessGoal.FLEXIBILITY]: 'Mobilität', [FitnessGoal.ENDURANCE]: 'Ausdauer',
    },
    activityMap: {
      [ActivityLevel.SEDENTARY]: 'Sitzend', [ActivityLevel.MODERATE]: 'Moderat',
      [ActivityLevel.ACTIVE]: 'Aktiv', [ActivityLevel.VERY_ACTIVE]: 'Sehr Aktiv',
    }
  } : {
    welcome: 'New Profile', 
    welcomeSub: 'Personalize your Helio experience', 
    nameLabel: 'Email Address', passwordLabel: 'Password',
    age: 'Age', gender: 'Gender', weight: 'Weight (kg)', height: 'Height (cm)', bodyFat: 'Body Fat (%)', 
    activity: 'Activity Level', goals: 'Primary Focus Goals', submit: 'Activate Profile', cancel: 'Cancel',
    alertName: 'Please enter a valid email address.', alertGoals: 'Please select at least one goal.',
    genderMale: 'Male', genderFemale: 'Female', genderOther: 'Other',
    goalsMap: {
      [FitnessGoal.WEIGHT_LOSS]: 'Weight Loss', [FitnessGoal.MUSCLE_GAIN]: 'Muscle Gain',
      [FitnessGoal.MAINTENANCE]: 'Maintenance', [FitnessGoal.ATHLETIC_PERFORMANCE]: 'Performance',
      [FitnessGoal.FLEXIBILITY]: 'Mobility', [FitnessGoal.ENDURANCE]: 'Endurance',
    },
    activityMap: {
      [ActivityLevel.SEDENTARY]: 'Sedentary', [ActivityLevel.MODERATE]: 'Moderate',
      [ActivityLevel.ACTIVE]: 'Active', [ActivityLevel.VERY_ACTIVE]: 'Very Active',
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: ['gender', 'activityLevel', 'name', 'password'].includes(name) ? value : Number(value) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!profile.name || !emailRegex.test(profile.name)) return alert(t.alertName);
    if (profile.goals.length === 0) return alert(t.alertGoals);
    onSubmit(profile);
  };

  return (
    <div className="max-w-3xl mx-auto bg-[#1a1f26]/90 backdrop-blur-3xl rounded-[3.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.4)] overflow-hidden border border-white/5 my-10 animate-fade-in relative transition-all duration-500">
      {/* Premium Accents */}
      <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-indigo-600 to-transparent opacity-50"></div>
      
      <div className="p-10 lg:p-14 border-b border-white/5 flex justify-between items-start">
        <div className="space-y-3">
          <p className="text-indigo-500 text-[10px] font-black uppercase tracking-[0.4em] mb-1">Onboarding</p>
          <h2 className="text-4xl font-black text-white uppercase tracking-tighter leading-none">{t.welcome}</h2>
          <p className="text-slate-400 font-medium italic text-sm">{t.welcomeSub}</p>
        </div>
        <button 
          onClick={onCancel} 
          className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center hover:bg-red-500/20 text-slate-400 hover:text-red-500 transition-all border border-white/5 group"
        >
          <i className="fas fa-times text-2xl group-hover:rotate-90 transition-transform"></i>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-10 lg:p-14 space-y-12">
        {/* Core Credentials */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.nameLabel}</label>
            <div className="relative group">
              <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-500 transition-colors">
                <i className="fas fa-at"></i>
              </div>
              <input 
                type="text" 
                name="name" 
                value={profile.name} 
                onChange={handleChange} 
                className="w-full pl-14 pr-6 py-5 bg-slate-900 border border-white/5 rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none font-bold text-white shadow-inner transition-all" 
                required 
              />
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.passwordLabel}</label>
            <div className="relative group">
              <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-500 transition-colors">
                <i className="fas fa-key"></i>
              </div>
              <input 
                type="password" 
                name="password" 
                value={profile.password} 
                onChange={handleChange} 
                className="w-full pl-14 pr-6 py-5 bg-slate-900 border border-white/5 rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none font-bold text-white shadow-inner transition-all" 
                required 
              />
            </div>
          </div>
        </div>

        {/* Biometrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.age}</label>
            <input type="number" name="age" value={profile.age} onChange={handleChange} className="w-full px-6 py-5 bg-slate-900/50 border border-white/5 rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none font-black text-white text-center transition-all" />
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.weight}</label>
            <div className="relative">
              <input type="number" name="weight" value={profile.weight} onChange={handleChange} className="w-full px-6 py-5 bg-slate-900/50 border border-white/5 rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none font-black text-white text-center transition-all" />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-600 uppercase">kg</span>
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.height}</label>
            <div className="relative">
              <input type="number" name="height" value={profile.height} onChange={handleChange} className="w-full px-6 py-5 bg-slate-900/50 border border-white/5 rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none font-black text-white text-center transition-all" />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-600 uppercase">cm</span>
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.bodyFat}</label>
            <div className="relative">
              <input type="number" name="bodyFat" value={profile.bodyFat} onChange={handleChange} className="w-full px-6 py-5 bg-slate-900/50 border border-white/5 rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none font-black text-white text-center transition-all" />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-600 uppercase">%</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.gender}</label>
            <select name="gender" value={profile.gender} onChange={handleChange} className="w-full px-6 py-5 bg-slate-900/50 border border-white/5 rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none font-black text-white transition-all appearance-none cursor-pointer">
              <option value="male">{t.genderMale}</option>
              <option value="female">{t.genderFemale}</option>
              <option value="other">{t.genderOther}</option>
            </select>
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.activity}</label>
            <select name="activityLevel" value={profile.activityLevel} onChange={handleChange} className="w-full px-6 py-5 bg-slate-900/50 border border-white/5 rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none font-black text-white transition-all appearance-none cursor-pointer">
              {Object.entries(t.activityMap).map(([key, val]) => (
                <option key={key} value={key}>{val}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Goals Section */}
        <div className="space-y-6">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.goals}</label>
          <div className="flex flex-wrap gap-3">
            {Object.values(FitnessGoal).map(goal => {
              const isActive = profile.goals.includes(goal);
              return (
                <button 
                  key={goal} 
                  type="button" 
                  onClick={() => setProfile(prev => ({ ...prev, goals: prev.goals.includes(goal) ? prev.goals.filter(g => g !== goal) : [...prev.goals, goal] }))} 
                  className={`px-6 py-4 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all ${
                    isActive 
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-[0_10px_30px_rgba(79,70,229,0.3)]' 
                      : 'bg-white/5 border-white/5 text-slate-500 hover:border-white/10 hover:text-slate-300'
                  }`}
                >
                  {t.goalsMap[goal]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-10">
          <button 
            type="submit" 
            className="w-full bg-indigo-600 text-white py-8 rounded-[2.5rem] font-black text-2xl hover:bg-indigo-500 transition-all shadow-[0_20px_60px_rgba(79,70,229,0.4)] uppercase tracking-[0.1em] transform hover:-translate-y-1 active:scale-[0.98] border border-indigo-400/20"
          >
            {t.submit}
          </button>
        </div>
      </form>
    </div>
  );
};


export default UserProfileForm;
