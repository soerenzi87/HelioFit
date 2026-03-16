
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { WorkoutProgram, WorkoutSession, Exercise, ExistingWorkout, WorkoutLog, ExerciseLog, Language, UserProfile, WorkoutPreferences } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Bar, BarChart, ComposedChart, Legend, Cell } from 'recharts';
import { analyzeWorkoutProgress, suggestWorkoutPreferences, generateWorkoutCue, suggestAlternativeExercise } from '../services/geminiService';
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

// ── Helpers ──
const extractDayName = (dayTitle: string): string => {
  // "Montag: Push & Core" → "Mo", "Dienstag: Pull" → "Di"
  const full = dayTitle.split(':')[0].trim();
  const shortMap: Record<string, string> = {
    'Montag': 'Mo', 'Dienstag': 'Di', 'Mittwoch': 'Mi', 'Donnerstag': 'Do',
    'Freitag': 'Fr', 'Samstag': 'Sa', 'Sonntag': 'So',
    'Monday': 'Mon', 'Tuesday': 'Tue', 'Wednesday': 'Wed', 'Thursday': 'Thu',
    'Friday': 'Fri', 'Saturday': 'Sat', 'Sunday': 'Sun',
  };
  return shortMap[full] || full.slice(0, 2);
};

const parseSuggestedWeight = (sw?: string): number => {
  if (!sw) return 0;
  const lower = sw.toLowerCase();
  if (lower.includes('körpergewicht') || lower.includes('bodyweight') || lower.includes('ohne')) return 0;
  const match = sw.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
};

const parseMaxReps = (reps?: string): number => {
  if (!reps) return 0;
  const lower = reps.toLowerCase();
  if (lower.includes('amrap') || lower.includes('max')) return 0;
  // "8-10" → 10, "12" → 12, "45-60s" → 0 (time-based)
  if (lower.includes('s') && /\d+s/.test(lower)) return 0;
  const nums = reps.match(/\d+/g);
  if (!nums) return 0;
  return Math.max(...nums.map(Number));
};

const WorkoutTab: React.FC<WorkoutTabProps> = ({ workoutProgram, workoutLogs, onGenerateWorkout, onSaveLog, onUpdateProfile, isLoading, language, profile }) => {
  const [activeTab, setActiveTab] = useState<'plan' | 'stats'>('plan');
  const [selectedSession, setSelectedSession] = useState<WorkoutSession | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [availableDays, setAvailableDays] = useState<string[]>(profile?.workoutPreferences?.availableDays || []);
  const [existingWorkouts, setExistingWorkouts] = useState<ExistingWorkout[]>(profile?.workoutPreferences?.existingWorkouts || []);

  // States for fixed appointment input
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

  // ── NEW: Exercise swap state ──
  const [swappingExIdx, setSwappingExIdx] = useState<number | null>(null);
  // We keep a mutable copy of the session for swaps (so original plan stays untouched)
  const [liveSessionData, setLiveSessionData] = useState<WorkoutSession | null>(null);

  // Auto-select first session when plan loads
  useEffect(() => {
    if (workoutProgram && workoutProgram.sessions.length > 0 && !selectedSession) {
      setSelectedSession(workoutProgram.sessions[0]);
    }
  }, [workoutProgram]);

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

  // ── NEW: Accept suggested weight + max reps ──
  const handleAcceptSuggestion = (exIdx: number, sIdx: number, exercise: Exercise) => {
    const copy = [...currentLog];
    copy[exIdx].sets[sIdx].weight = parseSuggestedWeight(exercise.suggestedWeight);
    copy[exIdx].sets[sIdx].reps = parseMaxReps(exercise.reps);
    setCurrentLog(copy);
    handleRestStart(exercise.name, exercise.rest || 60);
  };

  // ── NEW: Skip set ──
  const handleSkipSet = (exIdx: number, sIdx: number) => {
    const copy = [...currentLog];
    copy[exIdx].sets[sIdx] = { weight: 0, reps: 0, skipped: true };
    setCurrentLog(copy);
  };

  // ── NEW: Swap exercise via AI ──
  const handleSwapExercise = async (exIdx: number, exercise: Exercise) => {
    if (swappingExIdx !== null) return;
    setSwappingExIdx(exIdx);
    try {
      if (!profile) return;
      const alternative = await suggestAlternativeExercise(profile, exercise, language);
      // Update live session data
      const sessionToUpdate = liveSessionData || selectedSession;
      if (!sessionToUpdate) return;
      const newSession = {
        ...sessionToUpdate,
        exercises: sessionToUpdate.exercises.map((ex, i) => i === exIdx ? { ...alternative } : ex)
      };
      setLiveSessionData(newSession);
      // Update currentLog to match new exercise
      const logCopy = [...currentLog];
      const oldSets = logCopy[exIdx].sets;
      const newSetCount = alternative.sets || oldSets.length;
      logCopy[exIdx] = {
        exerciseName: alternative.name,
        sets: Array.from({ length: newSetCount }, (_, si) =>
          si < oldSets.length ? oldSets[si] : { weight: 0, reps: 0 }
        )
      };
      setCurrentLog(logCopy);
    } catch (e) {
      console.error("Failed to swap exercise:", e);
    } finally {
      setSwappingExIdx(null);
    }
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
    autoSuggest: 'KI-Vorschlag', suggesting: 'Analysiere Profil...',
    acceptSuggestion: 'Vorschlag übernehmen', skipSet: 'Nicht gemacht', swapping: 'Alternative wird gesucht...',
    finishSet: 'Satz beenden', skipped: 'Übersprungen',
  } : {
    plan: 'Workout Plan', stats: 'History & Analysis', setup: 'Workout Engine', configSub: 'Adjust training logic', create: 'Generate New Plan', adapt: 'Open Engine', focus: 'Focus', start: 'Start Workout', save: 'Save Session', weight: 'Weight (kg)', reps: 'Reps', rest: 'Rest', export: 'Export', history: 'Weekly Archive', plannedVsActual: 'Planned vs Actual', volume: 'Volume Trend', availability: 'Your available days', fixed: 'Fixed Appointments / Classes', add: 'Add Appointment', activityPlaceholder: 'e.g. Yoga Class, Soccer...',
    autoSuggest: 'AI Suggestion', suggesting: 'Analyzing Profile...',
    acceptSuggestion: 'Use Suggestion', skipSet: 'Skip Set', swapping: 'Finding alternative...',
    finishSet: 'Finish Set', skipped: 'Skipped',
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

  // The session used in live mode (may have swapped exercises)
  const activeSessionForLive = liveSessionData || selectedSession;

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center min-h-[500px]">
      <div className="w-20 h-20 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-8 shadow-xl shadow-indigo-600/20"></div>
      <p className="font-black uppercase tracking-[0.3em] text-[10px] text-slate-400 animate-pulse">Helio-Engine optimiert Plan...</p>
    </div>
  );

  // ════════════════════════════════════════════════════════════════
  // ██  LIVE SESSION VIEW
  // ════════════════════════════════════════════════════════════════
  if (isLiveSession && activeSessionForLive) return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 animate-fade-in relative">
      <div className="bg-[#1a1f26] rounded-[3.5rem] p-8 lg:p-14 shadow-2xl border border-white/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-5 text-9xl pointer-events-none translate-x-4"><i className="fas fa-bolt text-white"></i></div>
        
        <div className="flex justify-between items-center mb-12 pb-8 border-b border-white/5 relative z-10">
          <div>
            <p className="text-indigo-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Live Session</p>
            <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">{activeSessionForLive.dayTitle}</h2>
          </div>
          <div className="flex items-center gap-6">
            {restTimer !== null && (
              <div className="px-8 py-4 bg-orange-600 text-white rounded-[2rem] font-black text-2xl shadow-2xl shadow-orange-600/30 animate-pulse border border-orange-400/20">
                {Math.floor(restTimer / 60)}:{String(restTimer % 60).padStart(2, '0')}
              </div>
            )}
            <button 
              onClick={() => { setIsLiveSession(false); setLiveSessionData(null); }} 
              className="w-14 h-14 rounded-2xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all border border-white/5"
            >
              <i className="fas fa-times text-2xl"></i>
            </button>
          </div>
        </div>

        {/* Rest Timer Overlay */}
        {restTimer !== null && (
          <div className="mb-12 p-10 bg-gradient-to-br from-orange-600 to-amber-600 rounded-[2.5rem] text-white text-center shadow-2xl animate-fade-in relative overflow-hidden border border-orange-400/20">
            <div className="absolute top-0 left-0 p-6 opacity-10 text-6xl"><i className="fas fa-clock"></i></div>
            <div className="relative z-10">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80 mb-3">
                {language === 'de' ? 'Pause' : 'Rest'} — {restExerciseName}
              </p>
              <div className="text-8xl font-black tabular-nums tracking-tighter mb-4">
                {Math.floor(restTimer / 60)}:{String(restTimer % 60).padStart(2, '0')}
              </div>
              <button
                onClick={() => { setRestTimer(null); setRestExerciseName(''); }}
                className="px-10 py-3 bg-white/20 hover:bg-white/30 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/30 transition-all backdrop-blur-md"
              >
                {language === 'de' ? 'Überspringen' : 'Skip'}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-14 relative z-10">
          {activeSessionForLive.exercises.map((ex, exIdx) => (
            <div key={exIdx} className="space-y-6 relative group">
              {/* Swap loading overlay */}
              {swappingExIdx === exIdx && (
                <div className="absolute -inset-4 bg-slate-900/60 backdrop-blur-md rounded-[3rem] z-20 flex flex-col items-center justify-center gap-4 animate-fade-in border border-white/10 shadow-2xl">
                  <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">{t.swapping}</p>
                </div>
              )}

              <div className="flex items-center gap-4 border-l-4 border-indigo-600 pl-6 py-1">
                <h3 className="text-2xl font-black text-white tracking-tight uppercase">{ex.name}</h3>
                <div className="flex items-center gap-2">
                  {ex.equipment && (
                    <span className="px-3 py-1 bg-white/5 text-slate-400 border border-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest">
                      {ex.equipment}
                    </span>
                  )}
                  <button
                    onClick={() => setSelectedExerciseInfo(ex)}
                    className="w-10 h-10 rounded-2xl bg-white/5 text-slate-400 flex items-center justify-center hover:bg-indigo-600/20 hover:text-indigo-400 transition-all border border-white/5"
                  >
                    <i className="fas fa-info text-xs"></i>
                  </button>
                  <button
                    onClick={() => handleSwapExercise(exIdx, ex)}
                    disabled={swappingExIdx !== null}
                    className="w-10 h-10 rounded-2xl bg-white/5 text-slate-400 flex items-center justify-center hover:bg-amber-600/20 hover:text-amber-500 transition-all border border-white/5 disabled:opacity-40"
                    title={language === 'de' ? 'Übung wechseln' : 'Swap exercise'}
                  >
                    <i className={`fas ${swappingExIdx === exIdx ? 'fa-spinner animate-spin' : 'fa-shuffle'} text-xs`}></i>
                  </button>
                </div>
              </div>

              {ex.suggestedWeight && (
                <div className="flex items-center gap-3 ml-10">
                  <div className="w-2 h-2 bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.6)]"></div>
                  <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    <span className="text-amber-500/80 mr-2">{language === 'de' ? 'Vorschlag' : 'Suggested'}:</span> {ex.suggestedWeight} • {ex.reps} {language === 'de' ? 'Wdh' : 'reps'}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 ml-6 md:ml-10">
                {currentLog[exIdx]?.sets.map((set, sIdx) => {
                  const isDone = (set.weight > 0 || set.reps > 0) && !set.skipped;
                  const isSkipped = set.skipped === true;
                  return (
                    <div key={sIdx} className={`p-6 rounded-[2rem] border transition-all flex flex-col gap-6 group/set ${
                      isSkipped ? 'bg-red-500/5 border-red-500/20 shadow-xl' :
                      isDone ? 'bg-emerald-500/5 border-emerald-500/20 shadow-xl' :
                      'bg-slate-800/30 border-white/5 hover:border-white/10'
                    }`}>
                      <div className="flex justify-between items-center">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${isSkipped ? 'text-red-400' : isDone ? 'text-emerald-400' : 'text-slate-500'}`}>Satz {sIdx + 1}</span>
                        {isDone && <i className="fas fa-check-circle text-emerald-500 text-lg"></i>}
                        {isSkipped && <i className="fas fa-ban text-red-500 text-lg"></i>}
                      </div>
                      <div className="flex gap-6">
                        <div className="flex-1">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">{t.weight}</label>
                          <div className="relative">
                            <input
                              type="number"
                              placeholder={ex.suggestedWeight?.replace(/[^0-9.]/g, '') || ''}
                              value={set.weight || ''}
                              disabled={isSkipped}
                              onChange={(e) => { const copy = [...currentLog]; copy[exIdx].sets[sIdx].weight = parseFloat(e.target.value) || 0; setCurrentLog(copy); }}
                              className={`w-full bg-slate-900/50 rounded-xl p-4 outline-none font-black text-xl transition-all ${isSkipped ? 'text-red-300 border border-red-500/10' : 'text-white border border-white/5 focus:border-indigo-500 focus:bg-slate-900'}`}
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-600 uppercase">kg</span>
                          </div>
                        </div>
                        <div className="flex-1">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">{t.reps}</label>
                          <input
                            type="text"
                            placeholder={ex.reps || ''}
                            value={isSkipped ? '-' : (set.reps || '')}
                            disabled={isSkipped}
                            onChange={(e) => { const copy = [...currentLog]; copy[exIdx].sets[sIdx].reps = parseFloat(e.target.value) || 0; setCurrentLog(copy); }}
                            className={`w-full bg-slate-900/50 rounded-xl p-4 outline-none font-black text-xl text-center transition-all ${isSkipped ? 'text-red-300 border border-red-500/10' : 'text-white border border-white/5 focus:border-indigo-500 focus:bg-slate-900'}`}
                          />
                        </div>
                      </div>
                      {!isDone && !isSkipped && (
                        <div className="flex flex-col gap-3 pt-2">
                          <button
                            onClick={() => handleRestStart(ex.name, ex.rest)}
                            className="w-full py-3.5 bg-white/5 hover:bg-white/10 rounded-2xl text-[10px] font-black uppercase text-white tracking-widest border border-white/10 transition-all flex items-center justify-center gap-2"
                          >
                            <i className="fas fa-check text-xs"></i> {t.finishSet}
                          </button>
                          <button
                            onClick={() => handleAcceptSuggestion(exIdx, sIdx, ex)}
                            className="w-full py-3.5 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 rounded-2xl text-[10px] font-black uppercase text-indigo-400 tracking-widest transition-all flex items-center justify-center gap-3 shadow-xl"
                          >
                            <i className="fas fa-magic text-xs"></i> {t.acceptSuggestion}
                          </button>
                          <button
                            onClick={() => handleSkipSet(exIdx, sIdx)}
                            className="w-full py-2 rounded-2xl text-[9px] font-black uppercase text-slate-600 hover:text-red-400 transition-colors"
                          >
                            {t.skipSet}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-20 pt-12 border-t border-white/5 shrink-0 relative z-10">
          <button 
            onClick={() => {
              onSaveLog({ date: new Date().toISOString(), sessionTitle: activeSessionForLive.dayTitle, exercises: currentLog });
              setIsLiveSession(false);
              setLiveSessionData(null);
            }} 
            className="w-full py-8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2.5rem] font-black text-2xl uppercase tracking-[0.1em] shadow-[0_20px_50px_rgba(79,70,229,0.3)] transition-all active:scale-[0.98] border border-indigo-400/20"
          >
            {t.save}
          </button>
        </div>
      </div>

      {/* Exercise Info Modal */}
      {selectedExerciseInfo && (
        <div className="fixed inset-0 z-[300] bg-[#0f172a]/80 backdrop-blur-xl flex items-center justify-center p-6 animate-fade-in transition-all">
          <div className="bg-[#1a1f26] rounded-[3.5rem] p-10 lg:p-14 max-w-2xl w-full shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10 animate-scale-in relative text-white">
            <button 
              onClick={() => setSelectedExerciseInfo(null)} 
              className="absolute top-10 right-10 w-14 h-14 rounded-2xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all border border-white/5"
            >
              <i className="fas fa-times text-2xl"></i>
            </button>

            <div className="flex items-center gap-4 mb-8">
              <span className="px-4 py-2 bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest">Protocol</span>
              {selectedExerciseInfo.equipment && (
                <span className="px-4 py-2 bg-white/5 text-slate-400 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                  <i className="fas fa-dumbbell text-indigo-500"></i> {selectedExerciseInfo.equipment}
                </span>
              )}
            </div>

            <h3 className="text-4xl font-black mb-8 uppercase tracking-tighter leading-none">{selectedExerciseInfo.name}</h3>

            <div className="space-y-10">
              {selectedExerciseInfo.instructions && selectedExerciseInfo.instructions.length > 0 ? (
                <div className="space-y-6">
                  {selectedExerciseInfo.instructions.map((step, i) => (
                    <div key={i} className="flex gap-6 group">
                      <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-slate-800 text-white text-[12px] font-black flex items-center justify-center border border-white/10 shadow-xl group-hover:bg-indigo-600 transition-all">{i + 1}</div>
                      <p className="text-sm text-slate-300 font-medium leading-relaxed pt-2 transition-colors group-hover:text-white">{step}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 bg-slate-800/30 rounded-[2rem] border-2 border-dashed border-white/5 text-center">
                  <i className="fas fa-info-circle text-3xl text-slate-700 mb-4"></i>
                  <p className="text-slate-500 italic text-sm font-medium">No detailed instructions found. Focus on controlled movements and full range of motion.</p>
                </div>
              )}

              <div className="p-8 bg-indigo-600/5 rounded-[2.5rem] border border-indigo-500/10 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-10 text-4xl"><i className="fas fa-wand-magic-sparkles"></i></div>
                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-3">AI Deep Dive</p>
                <p className="text-sm text-slate-400 font-medium italic leading-relaxed">"{selectedExerciseInfo.notes}"</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ════════════════════════════════════════════════════════════════
  // ██  MAIN VIEW (Plan + Stats tabs)
  // ════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-8 pb-20 animate-fade-in relative">
      <div className="flex gap-2 p-1.5 bg-slate-800/40 border border-white/5 backdrop-blur-md rounded-2xl w-fit">
        <button 
          onClick={() => setActiveTab('plan')} 
          className={`px-8 py-3 rounded-xl font-black text-xs uppercase transition-all ${activeTab === 'plan' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-300'}`}
        >
          {t.plan}
        </button>
        <button 
          onClick={() => setActiveTab('stats')} 
          className={`px-8 py-3 rounded-xl font-black text-xs uppercase transition-all ${activeTab === 'stats' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-300'}`}
        >
          {t.stats}
        </button>
      </div>

      {activeTab === 'plan' ? (
        <div className="space-y-8">
          {(!workoutProgram || showConfig) ? (
            <div className="bg-[#1a1f26] rounded-[3.5rem] shadow-2xl p-8 lg:p-14 border border-white/5 space-y-12 animate-fade-in relative overflow-hidden">
              <div className="absolute top-0 right-0 p-12 opacity-5 text-9xl pointer-events-none translate-x-4"><i className="fas fa-meteor text-white"></i></div>
              
              <div className="flex justify-between items-center relative z-10">
                <div>
                  <p className="text-indigo-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Optimization Engine</p>
                  <h3 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">{t.setup}</h3>
                </div>
                {workoutProgram && (
                   <button 
                    onClick={() => setShowConfig(false)} 
                    className="w-14 h-14 rounded-2xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all border border-white/5"
                  >
                    <i className="fas fa-times text-2xl"></i>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 relative z-10">
                <div className="space-y-10">
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{t.availability}</label>
                      <button
                        onClick={handleAutoSuggest}
                        disabled={isSuggesting}
                        className="px-5 py-2 bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600/20 transition-all flex items-center gap-3"
                      >
                        {isSuggesting ? (
                          <><div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div> {t.suggesting}</>
                        ) : (
                          <><i className="fas fa-wand-magic-sparkles text-xs"></i> {t.autoSuggest}</>
                        )}
                      </button>
                    </div>
                    {suggestionText && (
                      <div className="p-6 bg-indigo-600/5 border border-indigo-500/10 rounded-[2rem] text-xs font-semibold text-slate-400 italic animate-fade-in relative">
                        <i className="fas fa-quote-left absolute -top-2 left-4 text-indigo-500/30 text-2xl"></i>
                        "{suggestionText}"
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2.5">
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
                            className={`px-6 py-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${isActive ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl shadow-indigo-600/20' : 'bg-slate-800/30 border-white/5 text-slate-500 hover:border-white/10'}`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{t.fixed}</label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <select 
                        value={newFixedDay} 
                        onChange={e => setNewFixedDay(e.target.value)} 
                        className="w-full sm:w-auto p-5 bg-slate-800/50 rounded-2xl border border-white/5 font-bold text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
                      >
                        {daysList.map(d => <option key={d} value={d} className="bg-slate-900">{d}</option>)}
                      </select>
                      <input 
                        type="text" 
                        value={newFixedActivity} 
                        onChange={e => setNewFixedActivity(e.target.value)} 
                        placeholder={t.activityPlaceholder} 
                        className="flex-1 p-5 bg-slate-800/50 rounded-2xl border border-white/5 font-bold text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-600 transition-all" 
                      />
                      <button 
                        onClick={() => {
                          if (newFixedActivity) {
                            const newFixed = [...existingWorkouts, { day: newFixedDay, activity: newFixedActivity }];
                            setExistingWorkouts(newFixed);
                            setNewFixedActivity('');
                            updatePrefs({ existingWorkouts: newFixed });
                          }
                        }} 
                        className="w-full sm:w-auto px-8 py-5 bg-white/5 hover:bg-white/10 text-white border border-white/5 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all"
                      >
                        {t.add}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {existingWorkouts.map((w, i) => (
                        <span key={i} className="px-5 py-2.5 bg-slate-800 text-slate-300 border border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-4 group">
                          <span className="text-indigo-500 font-black">{w.day}:</span> {w.activity}
                          <button 
                            onClick={() => {
                              const newFixed = existingWorkouts.filter((_, idx) => idx !== i);
                              setExistingWorkouts(newFixed);
                              updatePrefs({ existingWorkouts: newFixed });
                            }}
                            className="text-slate-500 hover:text-red-500 transition-colors"
                          >
                            <i className="fas fa-times"></i>
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="pt-12 shrink-0 relative z-10">
                <button 
                  onClick={() => { onGenerateWorkout(availableDays, existingWorkouts); setShowConfig(false); }} 
                  className="w-full py-8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2.5rem] font-black text-2xl uppercase tracking-[0.1em] shadow-[0_20px_50px_rgba(79,70,229,0.3)] transition-all active:scale-[0.98] border border-indigo-400/20"
                >
                  {t.create}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-[3rem] p-10 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 shadow-2xl border border-indigo-400/20 relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-10 opacity-10 text-9xl pointer-events-none translate-x-4"><i className="fas fa-meteor"></i></div>
                 <div className="relative z-10">
                   <p className="text-indigo-200 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Active Protocol</p>
                   <h3 className="text-4xl font-black tracking-tighter uppercase mb-1">{workoutProgram.title}</h3>
                   <p className="text-indigo-100 italic text-sm opacity-80 font-medium">{workoutProgram.description}</p>
                 </div>
                 <button 
                   onClick={() => setShowConfig(true)} 
                   className="relative z-10 px-8 py-4 bg-white/20 hover:bg-white/30 rounded-[2rem] text-[10px] font-black uppercase tracking-widest border border-white/30 transition-all backdrop-blur-md"
                 >
                   <i className="fas fa-sliders mr-2"></i> {t.adapt}
                 </button>
              </div>

              {/* ── DAY SELECTOR ── */}
              <div className="flex overflow-x-auto gap-2 p-2 bg-slate-800/40 border border-white/5 rounded-[2rem] w-full no-scrollbar backdrop-blur-sm">
                {workoutProgram.sessions.map((session, i) => {
                  const isActive = selectedSession === session;
                  const isCompleted = workoutLogs.some(l => l.sessionTitle === session.dayTitle);
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedSession(session)}
                      className={`shrink-0 px-8 py-4 rounded-2xl font-black text-xs uppercase transition-all whitespace-nowrap flex items-center gap-3 ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {extractDayName(session.dayTitle)}
                      {isCompleted && (
                        <div className="bg-emerald-500 text-[8px] w-4 h-4 rounded-full flex items-center justify-center text-white">
                          <i className="fas fa-check"></i>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedSession && (
                <div className="bg-[#1a1f26] rounded-[3.5rem] p-8 lg:p-14 border border-white/5 shadow-2xl animate-scale-in relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-12 opacity-5 text-9xl pointer-events-none translate-x-4"><i className="fas fa-dumbbell text-white"></i></div>
                  
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-12 pb-10 border-b border-white/5 relative z-10">
                    <div>
                      <p className="text-indigo-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">{selectedSession.focus}</p>
                      <h3 className="text-4xl font-black text-white tracking-tighter uppercase">{selectedSession.dayTitle}</h3>
                    </div>
                    <button 
                      onClick={() => {
                        setLiveSessionData(null);
                        setIsLiveSession(true);
                        setCurrentLog(selectedSession.exercises.map(ex => ({ exerciseName: ex.name, sets: Array.from({ length: ex.sets }, () => ({ weight: 0, reps: 0 })) })));
                      }} 
                      className="px-12 py-6 bg-slate-900 text-white rounded-[2rem] font-black uppercase text-sm tracking-widest shadow-2xl hover:bg-slate-950 hover:shadow-indigo-500/10 transition-all border border-white/10 flex items-center gap-4 group"
                    >
                      <i className="fas fa-play text-indigo-500 group-hover:scale-125 transition-transform"></i> 
                      {t.start}
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
                    {selectedSession.exercises.map((ex, i) => {
                      const sessionLog = workoutLogs.find(l => l.sessionTitle === selectedSession.dayTitle);
                      const exerciseLog = sessionLog?.exercises.find(le => le.exerciseName === ex.name);

                      return (
                        <div key={i} className="bg-slate-800/30 p-8 rounded-[2.5rem] border border-white/5 hover:bg-slate-800/50 hover:border-white/10 transition-all flex flex-col gap-6 group">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0 pr-4">
                              <h5 className="font-black text-white text-xl tracking-tight uppercase leading-tight group-hover:text-indigo-400 transition-colors">{ex.name}</h5>
                              <p className="text-[10px] text-slate-500 italic mt-2 font-medium leading-relaxed line-clamp-2">{ex.notes}</p>
                            </div>
                            <div className="w-12 h-12 bg-indigo-600/10 text-indigo-500 rounded-2xl flex items-center justify-center text-xl border border-indigo-500/10"><i className="fas fa-dumbbell"></i></div>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-slate-900/50 p-4 rounded-2xl text-center border border-white/5">
                              <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">Sets</p>
                              <p className="font-black text-white text-lg tracking-tight">{ex.sets}</p>
                            </div>
                            <div className="bg-slate-900/50 p-4 rounded-2xl text-center border border-white/5">
                              <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">Reps</p>
                              <p className="font-black text-white text-lg tracking-tight">{ex.reps}</p>
                            </div>
                            <div className="bg-slate-900/50 p-4 rounded-2xl text-center border border-white/5">
                              <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">{t.rest}</p>
                              <p className="font-black text-white text-lg tracking-tight">{ex.rest}s</p>
                            </div>
                          </div>

                          {exerciseLog && (
                            <div className="pt-6 border-t border-white/5 mt-auto">
                              <div className="flex items-center justify-between mb-4">
                                <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                                  <i className="fas fa-history"></i> PR Tracker
                                </p>
                                <span className="text-[8px] font-black text-slate-500 uppercase">Last Result</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {exerciseLog.sets.map((s, si) => (
                                  <div key={si} className={`px-3 py-1.5 rounded-xl text-[10px] font-black border transition-colors ${
                                    s.skipped
                                      ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                  }`}>
                                    {s.skipped
                                      ? `S${si+1}: -`
                                      : `S${si+1}: ${s.weight}kg × ${s.reps}`
                                    }
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
        <div className="space-y-10 animate-fade-in">
          <div className="bg-[#1a1f26] rounded-[3.5rem] p-10 lg:p-14 border border-white/5 shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-14 opacity-5 text-9xl pointer-events-none translate-x-4"><i className="fas fa-chart-line text-white"></i></div>
             
             <div className="flex justify-between items-center mb-14 relative z-10">
               <div>
                  <p className="text-indigo-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Progress Tracker</p>
                  <h3 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">History & Analysis</h3>
               </div>
               <div className="px-6 py-3 bg-white/5 border border-white/5 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest">{workoutLogs.length} Sessions</div>
             </div>

             {workoutLogs.length === 0 ? (
               <div className="h-60 w-full flex flex-col items-center justify-center text-slate-600 gap-6">
                 <i className="fas fa-dumbbell text-6xl opacity-10 text-indigo-500"></i>
                 <p className="italic font-bold text-lg tracking-tight">No training sessions recorded yet.</p>
               </div>
             ) : (
               <div className="space-y-6 relative z-10">
                 {workoutLogs.map((log, i) => (
                   <div key={i} className="space-y-4">
                     <div
                       onClick={() => setExpandedLogIdx(expandedLogIdx === i ? null : i)}
                       className={`p-6 bg-slate-800/30 border rounded-[2.5rem] flex items-center gap-8 transition-all hover:bg-slate-800/60 cursor-pointer group ${expandedLogIdx === i ? 'border-indigo-500/40 bg-indigo-500/5 ring-1 ring-indigo-500/20 shadow-2xl' : 'border-white/5'}`}
                     >
                       <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center flex-shrink-0 text-3xl transition-all ${expandedLogIdx === i ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'bg-slate-700 text-slate-400 group-hover:bg-slate-900 group-hover:text-white'}`}>
                          <i className="fas fa-check"></i>
                       </div>
                       
                       <div className="flex-1 min-w-0">
                         <h4 className="font-black text-white text-xl tracking-tight uppercase group-hover:text-indigo-400 transition-colors">{log.sessionTitle}</h4>
                         <div className="flex items-center gap-4 mt-2">
                           <div className="flex items-center gap-2">
                             <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(79,70,229,0.8)]"></div>
                             <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{new Date(log.date).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                           </div>
                           <span className="text-slate-600 tracking-widest text-[10px]">•</span>
                           <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest leading-none">{log.exercises.length} Exercises</span>
                         </div>
                       </div>
                       
                       <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-white/5 text-slate-500 group-hover:text-white flex items-center justify-center transition-all shadow-xl">
                         <i className={`fas fa-chevron-${expandedLogIdx === i ? 'up' : 'down'} text-sm`}></i>
                       </div>
                     </div>

                     {expandedLogIdx === i && (
                       <div className="p-10 bg-slate-900/40 border border-white/5 rounded-[3rem] shadow-inner space-y-10 animate-fade-in mx-6 mb-10 border-t-0 -mt-10 pt-16">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                           {log.exercises.map((el, exi) => (
                             <div key={exi} className="bg-slate-800/50 p-6 rounded-[2rem] border border-white/5 group/ex">
                               <div className="flex items-center justify-between mb-6">
                                 <h5 className="font-black text-white text-base tracking-tight uppercase flex items-center gap-3">
                                   <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full shadow-[0_0_8px_rgba(79,70,229,0.5)]"></span>
                                   {el.exerciseName}
                                 </h5>
                               </div>
                               <div className="flex flex-wrap gap-2">
                                 {el.sets.map((s, si) => (
                                   <div key={si} className={`px-4 py-3 border rounded-2xl flex flex-col items-center min-w-[70px] transition-all transform hover:scale-105 ${
                                     s.skipped
                                       ? 'bg-red-500/10 border-red-500/20'
                                       : 'bg-slate-900 border-white/5'
                                   }`}>
                                     <span className="text-[8px] font-black text-slate-500 uppercase mb-2">Set {si+1}</span>
                                     {s.skipped ? (
                                       <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">{t.skipped}</span>
                                     ) : (
                                       <>
                                         <span className="text-sm font-black text-white">{s.weight}kg</span>
                                         <span className="text-[8px] font-extrabold text-indigo-500 uppercase mt-1 opacity-80">{s.reps} Reps</span>
                                       </>
                                     )}
                                   </div>
                                 ))}
                               </div>
                             </div>
                           ))}
                         </div>
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
