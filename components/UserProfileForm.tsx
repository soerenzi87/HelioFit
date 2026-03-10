
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
    welcome: 'Neues Profil erstellen', 
    welcomeSub: 'Gib deine Basisdaten ein, um personalisierte Analysen zu erhalten.', 
    nameLabel: 'Benutzername', 
    passwordLabel: 'Passwort',
    age: 'Alter', 
    gender: 'Geschlecht', 
    weight: 'Gewicht (kg)', 
    height: 'Größe (cm)', 
    bodyFat: 'Körperfett (%)', 
    activity: 'Aktivitätslevel', 
    goals: 'Fitness-Ziele', 
    submit: 'Profil anlegen & Starten', 
    cancel: 'Abbrechen',
    alertName: 'Bitte einen Namen wählen.', 
    alertGoals: 'Bitte mindestens ein Ziel wählen.',
    genderMale: 'Männlich', genderFemale: 'Weiblich', genderOther: 'Andere',
    goalsMap: {
      [FitnessGoal.WEIGHT_LOSS]: 'Abnehmen', [FitnessGoal.MUSCLE_GAIN]: 'Muskelaufbau',
      [FitnessGoal.MAINTENANCE]: 'Gewicht halten', [FitnessGoal.ATHLETIC_PERFORMANCE]: 'Athletik',
      [FitnessGoal.FLEXIBILITY]: 'Flexibilität', [FitnessGoal.ENDURANCE]: 'Ausdauer',
    },
    activityMap: {
      [ActivityLevel.SEDENTARY]: 'Sitzend', [ActivityLevel.MODERATE]: 'Moderat',
      [ActivityLevel.ACTIVE]: 'Aktiv', [ActivityLevel.VERY_ACTIVE]: 'Sehr Aktiv',
    }
  } : {
    welcome: 'Create New Profile', 
    welcomeSub: 'Enter your basic data to receive personalized analysis.', 
    nameLabel: 'Username', passwordLabel: 'Password',
    age: 'Age', gender: 'Gender', weight: 'Weight (kg)', height: 'Height (cm)', bodyFat: 'Body Fat (%)', 
    activity: 'Activity Level', goals: 'Fitness Goals', submit: 'Create & Start', cancel: 'Cancel',
    alertName: 'Please enter a name.', alertGoals: 'Please select at least one goal.',
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: ['gender', 'activityLevel', 'name', 'password'].includes(name) ? value : Number(value) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.name) return alert(t.alertName);
    if (profile.goals.length === 0) return alert(t.alertGoals);
    onSubmit(profile);
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 my-10 animate-fade-in">
      <div className="bg-slate-900 p-10 text-white flex justify-between items-center">
        <div><h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">{t.welcome}</h2><p className="opacity-70 text-sm">{t.welcomeSub}</p></div>
        <button onClick={onCancel} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"><i className="fas fa-times"></i></button>
      </div>
      <form onSubmit={handleSubmit} className="p-10 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.nameLabel}</label>
            <input type="text" name="name" value={profile.name} onChange={handleChange} className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none font-bold text-slate-900 shadow-sm" required />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.passwordLabel}</label>
            <input type="password" name="password" value={profile.password} onChange={handleChange} className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none font-bold text-slate-900 shadow-sm" required />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
          <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.age}</label><input type="number" name="age" value={profile.age} onChange={handleChange} className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none font-bold text-slate-900 shadow-sm" /></div>
          <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.weight}</label><input type="number" name="weight" value={profile.weight} onChange={handleChange} className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none font-bold text-slate-900 shadow-sm" /></div>
          <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.bodyFat}</label><input type="number" name="bodyFat" value={profile.bodyFat} onChange={handleChange} className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none font-bold text-slate-900 shadow-sm" /></div>
        </div>
        <div className="space-y-4">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.goals}</label>
          <div className="flex flex-wrap gap-2">
            {Object.values(FitnessGoal).map(goal => (
              <button key={goal} type="button" onClick={() => setProfile(prev => ({ ...prev, goals: prev.goals.includes(goal) ? prev.goals.filter(g => g !== goal) : [...prev.goals, goal] }))} className={`px-4 py-3 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${profile.goals.includes(goal) ? 'bg-orange-500 border-orange-500 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400 hover:border-orange-300'}`}>{t.goalsMap[goal]}</button>
            ))}
          </div>
        </div>
        <button type="submit" className="w-full bg-orange-600 text-white py-5 sm:py-6 rounded-[2rem] font-black text-lg sm:text-xl hover:bg-orange-700 transition-all shadow-xl uppercase tracking-widest transform hover:-translate-y-1">{t.submit}</button>
      </form>
    </div>
  );
};

export default UserProfileForm;
