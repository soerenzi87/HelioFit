
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { WorkoutProgram, WorkoutSession, Exercise, ExistingWorkout, WorkoutLog, ExerciseLog, Language, UserProfile, WorkoutPreferences, RecoveryBubble } from '../types';
import { analyzeWorkoutProgress, suggestWorkoutPreferences, generateWorkoutCue, suggestAlternativeExercises, adjustWorkoutSession, WorkoutAdjustmentDraft, estimateActivityCalories } from '../services/geminiService';
import { exportWorkoutToICS } from '../services/calendarService';
import { RecoveryEntry, TrainingRecoverySummary } from '../services/recoveryService';
import { HealthData } from '../types';
import LiveSession from './workout/LiveSession';
import WorkoutHistory from './workout/WorkoutHistory';
import { getWorkoutTranslations } from './workout/workoutTranslations';
import { DAYS_DE, DAYS_EN, extractDayName, parseSuggestedWeight, parseMaxReps } from './workout/workoutHelpers';

declare global {
  interface Window {
    YT: any;
  }
}

interface WorkoutTabProps {
  workoutProgram: WorkoutProgram | null;
  workoutLogs: WorkoutLog[];
  onGenerateWorkout: (availableDays: string[], existing: ExistingWorkout[], sessionDurationMin?: number, modificationRequest?: string) => void | Promise<void>;
  onSaveLog: (log: WorkoutLog) => void;
  onUpdateProfile: (updated: UserProfile) => void;
  onUpdateWorkoutPlan: (plan: WorkoutProgram) => void;
  onInterpretManualHistory: (historyText: string) => Promise<number | void>;
  onCompleteWeek: () => void;
  isLoading: boolean;
  language: Language;
  profile: UserProfile | null;
  healthData?: HealthData | null;
  recoverySummary?: TrainingRecoverySummary | null;
  recoveryInsight?: RecoveryBubble[] | null;
  onAnalyzeRecovery?: () => void;
  isAnalyzingRecovery?: boolean;
}

const WorkoutTab: React.FC<WorkoutTabProps> = ({ workoutProgram, workoutLogs, onGenerateWorkout, onSaveLog, onUpdateProfile, onUpdateWorkoutPlan, onInterpretManualHistory, onCompleteWeek, isLoading, language, profile, healthData, recoverySummary, recoveryInsight, onAnalyzeRecovery, isAnalyzingRecovery }) => {
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
  const [restEndTime, setRestEndTime] = useState<number | null>(null);
  const [restDisplay, setRestDisplay] = useState<number | null>(null);
  const [restExerciseName, setRestExerciseName] = useState<string>('');
  const [restExpired, setRestExpired] = useState(false);

  const [activeSet, setActiveSet] = useState<{exIdx: number, sIdx: number} | null>(null);
  const [manualHistoryText, setManualHistoryText] = useState(profile?.manualWorkoutHistoryText || '');
  const [isInterpretingHistory, setIsInterpretingHistory] = useState(false);
  const [manualHistoryError, setManualHistoryError] = useState<string | null>(null);
  const [manualImportMessage, setManualImportMessage] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [sessionDuration, setSessionDuration] = useState(60);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [modificationText, setModificationText] = useState('');
  const [showModInput, setShowModInput] = useState(false);

  // Total workout duration timer
  const [workoutStartTime, setWorkoutStartTime] = useState<number | null>(null);
  const [workoutElapsed, setWorkoutElapsed] = useState<number>(0);
  const [sessionNotes, setSessionNotes] = useState('');
  const [workoutAdjustInput, setWorkoutAdjustInput] = useState('');
  const [workoutDraft, setWorkoutDraft] = useState<WorkoutAdjustmentDraft | null>(null);
  const [isAdjustingWorkout, setIsAdjustingWorkout] = useState(false);

  // iOS audio unlock
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const unlockAudio = () => {
    if (audioUnlockedRef.current) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      audioCtxRef.current = ctx;
      audioUnlockedRef.current = true;
    } catch (_) {}
  };

  useEffect(() => {
    const handler = () => unlockAudio();
    document.addEventListener('touchstart', handler, { once: true, passive: true });
    document.addEventListener('click', handler, { once: true });
    return () => {
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('click', handler);
    };
  }, []);

  // Drag & Drop state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const touchStartRef = useRef<{ idx: number; startX: number; startY: number } | null>(null);
  const dayButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Exercise swap state
  const [swappingExIdx, setSwappingExIdx] = useState<number | null>(null);
  const [swapDrafts, setSwapDrafts] = useState<{ exIdx: number; options: Exercise[] } | null>(null);
  // Ad-hoc activity state
  const [showAdHocModal, setShowAdHocModal] = useState(false);
  const [adHocActivity, setAdHocActivity] = useState('');
  const [adHocDuration, setAdHocDuration] = useState(60);
  const [adHocDate, setAdHocDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isEstimatingAdHoc, setIsEstimatingAdHoc] = useState(false);

  const currentLogRef = useRef(currentLog);
  currentLogRef.current = currentLog;
  const [liveSessionData, setLiveSessionData] = useState<WorkoutSession | null>(null);

  // Auto-select first session when plan loads
  useEffect(() => {
    if (workoutProgram && workoutProgram.sessions.length > 0 && !selectedSession) {
      setSelectedSession(workoutProgram.sessions[0]);
    }
  }, [workoutProgram]);

  const ALL_DAYS = language === 'de' ? DAYS_DE : DAYS_EN;
  const SHORT_DAYS: Record<string, string> = language === 'de'
    ? { 'Montag': 'Mo', 'Dienstag': 'Di', 'Mittwoch': 'Mi', 'Donnerstag': 'Do', 'Freitag': 'Fr', 'Samstag': 'Sa', 'Sonntag': 'So' }
    : { 'Monday': 'Mon', 'Tuesday': 'Tue', 'Wednesday': 'Wed', 'Thursday': 'Thu', 'Friday': 'Fri', 'Saturday': 'Sat', 'Sunday': 'Sun' };

  const sessionByDay = useMemo(() => {
    const map: Record<string, WorkoutSession | null> = {};
    ALL_DAYS.forEach(d => { map[d] = null; });
    workoutProgram?.sessions.forEach(s => {
      const dayName = s.dayTitle.split(':')[0].trim();
      map[dayName] = s;
    });
    return map;
  }, [workoutProgram, language]);

  const getFocusPart = (dt: string) => {
    const colonIdx = dt.indexOf(':');
    return colonIdx === -1 ? '' : dt.slice(colonIdx);
  };

  const handleDayDrop = (fromDay: string, toDay: string) => {
    if (!workoutProgram || fromDay === toDay) return;
    const fromSession = sessionByDay[fromDay];
    const toSession = sessionByDay[toDay];
    if (!fromSession) return;

    if (toSession) {
      const result = workoutProgram.sessions.map(s => {
        if (s.dayTitle === fromSession.dayTitle) return { ...s, dayTitle: toDay + getFocusPart(s.dayTitle) };
        if (s.dayTitle === toSession.dayTitle) return { ...s, dayTitle: fromDay + getFocusPart(s.dayTitle) };
        return s;
      });
      const newPlan = { ...workoutProgram, sessions: result };
      onUpdateWorkoutPlan(newPlan);
      setSelectedSession(result.find(s => s.dayTitle.startsWith(toDay)) || null);
    } else {
      const result = workoutProgram.sessions.map(s => {
        if (s.dayTitle === fromSession.dayTitle) return { ...s, dayTitle: toDay + getFocusPart(s.dayTitle) };
        return s;
      });
      const newPlan = { ...workoutProgram, sessions: result };
      onUpdateWorkoutPlan(newPlan);
      setSelectedSession(result.find(s => s.dayTitle.startsWith(toDay)) || null);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };

  // Rest timer
  useEffect(() => {
    if (restEndTime === null) { setRestDisplay(null); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.round((restEndTime - Date.now()) / 1000));
      setRestDisplay(remaining);
      if (remaining <= 0) {
        setRestExpired(true);
        handleRestEnd();
        setRestEndTime(null);
      }
    };
    tick();
    const interval = setInterval(tick, 250);
    const onVisibility = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisibility); };
  }, [restEndTime]);

  // Total workout duration timer
  useEffect(() => {
    if (!workoutStartTime) { setWorkoutElapsed(0); return; }
    const tick = () => setWorkoutElapsed(Math.round((Date.now() - workoutStartTime) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVis); };
  }, [workoutStartTime]);

  useEffect(() => {
    setManualHistoryText(profile?.manualWorkoutHistoryText || '');
  }, [profile?.manualWorkoutHistoryText]);

  // Audio
  const playBeep = (frequency = 880, durationMs = 300, count = 3) => {
    try {
      const ctx = audioCtxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      if (!audioCtxRef.current) audioCtxRef.current = ctx;
      for (let i = 0; i < count; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = frequency;
        osc.type = 'sine';
        gain.gain.value = 0.3;
        const startAt = ctx.currentTime + i * (durationMs / 1000 + 0.15);
        osc.start(startAt);
        gain.gain.setValueAtTime(0.3, startAt);
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + durationMs / 1000);
        osc.stop(startAt + durationMs / 1000 + 0.05);
      }
    } catch (_) {}
  };

  const playCue = async (text: string, isRestEnd = false) => {
    if (isRestEnd) {
      playBeep(880, 250, 3);
    }
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
    setRestEndTime(Date.now() + duration * 1000);
    setRestExerciseName(exName);
    setRestExpired(false);
    playCue(language === 'de' ? `Satz beendet. Ruh dich aus für ${duration} Sekunden.` : `Set complete. Rest for ${duration} seconds.`);
  };

  const handleRestEnd = () => {
    setRestExerciseName('');
    playCue(language === 'de' ? `Pause vorbei. Nächster Satz!` : `Rest over. Next set!`, true);
    try { navigator.vibrate?.([200, 100, 200, 100, 200]); } catch (_) {}
    setTimeout(() => setRestExpired(false), 30000);
  };

  const handleAcceptSuggestion = (exIdx: number, sIdx: number, exercise: Exercise) => {
    const copy = [...currentLog];
    copy[exIdx].sets[sIdx].weight = parseSuggestedWeight(exercise.suggestedWeight);
    copy[exIdx].sets[sIdx].reps = parseMaxReps(exercise.reps);
    copy[exIdx].sets[sIdx].done = true;
    setCurrentLog(copy);
    handleRestStart(exercise.name, exercise.rest || 60);
  };

  const handleFinishSet = (exIdx: number, sIdx: number, exercise: Exercise) => {
    const copy = [...currentLog];
    copy[exIdx].sets[sIdx].done = true;
    setCurrentLog(copy);
    handleRestStart(exercise.name, exercise.rest || 60);
  };

  const handleSkipSet = (exIdx: number, sIdx: number) => {
    const copy = [...currentLog];
    copy[exIdx].sets[sIdx] = { weight: 0, reps: 0, skipped: true };
    setCurrentLog(copy);
  };

  const handleSwapExercise = async (exIdx: number, exercise: Exercise) => {
    if (swappingExIdx !== null) return;
    setSwappingExIdx(exIdx);
    setSwapDrafts(null);
    try {
      if (!profile) return;
      const options = await suggestAlternativeExercises(profile, exercise, language);
      setSwapDrafts({ exIdx, options });
    } catch (e) {
      console.error("Failed to fetch alternatives:", e);
    } finally {
      setSwappingExIdx(null);
    }
  };

  const handlePickSwap = (alternative: Exercise) => {
    if (!swapDrafts) return;
    const { exIdx } = swapDrafts;
    const sessionToUpdate = liveSessionData || selectedSession;
    if (!sessionToUpdate) return;
    const newSession = {
      ...sessionToUpdate,
      exercises: sessionToUpdate.exercises.map((ex, i) => i === exIdx ? { ...alternative } : ex)
    };
    setLiveSessionData(newSession);
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
    setSwapDrafts(null);
  };

  const handleAddAdHocActivity = async () => {
    if (!profile || !adHocActivity.trim()) return;
    setIsEstimatingAdHoc(true);
    try {
      const result = await estimateActivityCalories(profile, adHocActivity.trim(), adHocDuration, language);
      const log: WorkoutLog = {
        date: new Date(adHocDate + 'T12:00:00').toISOString(),
        sessionTitle: result.activityType,
        exercises: [],
        durationMinutes: adHocDuration,
        notes: result.summary,
        caloriesBurned: result.caloriesBurned,
        isAdHoc: true,
        activityType: result.activityType,
      };
      onSaveLog(log);
      setShowAdHocModal(false);
      setAdHocActivity('');
      setAdHocDuration(60);
      setAdHocDate(new Date().toISOString().slice(0, 10));
    } catch (e) {
      console.error("Failed to estimate activity:", e);
    } finally {
      setIsEstimatingAdHoc(false);
    }
  };

  const updatePrefs = (updates: Partial<WorkoutPreferences>) => {
    if (!profile) return;
    const newPrefs = {
      availableDays: profile.workoutPreferences?.availableDays || [],
      existingWorkouts: profile.workoutPreferences?.existingWorkouts || [],
      ...updates
    };
    onUpdateProfile({ ...profile, workoutPreferences: newPrefs });
  };

  const t = getWorkoutTranslations(language);

  const handleInterpretHistory = async () => {
    const text = manualHistoryText.trim();
    if (!text) return;
    setIsInterpretingHistory(true);
    setManualHistoryError(null);
    setManualImportMessage(null);
    try {
      const importedCount = await onInterpretManualHistory(text);
      setManualImportMessage(`${importedCount || 0} ${t.sessions} ${t.importSuccess.toLowerCase()}`);
      setManualHistoryText('');
      setShowImportModal(false);
    } catch (error) {
      console.error('Failed to interpret manual workout history:', error);
      setManualHistoryError(error instanceof Error ? error.message : t.importErrorFallback);
    } finally {
      setIsInterpretingHistory(false);
    }
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

  const activeSessionForLive = liveSessionData || selectedSession;

  // ── Loading state ──
  if (isLoading) return (
    <div className="flex flex-col items-center justify-center min-h-[500px]">
      <div className="w-20 h-20 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-8 shadow-xl shadow-indigo-600/20"></div>
      <p className="font-black uppercase tracking-[0.3em] text-[10px] text-slate-400 animate-pulse">Helio-Engine optimiert Plan...</p>
    </div>
  );

  // ════════════════════════════════════════════════════════════════
  // ██  LIVE SESSION VIEW (delegated to sub-component)
  // ════════════════════════════════════════════════════════════════
  if (isLiveSession && activeSessionForLive) return (
    <LiveSession
      session={activeSessionForLive}
      currentLog={currentLog}
      setCurrentLog={setCurrentLog}
      onSaveLog={(log) => {
        onSaveLog(log);
        setSaveToast(language === 'de' ? 'Training gespeichert!' : 'Workout saved!');
        setTimeout(() => setSaveToast(null), 3000);
      }}
      onFinish={() => {
        setIsLiveSession(false);
        setLiveSessionData(null);
        setWorkoutStartTime(null);
        setSessionNotes('');
        setWorkoutAdjustInput('');
        setWorkoutDraft(null);
      }}
      language={language}
      profile={profile}
      t={t}
      workoutLogs={workoutLogs}
      restDisplay={restDisplay}
      restEndTime={restEndTime}
      setRestEndTime={setRestEndTime}
      restExerciseName={restExerciseName}
      setRestExerciseName={setRestExerciseName}
      restExpired={restExpired}
      setRestExpired={setRestExpired}
      workoutElapsed={workoutElapsed}
      workoutStartTime={workoutStartTime}
      sessionNotes={sessionNotes}
      setSessionNotes={setSessionNotes}
      saveToast={saveToast}
      handleRestStart={handleRestStart}
      handleAcceptSuggestion={handleAcceptSuggestion}
      handleFinishSet={handleFinishSet}
      handleSkipSet={handleSkipSet}
      handleSwapExercise={handleSwapExercise}
      swappingExIdx={swappingExIdx}
      swapDrafts={swapDrafts}
      handlePickSwap={handlePickSwap}
      setSwapDrafts={() => setSwapDrafts(null)}
      workoutAdjustInput={workoutAdjustInput}
      setWorkoutAdjustInput={setWorkoutAdjustInput}
      workoutDraft={workoutDraft}
      setWorkoutDraft={setWorkoutDraft}
      isAdjustingWorkout={isAdjustingWorkout}
      setIsAdjustingWorkout={setIsAdjustingWorkout}
      onUpdateWorkoutPlan={onUpdateWorkoutPlan}
      workoutProgram={workoutProgram}
      liveSessionData={liveSessionData}
      setLiveSessionData={setLiveSessionData}
      playCue={playCue}
    />
  );

  // ════════════════════════════════════════════════════════════════
  // ██  MAIN VIEW (Plan + Stats tabs)
  // ════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-8 pb-20 animate-fade-in relative">
      {saveToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 bg-emerald-600 text-white rounded-2xl font-bold text-sm shadow-2xl shadow-emerald-600/30 border border-emerald-400/30 animate-fade-in max-w-sm text-center">
          {saveToast}
        </div>
      )}
      <div className="flex gap-2 p-1.5 bg-slate-800/40 border border-white/5 backdrop-blur-md rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('plan')}
          className={`px-4 sm:px-8 py-2.5 sm:py-3 rounded-xl font-black text-xs uppercase transition-all ${activeTab === 'plan' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-300'}`}
        >
          {t.plan}
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-4 sm:px-8 py-2.5 sm:py-3 rounded-xl font-black text-xs uppercase transition-all ${activeTab === 'stats' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-300'}`}
        >
          {t.stats}
        </button>
      </div>

      {activeTab === 'plan' ? (
        <div className="space-y-8">
          {(!workoutProgram || showConfig) ? (
            <div className="bg-[#1a1f26] rounded-[2rem] sm:rounded-[3.5rem] shadow-2xl p-5 sm:p-8 lg:p-14 border border-white/5 space-y-12 animate-fade-in relative overflow-hidden">
              <div className="absolute top-0 right-0 p-12 opacity-5 text-9xl pointer-events-none translate-x-4"><i className="fas fa-meteor text-white"></i></div>
              {/* ── Config header ── */}
              <div className="space-y-3 relative z-10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-indigo-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">{t.optimizationEngine}</p>
                    <h3 className="text-2xl sm:text-4xl font-black text-white tracking-tighter uppercase leading-none">{t.setup}</h3>
                    <p className="text-slate-500 text-sm sm:text-base font-medium mt-2 sm:mt-4">{t.configSub}</p>
                  </div>
                  {workoutProgram && (
                    <button onClick={() => setShowConfig(false)} className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center transition-all border border-white/5">
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                </div>
              </div>

              {/* ── Availability ── */}
              <div className="space-y-6 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center">
                    <i className="fas fa-calendar-check text-indigo-400 text-xs"></i>
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.availability}</p>
                </div>
                <div className="flex flex-wrap gap-2 sm:gap-3">
                  {daysList.map(d => (
                    <button key={d} onClick={() => { const next = availableDays.includes(d) ? availableDays.filter(x => x !== d) : [...availableDays, d]; setAvailableDays(next); updatePrefs({ availableDays: next }); }}
                      className={`px-4 sm:px-6 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-wider transition-all border ${availableDays.includes(d) ? 'bg-indigo-600 text-white border-indigo-400/40 shadow-xl shadow-indigo-600/20' : 'bg-slate-800/40 text-slate-500 border-white/5 hover:text-white hover:border-white/10'}`}
                    >{d}</button>
                  ))}
                </div>
                <button onClick={handleAutoSuggest} disabled={isSuggesting} className="px-6 py-3 bg-violet-600/10 hover:bg-violet-600/20 text-violet-400 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-violet-500/20 transition-all">
                  <i className="fas fa-wand-magic-sparkles mr-2"></i>
                  {isSuggesting ? t.suggesting : t.autoSuggest}
                </button>
                {suggestionText && (
                  <div className="p-5 bg-violet-500/5 border border-violet-500/10 rounded-2xl text-sm text-violet-200 font-medium">{suggestionText}</div>
                )}
              </div>

              {/* ── Fixed workouts ── */}
              <div className="space-y-6 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-600/10 border border-amber-500/20 flex items-center justify-center">
                    <i className="fas fa-calendar-plus text-amber-400 text-xs"></i>
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.fixed}</p>
                </div>
                {existingWorkouts.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {existingWorkouts.map((ew, i) => (
                      <div key={i} className="flex items-center gap-2 px-4 py-2 bg-amber-600/5 border border-amber-500/20 rounded-xl">
                        <span className="text-xs font-bold text-amber-200">{ew.day}: {ew.activity}</span>
                        <button onClick={() => handleRemoveFixed(i)} className="text-slate-500 hover:text-red-400 transition-colors"><i className="fas fa-times text-[10px]"></i></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-3 items-center">
                  <select value={newFixedDay} onChange={e => setNewFixedDay(e.target.value)} className="bg-slate-800/60 text-white rounded-xl px-4 py-3 text-sm font-bold border border-white/5 outline-none">
                    {daysList.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <input value={newFixedActivity} onChange={e => setNewFixedActivity(e.target.value)} placeholder={t.activityPlaceholder}
                    className="flex-1 min-w-[160px] bg-slate-800/60 text-white rounded-xl px-4 py-3 text-sm font-medium border border-white/5 outline-none placeholder:text-slate-600"
                  />
                  <button onClick={handleAddFixed} className="px-5 py-3 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 rounded-xl text-xs font-black uppercase tracking-widest border border-amber-500/20 transition-all">
                    <i className="fas fa-plus mr-1"></i> {t.add}
                  </button>
                </div>
              </div>

              {/* ── Session Duration ── */}
              <div className="space-y-4 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center">
                    <i className="fas fa-stopwatch text-emerald-400 text-xs"></i>
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.sessionDuration}</p>
                </div>
                <div className="flex items-center gap-4">
                  <input type="range" min={30} max={120} step={5} value={sessionDuration} onChange={e => setSessionDuration(Number(e.target.value))} className="flex-1 accent-emerald-500" />
                  <span className="text-white font-black text-xl min-w-[5rem] text-center">{sessionDuration} {t.durationMin}</span>
                </div>
              </div>

              {/* ── Plan modification ── */}
              {workoutProgram && (
                <div className="space-y-4 relative z-10">
                  <button onClick={() => setShowModInput(!showModInput)} className="flex items-center gap-3 text-slate-400 hover:text-white transition-colors">
                    <i className={`fas fa-chevron-${showModInput ? 'up' : 'down'} text-xs`}></i>
                    <span className="text-[10px] font-black uppercase tracking-widest">{t.modifyPlan}</span>
                  </button>
                  {showModInput && (
                    <div className="space-y-3">
                      <textarea value={modificationText} onChange={e => setModificationText(e.target.value)} placeholder={t.modifyPlaceholder}
                        className="w-full min-h-[80px] rounded-xl border border-white/10 bg-slate-900/60 p-4 text-sm text-white outline-none focus:border-indigo-500 placeholder:text-slate-600"
                      />
                      <button onClick={() => { onGenerateWorkout(availableDays, existingWorkouts, sessionDuration, modificationText); setShowConfig(false); setModificationText(''); }}
                        disabled={!modificationText.trim()} className="w-full py-4 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-violet-400/20">
                        <i className="fas fa-rotate mr-2"></i> {t.modifySubmit}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Generate button ── */}
              <button onClick={() => { onGenerateWorkout(availableDays, existingWorkouts, sessionDuration); setShowConfig(false); }}
                disabled={availableDays.length === 0}
                className="w-full py-5 sm:py-7 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white rounded-[1.5rem] sm:rounded-[2.5rem] font-black uppercase text-xs sm:text-sm tracking-widest transition-all shadow-2xl shadow-indigo-600/20 disabled:shadow-none relative z-10"
              >
                <i className="fas fa-bolt mr-3"></i>{t.create}
              </button>
            </div>
          ) : (
            /* ── Workout Plan View ── */
            <div className="space-y-8">
              {/* Day selector (drag & drop) */}
              <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none">
                {ALL_DAYS.map((day, idx) => {
                  const session = sessionByDay[day];
                  const isSelected = selectedSession?.dayTitle?.startsWith(day);
                  return (
                    <button key={day} ref={el => { dayButtonRefs.current[idx] = el; }}
                      draggable={!!session}
                      onDragStart={() => { if (session) setDragIdx(idx); }}
                      onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                      onDragLeave={() => setDragOverIdx(null)}
                      onDrop={() => { if (dragIdx !== null) { handleDayDrop(ALL_DAYS[dragIdx], day); } setDragOverIdx(null); }}
                      onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                      onTouchStart={(e) => { if (session) { touchStartRef.current = { idx, startX: e.touches[0].clientX, startY: e.touches[0].clientY }; } }}
                      onTouchMove={(e) => {
                        if (!touchStartRef.current) return;
                        const touch = e.touches[0];
                        const dx = Math.abs(touch.clientX - touchStartRef.current.startX);
                        const dy = Math.abs(touch.clientY - touchStartRef.current.startY);
                        if (dx > 10 && dx > dy) {
                          const el = document.elementFromPoint(touch.clientX, touch.clientY);
                          const btnIdx = dayButtonRefs.current.findIndex(b => b && b.contains(el));
                          if (btnIdx >= 0 && btnIdx !== touchStartRef.current.idx) { setDragOverIdx(btnIdx); }
                        }
                      }}
                      onTouchEnd={() => {
                        if (touchStartRef.current && dragOverIdx !== null && dragOverIdx !== touchStartRef.current.idx) {
                          handleDayDrop(ALL_DAYS[touchStartRef.current.idx], ALL_DAYS[dragOverIdx]);
                        }
                        touchStartRef.current = null;
                        setDragOverIdx(null);
                      }}
                      onClick={() => { if (session) setSelectedSession(session); }}
                      className={`flex-shrink-0 flex flex-col items-center gap-1 px-2.5 sm:px-4 py-2 sm:py-3 rounded-xl sm:rounded-2xl border transition-all text-center min-w-[48px] sm:min-w-[64px] ${
                        dragOverIdx === idx ? 'border-indigo-400 bg-indigo-600/20 scale-110' :
                        isSelected ? 'bg-indigo-600 text-white border-indigo-400/40 shadow-xl shadow-indigo-600/20' :
                        session ? 'bg-slate-800/60 text-white border-white/10 hover:border-indigo-500/30' :
                        'bg-slate-800/20 text-slate-600 border-white/5'
                      }`}
                    >
                      <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider">{SHORT_DAYS[day]}</span>
                      {session && <div className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-indigo-400'}`}></div>}
                    </button>
                  );
                })}
              </div>

              {/* Selected session detail */}
              {selectedSession && (
                <div className="bg-[#1a1f26] rounded-[2rem] sm:rounded-[3.5rem] shadow-2xl p-5 sm:p-8 lg:p-14 border border-white/5 space-y-8 sm:space-y-14 animate-fade-in relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-14 opacity-5 text-9xl pointer-events-none translate-x-4"><i className="fas fa-fire text-white"></i></div>

                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6 relative z-10">
                    <div className="space-y-2">
                      <p className="text-indigo-500 text-[10px] font-black uppercase tracking-[0.3em]">{t.activeProtocol}</p>
                      <h3 className="text-xl sm:text-4xl font-black text-white tracking-tighter uppercase leading-none">{selectedSession.dayTitle}</h3>
                      <p className="text-xs sm:text-sm text-slate-500 font-medium">{selectedSession.exercises.length} {t.exercises} • {selectedSession.exercises.reduce((a, e) => a + e.sets, 0)} {t.setLabel}s</p>
                    </div>
                    <div className="flex gap-2 sm:gap-3 flex-shrink-0">
                      <button onClick={() => setShowConfig(true)} className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 flex items-center justify-center transition-all" title={t.adapt}>
                        <i className="fas fa-cog text-sm sm:text-base"></i>
                      </button>
                      <button onClick={() => exportWorkoutToICS(selectedSession, language)} className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 flex items-center justify-center transition-all" title={t.export}>
                        <i className="fas fa-calendar-plus text-sm sm:text-base"></i>
                      </button>
                      <button
                        onClick={() => {
                          setIsLiveSession(true);
                          setLiveSessionData({ ...selectedSession });
                          setCurrentLog(selectedSession.exercises.map(ex => ({ exerciseName: ex.name, sets: Array.from({ length: ex.sets }, () => ({ weight: 0, reps: 0 })) })));
                          setWorkoutStartTime(Date.now());
                        }}
                        className="px-5 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl sm:rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-600/20 transition-all border border-emerald-400/20"
                      >
                        <i className="fas fa-play mr-2"></i>{t.start}
                      </button>
                    </div>
                  </div>

                  {/* Exercise list */}
                  <div className="space-y-4 sm:space-y-8 relative z-10">
                    {selectedSession.exercises.map((ex, i) => (
                      <div key={i} className="p-4 sm:p-8 bg-slate-800/30 border border-white/5 rounded-2xl sm:rounded-[2.5rem] hover:border-indigo-500/20 transition-all group">
                        <div className="flex items-start gap-4 sm:gap-6">
                          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-[1.5rem] bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-black text-sm sm:text-xl flex-shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-xl">{i+1}</div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm sm:text-xl font-black text-white uppercase tracking-tight group-hover:text-indigo-400 transition-colors truncate">{ex.name}</h4>
                            <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-6 gap-y-1 mt-2 sm:mt-3">
                              <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider"><i className="fas fa-layer-group mr-1 sm:mr-2 text-indigo-500/50"></i>{ex.sets} × {ex.reps}</span>
                              <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider"><i className="fas fa-clock mr-1 sm:mr-2 text-indigo-500/50"></i>{ex.rest}s {t.rest}</span>
                              {ex.suggestedWeight && (
                                <span className="text-[10px] sm:text-xs font-black text-amber-500/80 uppercase tracking-wider"><i className="fas fa-weight-hanging mr-1 sm:mr-2"></i>{ex.suggestedWeight}</span>
                              )}
                            </div>
                            {ex.equipment && (
                              <span className="inline-block mt-2 px-3 py-1 bg-white/5 text-slate-500 border border-white/5 rounded-lg text-[8px] sm:text-[9px] font-black uppercase tracking-widest">{ex.equipment}</span>
                            )}
                            {ex.notes && <p className="text-[10px] sm:text-xs text-slate-500 mt-2 sm:mt-3 font-medium italic">{ex.notes}</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Cardio recommendations */}
                  {selectedSession.cardioRecommendations && selectedSession.cardioRecommendations.length > 0 && (
                    <div className="space-y-4 relative z-10">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-orange-600/10 border border-orange-500/20 flex items-center justify-center">
                          <i className="fas fa-heart-pulse text-orange-400 text-xs"></i>
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.cardioTitle}</p>
                      </div>
                      {selectedSession.cardioRecommendations.map((c, i) => (
                        <div key={i} className="p-4 bg-orange-500/5 border border-orange-500/10 rounded-2xl flex items-center gap-4">
                          <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-400"><i className="fas fa-person-running"></i></div>
                          <div>
                            <p className="text-sm font-black text-white">{c.type}</p>
                            <p className="text-[10px] text-slate-400 font-bold">{c.duration} • {c.intensity}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Warmup */}
                  {selectedSession.warmup && (
                    <div className="p-5 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl relative z-10">
                      <div className="flex items-center gap-2 mb-2"><i className="fas fa-fire-flame-curved text-emerald-400 text-xs"></i><p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{t.warmup}</p></div>
                      <p className="text-sm text-slate-300 font-medium">{selectedSession.warmup}</p>
                    </div>
                  )}

                  {/* Complete week */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 relative z-10">
                    <button
                      onClick={onCompleteWeek}
                      className="flex-1 py-4 sm:py-5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-[1.5rem] sm:rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl shadow-violet-600/20 transition-all border border-violet-400/20"
                    >
                      <i className="fas fa-flag-checkered"></i> {t.completeWeek}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ════════════════════════════════════════════════════════════
           ██  STATS TAB (delegated to sub-component)
           ════════════════════════════════════════════════════════════ */
        <WorkoutHistory
          workoutLogs={workoutLogs}
          language={language}
          t={t}
          recoverySummary={recoverySummary}
          recoveryInsight={recoveryInsight}
          onAnalyzeRecovery={onAnalyzeRecovery}
          isAnalyzingRecovery={isAnalyzingRecovery}
          showAdHocModal={showAdHocModal}
          setShowAdHocModal={setShowAdHocModal}
          adHocActivity={adHocActivity}
          setAdHocActivity={setAdHocActivity}
          adHocDuration={adHocDuration}
          setAdHocDuration={setAdHocDuration}
          adHocDate={adHocDate}
          setAdHocDate={setAdHocDate}
          isEstimatingAdHoc={isEstimatingAdHoc}
          handleAddAdHocActivity={handleAddAdHocActivity}
          showImportModal={showImportModal}
          setShowImportModal={setShowImportModal}
          manualHistoryText={manualHistoryText}
          setManualHistoryText={setManualHistoryText}
          isInterpretingHistory={isInterpretingHistory}
          handleInterpretHistory={handleInterpretHistory}
          manualHistoryError={manualHistoryError}
          manualImportMessage={manualImportMessage}
          setManualHistoryError={setManualHistoryError}
          setManualImportMessage={setManualImportMessage}
        />
      )}
    </div>
  );
};

export default WorkoutTab;
