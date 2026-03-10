
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { WorkoutProgram, WorkoutSession, Exercise, ExistingWorkout, WorkoutLog, ExerciseLog, Language, UserProfile, WorkoutPreferences } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Bar, BarChart, ComposedChart, Legend, Cell } from 'recharts';
import { analyzeWorkoutProgress, suggestWorkoutPreferences, generateWorkoutCue } from '../services/geminiService';
import { exportWorkoutToICS } from '../services/calendarService';

declare global {
  interface Window {
    YT: any;
  }
}

interface WorkoutTabProps {
  workoutProgram: WorkoutProgram | null;
  workoutLogs: WorkoutLog[];
  onGenerateWorkout: (availableDays: string[], existing: ExistingWorkout[]) => void;
  onSaveLog: (log: WorkoutLog) => void;
  onUpdateProfile: (updated: UserProfile) => void;
  isLoading: boolean;
  language: Language;
  profile: UserProfile | null;
}

const DAYS_DE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const DAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const WorkoutTab: React.FC<WorkoutTabProps> = ({ workoutProgram, workoutLogs, onGenerateWorkout, onSaveLog, onUpdateProfile, isLoading, language, profile }) => {
  const [activeTab, setActiveTab] = useState<'plan' | 'stats'>('plan');
  const [selectedSession, setSelectedSession] = useState<WorkoutSession | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [availableDays, setAvailableDays] = useState<string[]>(profile?.workoutPreferences?.availableDays || []);
  const [existingWorkouts, setExistingWorkouts] = useState<ExistingWorkout[]>(profile?.workoutPreferences?.existingWorkouts || []);
  
  // States für feste Termine Eingabe
  const [newFixedDay, setNewFixedDay] = useState(DAYS_DE[0]);
  const [newFixedActivity, setNewFixedActivity] = useState('');

  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestionText, setSuggestionText] = useState<string | null>(null);

  const [isLiveSession, setIsLiveSession] = useState(false);
  const [currentLog, setCurrentLog] = useState<ExerciseLog[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>(workoutProgram?.id || 'current');

  // Timer states
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [restExerciseName, setRestExerciseName] = useState<string>('');

  // State for expanded history details
  const [expandedLogIdx, setExpandedLogIdx] = useState<number | null>(null);

  const [activeSet, setActiveSet] = useState<{exIdx: number, sIdx: number} | null>(null);
  const [selectedExerciseInfo, setSelectedExerciseInfo] = useState<Exercise | null>(null);

  useEffect(() => {
    let interval: any;
    if (restTimer !== null && restTimer > 0) {
      interval = setInterval(() => setRestTimer(prev => (prev !== null ? prev - 1 : null)), 1000);
    } else if (restTimer === 0) {
      handleRestEnd();
      setRestTimer(null);
    }
    return () => clearInterval(interval);
  }, [restTimer]);

  const playCue = async (text: string) => {
    try {
      const base64 = await generateWorkoutCue(text);
      if (base64) {
        const audio = new Audio(`data:audio/mp3;base64,${base64}`);
        await audio.play().catch(e => console.warn("Autoplay blocked or failed:", e));
      }
    } catch (e) {
      console.error("Failed to play cue:", e);
    }
  };

  const handleRestStart = (exName: string, restSeconds: number | string) => {
    const parsed = typeof restSeconds === 'string' ? parseInt(restSeconds, 10) : restSeconds;
    const duration = isNaN(parsed) ? 60 : parsed;
    setRestTimer(duration);
    setRestExerciseName(exName);
    playCue(language === 'de' ? `Satz beendet. Ruh dich aus für ${duration} Sekunden.` : `Set complete. Rest for ${duration} seconds.`);
  };

  const handleRestEnd = () => {
    setRestExerciseName('');
    playCue(language === 'de' ? `Pause vorbei. Nächster Satz!` : `Rest over. Next set!`);
  };

  // Sync local state to profile when it changes to persist across tab switches
  const updatePrefs = (updates: Partial<WorkoutPreferences>) => {
    if (!profile) return;
    const newPrefs = {
      availableDays: profile.workoutPreferences?.availableDays || [],
      existingWorkouts: profile.workoutPreferences?.existingWorkouts || [],
      ...updates
    };
    onUpdateProfile({
      ...profile,
      workoutPreferences: newPrefs
    });
  };

  const t = language === 'de' ? {
    plan: 'Trainingsplan', stats: 'Historie & Analyse', setup: 'Workout Engine', configSub: 'Trainingslogik anpassen', create: 'Neuen Plan generieren', adapt: 'Engine öffnen', focus: 'Fokus', start: 'Training starten', save: 'Session speichern', weight: 'Gewicht (kg)', reps: 'Wdh.', rest: 'Pause', export: 'Export', history: 'Wochen-Archiv', plannedVsActual: 'Soll vs. Ist', volume: 'Volumen-Trend', availability: 'Deine verfügbaren Tage', fixed: 'Feste Termine / Kurse', add: 'Termin hinzufügen', activityPlaceholder: 'z.B. Yoga Kurs, Fußball...',
    autoSuggest: 'KI-Vorschlag', suggesting: 'Analysiere Profil...'
  } : {
    plan: 'Workout Plan', stats: 'History & Analysis', setup: 'Workout Engine', configSub: 'Adjust training logic', create: 'Generate New Plan', adapt: 'Open Engine', focus: 'Focus', start: 'Start Workout', save: 'Save Session', weight: 'Weight (kg)', reps: 'Reps', rest: 'Rest', export: 'Export', history: 'Weekly Archive', plannedVsActual: 'Planned vs Actual', volume: 'Volume Trend', availability: 'Your available days', fixed: 'Fixed Appointments / Classes', add: 'Add Appointment', activityPlaceholder: 'e.g. Yoga Class, Soccer...',
    autoSuggest: 'AI Suggestion', suggesting: 'Analyzing Profile...'
  };

  const handleAutoSuggest = async () => {
    if (!profile) return;
    setIsSuggesting(true);
    try {
      const result = await suggestWorkoutPreferences(profile, existingWorkouts, language);
      setAvailableDays(result.availableDays);
      setSuggestionText(result.suggestion);
      updatePrefs({ availableDays: result.availableDays });
    } catch (e) {
      console.error(e);
    } finally {
      setIsSuggesting(false);
    }
  };

  const daysList = language === 'de' ? DAYS_DE : DAYS_EN;
  const planList = useMemo(() => profile?.workoutHistory || [], [profile]);

  const activePlan = useMemo(() => {
    if (selectedPlanId === 'current') return workoutProgram;
    return planList.find(p => p.id === selectedPlanId) || workoutProgram;
  }, [selectedPlanId, planList, workoutProgram]);

  const handleAddFixed = () => {
    if (newFixedActivity) {
      setExistingWorkouts([...existingWorkouts, { day: newFixedDay, activity: newFixedActivity }]);
      setNewFixedActivity('');
    }
  };

  const handleRemoveFixed = (idx: number) => {
    setExistingWorkouts(existingWorkouts.filter((_, i) => i !== idx));
  };

  if (isLoading) return <div className="flex flex-col items-center justify-center min-h-[500px]"><div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div><p className="mt-4 font-black uppercase text-[10px] text-slate-400">Helio-Engine optimiert Plan...</p></div>;

  if (isLiveSession && selectedSession) return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 animate-fade-in relative">
      <div className="bg-white rounded-[2.5rem] p-8 lg:p-12 shadow-2xl border border-slate-100 relative">
        <div className="flex justify-between items-center mb-10 pb-6 border-b border-slate-100">
          <div><p className="text-indigo-600 text-[10px] font-black uppercase tracking-widest mb-1">Live Training</p><h2 className="text-4xl font-black text-slate-900">{selectedSession.dayTitle}</h2></div>
          <div className="flex items-center gap-4">
            {restTimer !== null && (
              <div className="px-6 py-3 bg-orange-500 text-white rounded-2xl font-black text-xl animate-pulse">
                {Math.floor(restTimer / 60)}:{String(restTimer % 60).padStart(2, '0')}
              </div>
            )}
            <button onClick={() => setIsLiveSession(false)} className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400"><i className="fas fa-times text-xl"></i></button>
          </div>
        </div>

        {/* Rest Timer Overlay */}
        {restTimer !== null && (
          <div className="mb-10 p-8 bg-gradient-to-br from-orange-500 to-amber-500 rounded-3xl text-white text-center shadow-xl animate-fade-in">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-2">
              {language === 'de' ? 'Pause' : 'Rest'} — {restExerciseName}
            </p>
            <div className="text-7xl font-black tabular-nums animate-pulse">
              {Math.floor(restTimer / 60)}:{String(restTimer % 60).padStart(2, '0')}
            </div>
            <button 
              onClick={() => { setRestTimer(null); setRestExerciseName(''); }}
              className="mt-4 px-6 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/30 transition-all"
            >
              {language === 'de' ? 'Überspringen' : 'Skip'}
            </button>
          </div>
        )}

        <div className="space-y-12">
          {selectedSession.exercises.map((ex, exIdx) => (
            <div key={exIdx} className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-black text-slate-900">{ex.name}</h3>
                <button 
                  onClick={() => setSelectedExerciseInfo(ex)}
                  className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-indigo-100 hover:text-indigo-600 transition-all"
                >
                  <i className="fas fa-info text-[10px]"></i>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {currentLog[exIdx].sets.map((set, sIdx) => {
                  const isDone = set.weight > 0 && set.reps > 0;
                  return (
                    <div key={sIdx} className={`p-5 rounded-2xl border transition-all flex flex-col gap-4 ${isDone ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Satz {sIdx + 1}</span>
                        {isDone && <i className="fas fa-check-circle text-emerald-500"></i>}
                      </div>
                      <div className="flex gap-4">
                        <div className="flex-1"><label className="text-[8px] font-black text-slate-400 uppercase">{t.weight}</label><input type="number" placeholder={ex.suggestedWeight?.replace(/[^0-9.]/g, '') || ''} value={set.weight || ''} onChange={(e) => { const copy = [...currentLog]; copy[exIdx].sets[sIdx].weight = parseFloat(e.target.value) || 0; setCurrentLog(copy); }} className="w-full bg-transparent border-b border-slate-200 focus:border-indigo-500 outline-none font-black text-lg placeholder-slate-300" /></div>
                        <div className="flex-1"><label className="text-[8px] font-black text-slate-400 uppercase">{t.reps}</label><input type="text" placeholder={ex.reps || ''} value={set.reps || ''} onChange={(e) => { const copy = [...currentLog]; copy[exIdx].sets[sIdx].reps = parseFloat(e.target.value) || 0; setCurrentLog(copy); }} className="w-full bg-transparent border-b border-slate-200 focus:border-indigo-500 outline-none font-black text-lg placeholder-slate-300" /></div>
                      </div>
                      {!isDone && (
                        <button 
                          onClick={() => handleRestStart(ex.name, ex.rest)}
                          className="w-full py-2 bg-white border border-slate-200 rounded-xl text-[9px] font-black uppercase text-slate-500 hover:bg-slate-100"
                        >
                          {language === 'de' ? `Satz beenden (${ex.rest}s Pause)` : `Finish Set (${ex.rest}s Rest)`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => { onSaveLog({ date: new Date().toISOString(), sessionTitle: selectedSession.dayTitle, exercises: currentLog }); setIsLiveSession(false); }} className="w-full mt-10 py-5 bg-indigo-600 text-white rounded-[2.5rem] font-black text-xl uppercase shadow-xl hover:bg-indigo-700 transition-all">{t.save}</button>
      </div>

      {/* Exercise Info Modal */}
      {selectedExerciseInfo && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl animate-scale-in relative text-slate-900">
            <button onClick={() => setSelectedExerciseInfo(null)} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all"><i className="fas fa-times"></i></button>
            
            <div className="flex items-center gap-3 mb-6">
              <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase tracking-widest">Anleitung</span>
              {selectedExerciseInfo.equipment && (
                <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase tracking-widest">
                  <i className="fas fa-dumbbell mr-1.5"></i> {selectedExerciseInfo.equipment}
                </span>
              )}
            </div>

            <h3 className="text-2xl font-black mb-4 uppercase tracking-tight">{selectedExerciseInfo.name}</h3>
            
            <div className="space-y-6">
              {selectedExerciseInfo.instructions && selectedExerciseInfo.instructions.length > 0 ? (
                <div className="space-y-4">
                  {selectedExerciseInfo.instructions.map((step, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">{i + 1}</div>
                      <p className="text-sm text-slate-600 font-medium leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-sm">Keine detaillierten Anweisungen verfügbar. Bitte achte auf eine saubere Ausführung.</p>
              )}

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">KI-Notiz</p>
                <p className="text-xs text-slate-600 font-medium italic">"{selectedExerciseInfo.notes}"</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 pb-20 animate-fade-in">
      <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl w-fit">
        <button onClick={() => setActiveTab('plan')} className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase transition-all ${activeTab === 'plan' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>{t.plan}</button>
        <button onClick={() => setActiveTab('stats')} className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase transition-all ${activeTab === 'stats' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>{t.stats}</button>
      </div>

      {activeTab === 'plan' ? (
        <div className="space-y-6">
          {(!workoutProgram || showConfig) ? (
            <div className="bg-white rounded-[3rem] shadow-2xl p-8 lg:p-12 border border-slate-100 space-y-10 animate-fade-in">
              <div className="flex justify-between items-center">
                <div><h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">{t.setup}</h3><p className="text-slate-400 text-xs font-bold uppercase tracking-widest">{t.configSub}</p></div>
                {workoutProgram && <button onClick={() => setShowConfig(false)} className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center"><i className="fas fa-times text-xl"></i></button>}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="space-y-8">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.availability}</label>
                      <button 
                        onClick={handleAutoSuggest} 
                        disabled={isSuggesting}
                        className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-[9px] font-black uppercase tracking-widest border border-indigo-100 hover:bg-indigo-100 transition-all"
                      >
                        {isSuggesting ? t.suggesting : <><i className="fas fa-wand-magic-sparkles mr-2"></i>{t.autoSuggest}</>}
                      </button>
                    </div>
                    {suggestionText && (
                      <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl text-xs font-medium text-indigo-700 italic animate-fade-in">
                        "{suggestionText}"
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {daysList.map(day => {
                        const isActive = availableDays.includes(day);
                        return (
                          <button 
                            key={day} 
                            onClick={() => {
                              const newDays = isActive ? availableDays.filter(d => d !== day) : [...availableDays, day];
                              setAvailableDays(newDays);
                              updatePrefs({ availableDays: newDays });
                            }} 
                            className={`px-4 py-2.5 rounded-xl border text-[10px] font-black transition-all ${isActive ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-400'}`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.fixed}</label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select value={newFixedDay} onChange={e => setNewFixedDay(e.target.value)} className="w-full sm:w-auto p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold text-sm outline-none">
                        {daysList.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <input type="text" value={newFixedActivity} onChange={e => setNewFixedActivity(e.target.value)} placeholder={t.activityPlaceholder} className="flex-1 p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                      <button onClick={() => {
                        if (newFixedActivity) {
                          const newFixed = [...existingWorkouts, { day: newFixedDay, activity: newFixedActivity }];
                          setExistingWorkouts(newFixed);
                          setNewFixedActivity('');
                          updatePrefs({ existingWorkouts: newFixed });
                        }
                      }} className="w-full sm:w-auto px-6 py-4 sm:py-0 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px]">{t.add}</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {existingWorkouts.map((w, i) => (
                        <span key={i} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl text-[10px] font-black flex items-center gap-2">
                          {w.day}: {w.activity} 
                          <button onClick={() => {
                            const newFixed = existingWorkouts.filter((_, idx) => idx !== i);
                            setExistingWorkouts(newFixed);
                            updatePrefs({ existingWorkouts: newFixed });
                          }}>
                            <i className="fas fa-times"></i>
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <button onClick={() => { onGenerateWorkout(availableDays, existingWorkouts); setShowConfig(false); }} className="w-full py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-xl uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">{t.create}</button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-indigo-600 rounded-[2.5rem] p-8 text-white flex justify-between items-center shadow-xl">
                 <div><h3 className="text-3xl font-black mb-1">{workoutProgram.title}</h3><p className="text-indigo-100 italic text-sm opacity-80">{workoutProgram.description}</p></div>
                 <button onClick={() => setShowConfig(true)} className="px-6 py-3 bg-white/20 hover:bg-white/30 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/30 transition-all">{t.adapt}</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {workoutProgram.sessions.map((session, i) => {
                  const isCompleted = workoutLogs.some(l => l.sessionTitle === session.dayTitle);
                  return (
                    <div key={i} onClick={() => setSelectedSession(session)} className={`p-6 rounded-[2rem] border cursor-pointer transition-all hover:shadow-lg ${selectedSession === session ? 'bg-white border-indigo-500 ring-4 ring-indigo-500/10' : (isCompleted ? 'bg-emerald-50/50 border-emerald-500' : 'bg-white border-slate-100')}`}>
                      <div className="flex justify-between items-start mb-4">
                        <h4 className="font-black text-slate-900 text-lg leading-tight">{session.dayTitle}</h4>
                        {isCompleted && <i className="fas fa-check-circle text-emerald-500 mt-1 text-lg"></i>}
                      </div>
                      <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 border-t border-slate-100/50 pt-4"><span>{session.duration}</span><span>{session.exercises.length} Ex.</span></div>
                    </div>
                  );
                })}
              </div>
              {selectedSession && (
                <div className="bg-white rounded-[3rem] p-8 lg:p-12 border border-slate-100 shadow-xl animate-scale-in">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-8 mb-8">
                    <div><h3 className="text-3xl font-black text-slate-900">{selectedSession.dayTitle}</h3><p className="text-slate-400 text-xs font-bold uppercase mt-1">{selectedSession.focus}</p></div>
                    <button onClick={() => { setSelectedSession(selectedSession); setIsLiveSession(true); setCurrentLog(selectedSession.exercises.map(ex => ({ exerciseName: ex.name, sets: Array.from({ length: ex.sets }, () => ({ weight: 0, reps: 0 })) }))); }} className="px-10 py-5 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs shadow-xl"><i className="fas fa-play mr-3"></i> {t.start}</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedSession.exercises.map((ex, i) => {
                      const sessionLog = workoutLogs.find(l => l.sessionTitle === selectedSession.dayTitle);
                      const exerciseLog = sessionLog?.exercises.find(le => le.exerciseName === ex.name);
                      
                      return (
                        <div key={i} className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex flex-col gap-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h5 className="font-black text-slate-900 text-lg">{ex.name}</h5>
                              <p className="text-[10px] text-slate-400 italic mt-1">{ex.notes}</p>
                            </div>
                            <div className="flex gap-2">
                              <div className="bg-white px-4 py-2.5 rounded-xl text-center border border-slate-100"><p className="text-[7px] font-black text-slate-400 uppercase">Sets</p><p className="font-black text-lg">{ex.sets}</p></div>
                              <div className="bg-white px-4 py-2.5 rounded-xl text-center border border-slate-100"><p className="text-[7px] font-black text-slate-400 uppercase">Reps</p><p className="font-black text-lg">{ex.reps}</p></div>
                              <div className="bg-white px-4 py-2.5 rounded-xl text-center border border-slate-100"><p className="text-[7px] font-black text-slate-400 uppercase"><i className="fas fa-stopwatch mr-1"></i>{t.rest}</p><p className="font-black text-lg">{ex.rest}s</p></div>
                            </div>
                          </div>
                          
                          {exerciseLog && (
                            <div className="pt-4 border-t border-slate-200/50">
                              <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-1">
                                <i className="fas fa-history text-[8px]"></i> Letztes Ergebnis:
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {exerciseLog.sets.map((s, si) => (
                                  <div key={si} className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold border border-emerald-100">
                                    S{si+1}: {s.weight}kg x {s.reps}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8 animate-fade-in">
          <div className="bg-white rounded-[3rem] p-8 lg:p-12 border border-slate-100 shadow-xl">
             <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-8">Trainingshistorie</h3>
             {workoutLogs.length === 0 ? (
               <div className="h-40 w-full flex items-center justify-center text-slate-300 italic font-medium">Noch keine Trainings absolviert.</div>
             ) : (
               <div className="space-y-4">
                 {workoutLogs.map((log, i) => (
                   <div key={i} className="space-y-3">
                     <div 
                       onClick={() => setExpandedLogIdx(expandedLogIdx === i ? null : i)}
                       className={`p-6 bg-slate-50 border border-slate-100 rounded-[2rem] flex justify-between items-center transition-all hover:shadow-md cursor-pointer ${expandedLogIdx === i ? 'ring-2 ring-indigo-500' : ''}`}
                     >
                       <div>
                         <h4 className="font-black text-lg text-slate-900">{log.sessionTitle}</h4>
                         <p className="text-[10px] font-black uppercase text-slate-500 mt-1">{new Date(log.date).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} • {log.exercises.length} Übungen</p>
                       </div>
                       <div className="flex items-center gap-4">
                         <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 text-slate-400 flex items-center justify-center text-sm">
                           <i className={`fas fa-chevron-${expandedLogIdx === i ? 'up' : 'down'}`}></i>
                         </div>
                         <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl shadow-sm">
                           <i className="fas fa-check"></i>
                         </div>
                       </div>
                     </div>
                     
                     {expandedLogIdx === i && (
                       <div className="p-6 bg-white border border-slate-100 rounded-[2rem] shadow-inner space-y-6 animate-fade-in mx-4">
                         {log.exercises.map((el, exi) => (
                           <div key={exi} className="pb-4 border-b border-slate-50 last:border-0 last:pb-0">
                             <h5 className="font-black text-slate-800 text-sm mb-3 flex items-center gap-2">
                               <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                               {el.exerciseName}
                             </h5>
                             <div className="flex flex-wrap gap-2 pl-4">
                               {el.sets.map((s, si) => (
                                 <div key={si} className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl flex flex-col items-center min-w-[60px]">
                                   <span className="text-[7px] font-black text-slate-400 uppercase mb-1">S{si+1}</span>
                                   <span className="text-xs font-black text-slate-700">{s.weight}kg</span>
                                   <span className="text-[8px] font-bold text-slate-400">{s.reps} Reps</span>
                                 </div>
                               ))}
                             </div>
                           </div>
                         ))}
                       </div>
                     )}
                   </div>
                 ))}
               </div>
             )}
          </div>
        </div>
      )}
    </div>
  );
};
export default WorkoutTab;
