
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { WorkoutProgram, WorkoutSession, Exercise, ExistingWorkout, WorkoutLog, ExerciseLog, Language, UserProfile, WorkoutPreferences, RecoveryBubble } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Bar, BarChart, ComposedChart, Legend, Cell } from 'recharts';
import { analyzeWorkoutProgress, suggestWorkoutPreferences, generateWorkoutCue, suggestAlternativeExercises, adjustWorkoutSession, WorkoutAdjustmentDraft, estimateActivityCalories } from '../services/geminiService';
import { exportWorkoutToICS } from '../services/calendarService';
import { RecoveryEntry, TrainingRecoverySummary } from '../services/recoveryService';
import { HealthData } from '../types';

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

const getDisplayWeight = (set: ExerciseLog['sets'][number]) => set.weightText || (set.weight ? `${set.weight}kg` : '-');
const getDisplayReps = (set: ExerciseLog['sets'][number]) => set.repsText || (set.reps ? String(set.reps) : '-');

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

  // Timer states — use absolute end time so it survives screen-off / tab switch
  const [restEndTime, setRestEndTime] = useState<number | null>(null);
  const [restDisplay, setRestDisplay] = useState<number | null>(null);
  const [restExerciseName, setRestExerciseName] = useState<string>('');

  // State for expanded history details
  const [expandedLogIdx, setExpandedLogIdx] = useState<number | null>(null);

  const [activeSet, setActiveSet] = useState<{exIdx: number, sIdx: number} | null>(null);
  const [selectedExerciseInfo, setSelectedExerciseInfo] = useState<Exercise | null>(null);
  const [manualHistoryText, setManualHistoryText] = useState(profile?.manualWorkoutHistoryText || '');
  const [isInterpretingHistory, setIsInterpretingHistory] = useState(false);
  const [manualHistoryError, setManualHistoryError] = useState<string | null>(null);
  const [manualImportMessage, setManualImportMessage] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [sessionDuration, setSessionDuration] = useState(60);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [modificationText, setModificationText] = useState('');
  const [showModInput, setShowModInput] = useState(false);

  // ── Total workout duration timer ──
  const [workoutStartTime, setWorkoutStartTime] = useState<number | null>(null);
  const [workoutElapsed, setWorkoutElapsed] = useState<number>(0); // seconds
  const [sessionNotes, setSessionNotes] = useState('');
  const [workoutAdjustInput, setWorkoutAdjustInput] = useState('');
  const [workoutDraft, setWorkoutDraft] = useState<WorkoutAdjustmentDraft | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [isAdjustingWorkout, setIsAdjustingWorkout] = useState(false);

  // ── Rest timer expired state ──
  const [restExpired, setRestExpired] = useState(false);

  // iOS audio unlock: create AudioContext on first user interaction so timer sounds work
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const unlockAudio = () => {
    if (audioUnlockedRef.current) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      // Play a silent buffer to unlock
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      audioCtxRef.current = ctx;
      audioUnlockedRef.current = true;
    } catch (_) {}
  };

  // Unlock audio on any user tap in the workout area
  useEffect(() => {
    const handler = () => unlockAudio();
    document.addEventListener('touchstart', handler, { once: true, passive: true });
    document.addEventListener('click', handler, { once: true });
    return () => {
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('click', handler);
    };
  }, []);

  // ── Drag & Drop state for session reordering ──
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  // Touch drag state
  const touchStartRef = useRef<{ idx: number; startX: number; startY: number } | null>(null);
  const dayButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // ── Exercise swap state ──
  const [swappingExIdx, setSwappingExIdx] = useState<number | null>(null);
  const [swapDrafts, setSwapDrafts] = useState<{ exIdx: number; options: Exercise[] } | null>(null);
  // ── Ad-hoc activity state ──
  const [showAdHocModal, setShowAdHocModal] = useState(false);
  const [adHocActivity, setAdHocActivity] = useState('');
  const [adHocDuration, setAdHocDuration] = useState(60);
  const [isEstimatingAdHoc, setIsEstimatingAdHoc] = useState(false);
  // ── Exercise history state ──
  const [historyExercise, setHistoryExercise] = useState<string | null>(null);
  // Ref to always have latest currentLog for save (avoids stale closure after exercise swap)
  const currentLogRef = useRef(currentLog);
  currentLogRef.current = currentLog;
  // We keep a mutable copy of the session for swaps (so original plan stays untouched)
  const [liveSessionData, setLiveSessionData] = useState<WorkoutSession | null>(null);

  // Auto-select first session when plan loads
  useEffect(() => {
    if (workoutProgram && workoutProgram.sessions.length > 0 && !selectedSession) {
      setSelectedSession(workoutProgram.sessions[0]);
    }
  }, [workoutProgram]);

  // ── Full week days for drag & drop ──
  const ALL_DAYS = language === 'de' ? DAYS_DE : DAYS_EN;
  const SHORT_DAYS: Record<string, string> = language === 'de'
    ? { 'Montag': 'Mo', 'Dienstag': 'Di', 'Mittwoch': 'Mi', 'Donnerstag': 'Do', 'Freitag': 'Fr', 'Samstag': 'Sa', 'Sonntag': 'So' }
    : { 'Monday': 'Mon', 'Tuesday': 'Tue', 'Wednesday': 'Wed', 'Thursday': 'Thu', 'Friday': 'Fri', 'Saturday': 'Sat', 'Sunday': 'Sun' };

  // Map day name → session (if any)
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

  // ── Drag & Drop: move session to another day ──
  const handleDayDrop = (fromDay: string, toDay: string) => {
    if (!workoutProgram || fromDay === toDay) return;
    const fromSession = sessionByDay[fromDay];
    const toSession = sessionByDay[toDay];
    if (!fromSession) return; // nothing to move

    const sessions = workoutProgram.sessions.map(s => ({ ...s }));

    if (toSession) {
      // Swap: both days have sessions → swap their day prefixes
      const fromFocus = getFocusPart(fromSession.dayTitle);
      const toFocus = getFocusPart(toSession.dayTitle);
      sessions.forEach(s => {
        if (s.dayTitle === fromSession.dayTitle) s.dayTitle = fromDay + toFocus;
        else if (s.dayTitle === toSession.dayTitle) s.dayTitle = toDay + fromFocus;
      });
      // Fix: after swap, reassign correctly
      const updated = sessions.map(s => {
        if (s === sessions.find(x => x.dayTitle === fromDay + toFocus)) {
          return { ...fromSession, dayTitle: toDay + fromFocus };
        }
        if (s === sessions.find(x => x.dayTitle === toDay + fromFocus)) {
          return { ...toSession, dayTitle: fromDay + toFocus };
        }
        return s;
      });
      // Simpler approach: just find and update the two sessions
      const result = workoutProgram.sessions.map(s => {
        if (s.dayTitle === fromSession.dayTitle) return { ...s, dayTitle: toDay + getFocusPart(s.dayTitle) };
        if (s.dayTitle === toSession.dayTitle) return { ...s, dayTitle: fromDay + getFocusPart(s.dayTitle) };
        return s;
      });
      const newPlan = { ...workoutProgram, sessions: result };
      onUpdateWorkoutPlan(newPlan);
      setSelectedSession(result.find(s => s.dayTitle.startsWith(toDay)) || null);
    } else {
      // Move to empty day: just change the day prefix
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

  // Absolute-time based rest timer — keeps ticking even when screen is off / app switched
  useEffect(() => {
    if (restEndTime === null) { setRestDisplay(null); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.round((restEndTime - Date.now()) / 1000));
      setRestDisplay(remaining);
      if (remaining <= 0) {
        setRestExpired(true); // Show "rest expired" notification
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

  // Play a beep tone via Web Audio API (works on iOS after unlock)
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
    // Always play beep as immediate feedback (works on iOS)
    if (isRestEnd) {
      playBeep(880, 250, 3); // 3 beeps for rest end
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
    // Vibrate on Android (3 short pulses) — ignored on iOS
    try { navigator.vibrate?.([200, 100, 200, 100, 200]); } catch (_) {}
    // Auto-hide notification after 30 seconds
    setTimeout(() => setRestExpired(false), 30000);
  };

  // ── NEW: Accept suggested weight + max reps ──
  const handleAcceptSuggestion = (exIdx: number, sIdx: number, exercise: Exercise) => {
    const copy = [...currentLog];
    copy[exIdx].sets[sIdx].weight = parseSuggestedWeight(exercise.suggestedWeight);
    copy[exIdx].sets[sIdx].reps = parseMaxReps(exercise.reps);
    copy[exIdx].sets[sIdx].done = true;
    setCurrentLog(copy);
    handleRestStart(exercise.name, exercise.rest || 60);
  };

  // ── Finish set explicitly (manual entry) ──
  const handleFinishSet = (exIdx: number, sIdx: number, exercise: Exercise) => {
    const copy = [...currentLog];
    copy[exIdx].sets[sIdx].done = true;
    setCurrentLog(copy);
    handleRestStart(exercise.name, exercise.rest || 60);
  };

  // ── NEW: Skip set ──
  const handleSkipSet = (exIdx: number, sIdx: number) => {
    const copy = [...currentLog];
    copy[exIdx].sets[sIdx] = { weight: 0, reps: 0, skipped: true };
    setCurrentLog(copy);
  };

  // ── NEW: Swap exercise via AI (with confirmation) ──
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

  // Handle ad-hoc activity submission
  const handleAddAdHocActivity = async () => {
    if (!profile || !adHocActivity.trim()) return;
    setIsEstimatingAdHoc(true);
    try {
      const result = await estimateActivityCalories(profile, adHocActivity.trim(), adHocDuration, language);
      const log: WorkoutLog = {
        date: new Date().toISOString(),
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
    } catch (e) {
      console.error("Failed to estimate activity:", e);
    } finally {
      setIsEstimatingAdHoc(false);
    }
  };

  // Get exercise history from logs
  const getExerciseHistory = (exerciseName: string) => {
    return workoutLogs
      .flatMap(log => log.exercises
        .filter(ex => ex.exerciseName.toLowerCase() === exerciseName.toLowerCase())
        .map(ex => ({ date: log.date, sets: ex.sets }))
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
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
    acceptSuggestion: 'Vorschlag übernehmen', skipSet: 'Nicht gemacht', swapping: 'Alternativen werden gesucht...', pickAlternative: 'Alternative wählen', cancelSwap: 'Abbrechen',
    addActivity: 'Aktivität hinzufügen', activityName: 'Aktivität (z.B. Padel Tennis, Schwimmen)', duration: 'Dauer (Min)', estimating: 'Kalorien werden geschätzt...', addToHistory: 'Zur Historie hinzufügen', kcalBurned: 'kcal verbrannt',
    exerciseHistory: 'Übungshistorie', noHistory: 'Noch keine Daten für diese Übung', prevSets: 'Vorherige Sets',
    finishSet: 'Satz beenden', skipped: 'Übersprungen',
    liveSession: 'Live-Session',
    protocol: 'Protokoll',
    noInstructions: 'Keine detaillierten Anweisungen gefunden. Achte auf kontrollierte Ausführung und vollen Bewegungsradius.',
    aiDeepDive: 'KI-Analyse',
    optimizationEngine: 'Optimierungs-Engine',
    activeProtocol: 'Aktives Protokoll',
    prTracker: 'PR-Tracker',
    lastResult: 'Letztes Ergebnis',
    progressTracker: 'Fortschrittstracker',
    sessions: 'Sessions',
    noSessions: 'Noch keine Trainingseinheiten erfasst.',
    exercises: 'Übungen',
    setLabel: 'Satz',
    manualHistoryTitle: 'Trainingshistorie importieren',
    manualHistorySubtitle: 'Freitext oder JSON aus alten Trainingsnotizen einfügen und als normale abgeschlossene Workout-Historie übernehmen.',
    manualHistoryPlaceholder: 'z.B. Jan-Feb: 3x/Woche Ganzkörper. Bankdrücken 3x8 mit 60 kg, Kniebeugen 3x5 mit 80 kg, Kreuzheben selten wegen Rücken...',
    interpretHistory: 'Historie importieren',
    interpretingHistory: 'Historie wird importiert...',
    importedHistorySummary: 'Historienimport',
    importSuccess: 'Sessions erfolgreich importiert.',
    importErrorFallback: 'Die Historie konnte nicht importiert werden. Bitte API-Key und Eingabetext prüfen.',
    openImport: 'Historie importieren',
    close: 'Schließen',
    completeWeek: 'Woche abschließen',
    completeWeekSub: 'Trainingswoche in Historie übernehmen',
    sessionDuration: 'Trainingsdauer',
    durationMin: 'min',
    cardioTitle: 'Cardio-Empfehlungen',
    warmup: 'Warmup',
    modifyPlan: 'Plan anpassen',
    modifyPlaceholder: 'z.B. "Ersetze Kreuzheben durch Rumänisches Kreuzheben" oder "Mehr Fokus auf Schultern"...',
    modifySubmit: 'Plan mit Änderungen neu generieren',
    recoveryTitle: 'Training & Recovery',
    trainingLoad: 'Trainingsbelastung',
    recoveryScore: 'Recovery Score',
    avgRecovery: 'Ø Recovery',
    avgLoad: 'Ø Belastung',
    trend: 'Trend',
    improving: 'Aufwärts',
    stable: 'Stabil',
    declining: 'Abwärts',
    optimal: 'Optimal',
    adequate: 'Ausreichend',
    insufficient: 'Unzureichend',
    loadRatio: 'Load/Recovery',
    analyzeRecovery: 'Recovery analysieren',
    analyzingRecovery: 'Analysiere...',
    noRecoveryData: 'Noch keine Recovery-Daten. Logge Workouts und synchronisiere Gesundheitsdaten.',
  } : {
    plan: 'Workout Plan', stats: 'History & Analysis', setup: 'Workout Engine', configSub: 'Adjust training logic', create: 'Generate New Plan', adapt: 'Open Engine', focus: 'Focus', start: 'Start Workout', save: 'Save Session', weight: 'Weight (kg)', reps: 'Reps', rest: 'Rest', export: 'Export', history: 'Weekly Archive', plannedVsActual: 'Planned vs Actual', volume: 'Volume Trend', availability: 'Your available days', fixed: 'Fixed Appointments / Classes', add: 'Add Appointment', activityPlaceholder: 'e.g. Yoga Class, Soccer...',
    autoSuggest: 'AI Suggestion', suggesting: 'Analyzing Profile...',
    acceptSuggestion: 'Use Suggestion', skipSet: 'Skip Set', swapping: 'Finding alternatives...', pickAlternative: 'Pick Alternative', cancelSwap: 'Cancel',
    addActivity: 'Add Activity', activityName: 'Activity (e.g. Padel Tennis, Swimming)', duration: 'Duration (min)', estimating: 'Estimating calories...', addToHistory: 'Add to History', kcalBurned: 'kcal burned',
    exerciseHistory: 'Exercise History', noHistory: 'No data for this exercise yet', prevSets: 'Previous Sets',
    finishSet: 'Finish Set', skipped: 'Skipped',
    liveSession: 'Live Session',
    protocol: 'Protocol',
    noInstructions: 'No detailed instructions found. Focus on controlled movements and full range of motion.',
    aiDeepDive: 'AI Deep Dive',
    optimizationEngine: 'Optimization Engine',
    activeProtocol: 'Active Protocol',
    prTracker: 'PR Tracker',
    lastResult: 'Last Result',
    progressTracker: 'Progress Tracker',
    sessions: 'Sessions',
    noSessions: 'No training sessions recorded yet.',
    exercises: 'Exercises',
    setLabel: 'Set',
    manualHistoryTitle: 'Import Workout History',
    manualHistorySubtitle: 'Paste free text or JSON from old training notes and import it as regular completed workout history.',
    manualHistoryPlaceholder: 'e.g. Jan-Feb: full body 3x/week. Bench press 3x8 at 60 kg, squat 3x5 at 80 kg, deadlifts rarely due to back...',
    interpretHistory: 'Import History',
    interpretingHistory: 'Importing history...',
    importedHistorySummary: 'History Import',
    importSuccess: 'Sessions imported successfully.',
    importErrorFallback: 'The history could not be imported. Please check the API key and your input.',
    openImport: 'Import History',
    close: 'Close',
    completeWeek: 'Complete Week',
    completeWeekSub: 'Move this training week into history',
    sessionDuration: 'Session Duration',
    durationMin: 'min',
    cardioTitle: 'Cardio Recommendations',
    warmup: 'Warmup',
    modifyPlan: 'Modify Plan',
    modifyPlaceholder: 'e.g. "Replace deadlifts with Romanian deadlifts" or "More focus on shoulders"...',
    modifySubmit: 'Regenerate plan with changes',
    recoveryTitle: 'Training & Recovery',
    trainingLoad: 'Training Load',
    recoveryScore: 'Recovery Score',
    avgRecovery: 'Avg Recovery',
    avgLoad: 'Avg Load',
    trend: 'Trend',
    improving: 'Improving',
    stable: 'Stable',
    declining: 'Declining',
    optimal: 'Optimal',
    adequate: 'Adequate',
    insufficient: 'Insufficient',
    loadRatio: 'Load/Recovery',
    analyzeRecovery: 'Analyze Recovery',
    analyzingRecovery: 'Analyzing...',
    noRecoveryData: 'No recovery data yet. Log workouts and sync health data.',
  };

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
    <div className="max-w-4xl mx-auto space-y-8 pb-28 animate-fade-in relative">
      {/* ── Sticky floating timer (always visible at bottom while resting) ── */}
      {restDisplay !== null && restDisplay > 0 && (
        <div className="fixed bottom-20 sm:bottom-4 left-2 right-2 sm:left-1/2 sm:-translate-x-1/2 sm:w-auto z-[200] px-5 py-4 bg-gradient-to-r from-orange-600 to-amber-600 text-white rounded-2xl font-black shadow-2xl shadow-orange-600/40 border border-orange-400/30 flex items-center justify-center gap-4 animate-fade-in backdrop-blur-md">
          <i className="fas fa-clock text-base opacity-80"></i>
          <span className="tabular-nums text-2xl">{Math.floor(restDisplay / 60)}:{String(restDisplay % 60).padStart(2, '0')}</span>
          <span className="text-[10px] font-bold opacity-70 uppercase max-w-[140px] truncate">{restExerciseName}</span>
          <button
            onClick={() => { setRestEndTime(null); setRestExerciseName(''); }}
            className="ml-2 w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all"
          >
            <i className="fas fa-forward text-sm"></i>
          </button>
        </div>
      )}

      {/* ── Rest expired notification ── */}
      {restExpired && restDisplay === null && (
        <div className="fixed bottom-20 sm:bottom-4 left-2 right-2 sm:left-1/2 sm:-translate-x-1/2 sm:w-auto z-[200] px-6 py-5 bg-gradient-to-r from-emerald-600 to-cyan-600 text-white rounded-2xl font-black shadow-2xl shadow-emerald-600/40 border border-emerald-400/30 flex items-center justify-center gap-4 animate-fade-in backdrop-blur-md">
          <i className="fas fa-bell text-xl animate-bounce"></i>
          <div className="flex flex-col">
            <span className="text-base tracking-wide">{language === 'de' ? 'Pause vorbei!' : 'Rest over!'}</span>
            <span className="text-[10px] font-bold opacity-80 uppercase">{language === 'de' ? 'Nächster Satz bereit' : 'Next set ready'}</span>
          </div>
          <button
            onClick={() => setRestExpired(false)}
            className="ml-3 w-10 h-10 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all"
          >
            <i className="fas fa-check text-sm"></i>
          </button>
        </div>
      )}

      <div className="bg-[#1a1f26] rounded-[2rem] sm:rounded-[3.5rem] p-5 sm:p-8 lg:p-14 shadow-2xl border border-white/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-5 text-9xl pointer-events-none translate-x-4"><i className="fas fa-bolt text-white"></i></div>

        <div className="flex justify-between items-start gap-4 mb-8 sm:mb-12 pb-6 sm:pb-8 border-b border-white/5 relative z-10">
          <div className="min-w-0 flex-1">
            <p className="text-indigo-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">{t.liveSession}</p>
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tighter uppercase leading-none truncate">{activeSessionForLive.dayTitle}</h2>
          </div>
          {/* Workout duration timer */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className="px-4 py-2.5 bg-indigo-600/15 border border-indigo-500/20 rounded-xl flex items-center gap-2.5">
              <i className="fas fa-stopwatch text-indigo-400 text-sm"></i>
              <span className="tabular-nums text-lg font-black text-white tracking-tight">
                {Math.floor(workoutElapsed / 3600) > 0 && `${Math.floor(workoutElapsed / 3600)}:`}
                {String(Math.floor((workoutElapsed % 3600) / 60)).padStart(2, '0')}:{String(workoutElapsed % 60).padStart(2, '0')}
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              const confirmEnd = language === 'de'
                ? 'Training wirklich abbrechen? Nicht gespeicherte Daten gehen verloren.'
                : 'Really end workout? Unsaved data will be lost.';
              if (window.confirm(confirmEnd)) { setIsLiveSession(false); setLiveSessionData(null); setWorkoutStartTime(null); }
            }}
            className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all border border-white/5"
          >
            <i className="fas fa-times text-xl sm:text-2xl"></i>
          </button>
        </div>

        {/* Rest timer is now only shown as floating bottom bar — no inline block that forces scrolling */}

        {/* Warmup in live session */}
        {activeSessionForLive.warmup && activeSessionForLive.warmup.length > 0 && (
          <div className="mb-8 p-5 sm:p-6 bg-amber-500/5 border border-amber-500/10 rounded-[2rem] relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <i className="fas fa-fire-flame-curved text-amber-400 text-sm"></i>
              </div>
              <h4 className="text-sm font-black text-amber-400 uppercase tracking-widest">{t.warmup}</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeSessionForLive.warmup.map((step, wi) => (
                <span key={wi} className="px-3.5 py-2 bg-amber-500/10 border border-amber-500/15 rounded-xl text-xs font-semibold text-slate-300">
                  {step}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-14 relative z-10">
          {activeSessionForLive.exercises.map((ex, exIdx) => (
            <div key={exIdx} className="space-y-6 relative group">
              {/* Swap loading overlay */}
              {swappingExIdx === exIdx && !swapDrafts && (
                <div className="absolute -inset-4 bg-slate-900/60 backdrop-blur-md rounded-[2rem] sm:rounded-[3rem] z-20 flex flex-col items-center justify-center gap-4 animate-fade-in border border-white/10 shadow-2xl">
                  <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">{t.swapping}</p>
                </div>
              )}

              {/* Swap draft picker overlay */}
              {swapDrafts && swapDrafts.exIdx === exIdx && (
                <div className="absolute -inset-4 bg-slate-900/90 backdrop-blur-xl rounded-[2rem] sm:rounded-[3rem] z-20 flex flex-col p-4 sm:p-6 animate-fade-in border border-amber-500/30 shadow-2xl overflow-y-auto max-h-[80vh]">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <i className="fas fa-shuffle text-amber-500 text-sm"></i>
                      <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">{t.pickAlternative}</p>
                    </div>
                    <button onClick={() => setSwapDrafts(null)} className="w-8 h-8 rounded-xl bg-white/10 hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center transition-all">
                      <i className="fas fa-xmark text-xs"></i>
                    </button>
                  </div>
                  <div className="space-y-3">
                    {swapDrafts.options.map((opt, oi) => (
                      <button
                        key={oi}
                        onClick={() => handlePickSwap(opt)}
                        className="w-full text-left p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all group/opt"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h5 className="text-sm sm:text-base font-black text-white uppercase tracking-tight group-hover/opt:text-amber-400 transition-colors">{opt.name}</h5>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              {opt.equipment && (
                                <span className="px-2 py-0.5 bg-slate-800 border border-white/10 rounded-lg text-[9px] font-black text-slate-400 uppercase tracking-wider">{opt.equipment}</span>
                              )}
                              <span className="text-[10px] font-bold text-slate-500">{opt.sets} × {opt.reps}</span>
                              {opt.suggestedWeight && <span className="text-[10px] font-bold text-indigo-400">{opt.suggestedWeight}</span>}
                            </div>
                            {opt.notes && <p className="text-[11px] text-slate-400 mt-2 leading-snug line-clamp-2">{opt.notes}</p>}
                          </div>
                          <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center flex-shrink-0 group-hover/opt:bg-amber-500 group-hover/opt:text-white transition-all">
                            <i className="fas fa-arrow-right text-xs"></i>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-l-4 border-indigo-600 pl-4 sm:pl-6 py-1 space-y-2">
                <div className="flex items-start gap-2">
                  <h3 className="text-lg sm:text-2xl font-black text-white tracking-tight uppercase flex-1 min-w-0 leading-tight">{ex.name}</h3>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setHistoryExercise(historyExercise === ex.name ? null : ex.name)}
                      className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all border ${historyExercise === ex.name ? 'bg-violet-600/20 text-violet-400 border-violet-500/30' : 'bg-white/5 text-slate-400 border-white/5 hover:bg-violet-600/20 hover:text-violet-400'}`}
                      title={t.exerciseHistory}
                    >
                      <i className="fas fa-chart-line text-[10px] sm:text-xs"></i>
                    </button>
                    <button
                      onClick={() => setSelectedExerciseInfo(ex)}
                      className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white/5 text-slate-400 flex items-center justify-center hover:bg-indigo-600/20 hover:text-indigo-400 transition-all border border-white/5"
                    >
                      <i className="fas fa-info text-[10px] sm:text-xs"></i>
                    </button>
                    <button
                      onClick={() => handleSwapExercise(exIdx, ex)}
                      disabled={swappingExIdx !== null}
                      className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white/5 text-slate-400 flex items-center justify-center hover:bg-amber-600/20 hover:text-amber-500 transition-all border border-white/5 disabled:opacity-40"
                      title={language === 'de' ? 'Übung wechseln' : 'Swap exercise'}
                    >
                      <i className={`fas ${swappingExIdx === exIdx ? 'fa-spinner animate-spin' : 'fa-shuffle'} text-[10px] sm:text-xs`}></i>
                    </button>
                  </div>
                </div>
                {ex.equipment && (
                  <span className="inline-block px-2.5 py-1 bg-white/5 text-slate-500 border border-white/5 rounded-lg text-[8px] sm:text-[9px] font-black uppercase tracking-widest">
                    {ex.equipment}
                  </span>
                )}
              </div>

              {/* Exercise History Panel */}
              {historyExercise === ex.name && (() => {
                const history = getExerciseHistory(ex.name);
                return (
                  <div className="ml-4 sm:ml-10 p-3 sm:p-4 bg-violet-500/5 border border-violet-500/15 rounded-2xl animate-fade-in">
                    <div className="flex items-center gap-2 mb-3">
                      <i className="fas fa-chart-line text-violet-400 text-xs"></i>
                      <p className="text-[9px] font-black text-violet-400 uppercase tracking-widest">{t.exerciseHistory} — {ex.name}</p>
                    </div>
                    {history.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">{t.noHistory}</p>
                    ) : (
                      <div className="space-y-2">
                        {history.map((h, hi) => (
                          <div key={hi} className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-slate-500 w-16 sm:w-20 shrink-0">
                              {new Date(h.date).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'short' })}
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {h.sets.filter(s => !s.skipped).map((s, si) => (
                                <span key={si} className="px-2 py-1 bg-violet-500/10 border border-violet-500/20 rounded-lg text-[10px] font-bold text-violet-300">
                                  {s.weight > 0 ? `${s.weight}kg` : 'BW'} × {s.reps}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {ex.suggestedWeight && (
                <div className="flex items-center gap-3 ml-4 sm:ml-10">
                  <div className="w-2 h-2 bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.6)]"></div>
                  <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    <span className="text-amber-500/80 mr-2">{language === 'de' ? 'Vorschlag' : 'Suggested'}:</span> {ex.suggestedWeight} • {ex.reps} {language === 'de' ? 'Wdh' : 'reps'}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 ml-0 sm:ml-6 md:ml-10">
                {currentLog[exIdx]?.sets.map((set, sIdx) => {
                  const isDone = set.done === true;
                  const isSkipped = set.skipped === true;
                  const hasValues = (set.weight > 0 || set.reps > 0);
                  return (
                    <div key={sIdx} className={`p-5 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border transition-all flex flex-col gap-4 sm:gap-6 group/set ${
                      isSkipped ? 'bg-red-500/5 border-red-500/20 shadow-xl' :
                      isDone ? 'bg-emerald-500/5 border-emerald-500/20 shadow-xl' :
                      'bg-slate-800/30 border-white/5 hover:border-white/10'
                    }`}>
                      <div className="flex justify-between items-center">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${isSkipped ? 'text-red-400' : isDone ? 'text-emerald-400' : 'text-slate-500'}`}>{t.setLabel} {sIdx + 1}</span>
                        {isDone && <i className="fas fa-check-circle text-emerald-500 text-lg"></i>}
                        {isSkipped && <i className="fas fa-ban text-red-500 text-lg"></i>}
                      </div>
                      <div className="flex gap-4 sm:gap-6">
                        <div className="flex-1">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">{t.weight}</label>
                          <div className="relative">
                            <input
                              type="number"
                              inputMode="decimal"
                              placeholder={ex.suggestedWeight?.replace(/[^0-9.]/g, '') || ''}
                              value={set.weight || ''}
                              disabled={isSkipped || isDone}
                              onChange={(e) => { const copy = [...currentLog]; copy[exIdx].sets[sIdx].weight = parseFloat(e.target.value) || 0; setCurrentLog(copy); }}
                              className={`w-full bg-slate-900/50 rounded-xl p-3 sm:p-4 outline-none font-black text-lg sm:text-xl transition-all ${isSkipped ? 'text-red-300 border border-red-500/10' : isDone ? 'text-emerald-300 border border-emerald-500/10' : 'text-white border border-white/5 focus:border-indigo-500 focus:bg-slate-900'}`}
                            />
                            <span className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-600 uppercase">kg</span>
                          </div>
                        </div>
                        <div className="flex-1">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">{t.reps}</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder={ex.reps || ''}
                            value={isSkipped ? '-' : (set.reps || '')}
                            disabled={isSkipped || isDone}
                            onChange={(e) => { const copy = [...currentLog]; copy[exIdx].sets[sIdx].reps = parseFloat(e.target.value) || 0; setCurrentLog(copy); }}
                            className={`w-full bg-slate-900/50 rounded-xl p-3 sm:p-4 outline-none font-black text-lg sm:text-xl text-center transition-all ${isSkipped ? 'text-red-300 border border-red-500/10' : isDone ? 'text-emerald-300 border border-emerald-500/10' : 'text-white border border-white/5 focus:border-indigo-500 focus:bg-slate-900'}`}
                          />
                        </div>
                      </div>
                      {!isDone && !isSkipped && (
                        <div className="flex flex-col gap-2 pt-1">
                          {/* Primary action: finish set manually (prominent green button) */}
                          <button
                            onClick={() => handleFinishSet(exIdx, sIdx, ex)}
                            disabled={!hasValues}
                            className="w-full py-4 bg-emerald-600/20 hover:bg-emerald-600/30 disabled:bg-white/5 disabled:text-slate-600 rounded-2xl text-xs font-black uppercase text-emerald-400 tracking-widest border border-emerald-500/20 disabled:border-white/10 transition-all flex items-center justify-center gap-2"
                          >
                            <i className="fas fa-check"></i> {t.finishSet}
                          </button>
                          {/* Secondary: auto-fill with AI suggestion */}
                          {ex.suggestedWeight && (
                            <button
                              onClick={() => handleAcceptSuggestion(exIdx, sIdx, ex)}
                              className="w-full py-2.5 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 rounded-2xl text-[9px] font-black uppercase text-indigo-400 tracking-widest transition-all flex items-center justify-center gap-2"
                            >
                              <i className="fas fa-magic text-[8px]"></i> {t.acceptSuggestion}
                            </button>
                          )}
                          <button
                            onClick={() => handleSkipSet(exIdx, sIdx)}
                            className="w-full py-2 rounded-2xl text-[9px] font-black uppercase text-slate-600 hover:text-red-400 transition-colors"
                          >
                            {t.skipSet}
                          </button>
                        </div>
                      )}
                      {isDone && (
                        <button
                          onClick={() => { const copy = [...currentLog]; copy[exIdx].sets[sIdx].done = false; setCurrentLog(copy); }}
                          className="w-full py-3 rounded-2xl text-[10px] font-black uppercase text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10 transition-all flex items-center justify-center gap-2 border border-transparent hover:border-amber-500/20"
                        >
                          <i className="fas fa-pen text-[9px]"></i> {language === 'de' ? 'Bearbeiten' : 'Edit'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-14 pt-10 border-t border-white/5 shrink-0 relative z-10 space-y-6">
          {/* AI-powered session adjustment + notes */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <i className="fas fa-wand-magic-sparkles text-violet-400 text-xs"></i>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  {language === 'de' ? 'Training anpassen' : 'Adjust Workout'}
                </p>
                <p className="text-[8px] font-bold text-slate-600 tracking-wide">
                  {language === 'de' ? 'KI passt den Trainingsplan für heute an' : 'AI adjusts today\'s workout plan'}
                </p>
              </div>
            </div>

            {/* Plain notes (always visible) */}
            <textarea
              value={sessionNotes}
              onChange={e => setSessionNotes(e.target.value)}
              placeholder={language === 'de' ? 'Notizen: z.B. Schulter fühlt sich gut an...' : 'Notes: e.g. Shoulder feels good...'}
              className="w-full px-4 py-2.5 bg-slate-800/40 border border-white/5 rounded-xl text-sm text-white placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-violet-500/30 resize-none font-medium transition-all"
              rows={1}
            />

            {/* AI adjustment input */}
            {!workoutDraft && (
              <div className="space-y-2">
                <textarea
                  value={workoutAdjustInput}
                  onChange={e => setWorkoutAdjustInput(e.target.value)}
                  placeholder={language === 'de'
                    ? 'z.B. Ersetze Bankdrücken durch Schrägbank, füge 3x15 Seitenheben hinzu...'
                    : 'e.g. Replace bench press with incline, add 3x15 lateral raises...'}
                  className="w-full px-4 py-3 bg-slate-800/40 border border-white/5 rounded-xl text-sm text-white placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none font-medium transition-all"
                  rows={2}
                />
                {workoutAdjustInput.trim() && (
                  <button
                    onClick={async () => {
                      if (!profile || !activeSessionForLive) return;
                      setIsAdjustingWorkout(true);
                      try {
                        const draft = await adjustWorkoutSession(profile, activeSessionForLive.exercises, workoutAdjustInput, language);
                        setWorkoutDraft(draft);
                      } catch (e) {
                        console.error('Workout adjustment failed:', e);
                        alert(language === 'de' ? 'Anpassung fehlgeschlagen.' : 'Adjustment failed.');
                      } finally {
                        setIsAdjustingWorkout(false);
                      }
                    }}
                    disabled={isAdjustingWorkout}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
                  >
                    {isAdjustingWorkout ? (
                      <><i className="fas fa-spinner fa-spin text-xs"></i> {language === 'de' ? 'KI passt an...' : 'AI adjusting...'}</>
                    ) : (
                      <><i className="fas fa-bolt text-xs"></i> {language === 'de' ? 'Plan anpassen' : 'Adjust Plan'}</>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* ── DRAFT: AI workout adjustment ── */}
            {workoutDraft && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-[9px] font-black uppercase tracking-widest rounded-lg border border-amber-500/20">
                    <i className="fas fa-file-pen mr-1.5"></i>Draft
                  </span>
                </div>

                {/* Summary */}
                <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl">
                  <p className="text-xs font-medium text-slate-300 leading-relaxed">
                    <i className="fas fa-lightbulb text-amber-400 mr-2"></i>
                    {workoutDraft.summary}
                  </p>
                </div>

                {/* Exercise list */}
                <div className="space-y-2">
                  {workoutDraft.exercises.map((ex, i) => {
                    const isNew = !activeSessionForLive?.exercises.some(o => o.name === ex.name);
                    return (
                      <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${isNew ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-slate-800/40 border-white/5'}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          {isNew && <span className="text-[8px] font-black text-emerald-400 uppercase bg-emerald-500/20 px-1.5 py-0.5 rounded">NEU</span>}
                          <span className="text-sm font-bold text-white truncate">{ex.name}</span>
                        </div>
                        <span className="text-[10px] font-black text-slate-400 flex-shrink-0 ml-2">
                          {ex.sets}x{ex.reps} {ex.suggestedWeight ? `• ${ex.suggestedWeight}` : ''}
                        </span>
                      </div>
                    );
                  })}
                  {activeSessionForLive?.exercises
                    .filter(o => !workoutDraft.exercises.some(d => d.name === o.name))
                    .map((removed, i) => (
                      <div key={`rm-${i}`} className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/10 opacity-60">
                        <span className="text-[8px] font-black text-red-400 uppercase bg-red-500/20 px-1.5 py-0.5 rounded mr-2">{language === 'de' ? 'ENTF.' : 'REM.'}</span>
                        <span className="text-sm font-bold text-slate-400 line-through flex-1">{removed.name}</span>
                      </div>
                    ))}
                </div>

                {/* Accept / Discard */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      if (!workoutDraft || !workoutProgram || !activeSessionForLive) return;
                      const sessionIdx = workoutProgram.sessions.findIndex(s => s.dayTitle === activeSessionForLive.dayTitle);
                      if (sessionIdx >= 0) {
                        const newSessions = [...workoutProgram.sessions];
                        newSessions[sessionIdx] = { ...newSessions[sessionIdx], exercises: workoutDraft.exercises };
                        onUpdateWorkoutPlan({ ...workoutProgram, sessions: newSessions });
                        setCurrentLog(workoutDraft.exercises.map(ex => ({
                          exerciseName: ex.name,
                          sets: Array.from({ length: ex.sets }, () => ({ weight: 0, reps: 0 })),
                        })));
                      }
                      setWorkoutDraft(null);
                      setWorkoutAdjustInput('');
                    }}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                  >
                    <i className="fas fa-check"></i> {language === 'de' ? 'Übernehmen' : 'Accept'}
                  </button>
                  <button
                    onClick={() => setWorkoutDraft(null)}
                    className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                  >
                    <i className="fas fa-times"></i> {language === 'de' ? 'Verwerfen' : 'Discard'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Duration display */}
          <div className="flex items-center justify-center gap-4 p-4 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl">
            <i className="fas fa-stopwatch text-indigo-400"></i>
            <span className="text-lg font-black text-white tabular-nums">
              {Math.floor(workoutElapsed / 3600) > 0 && `${Math.floor(workoutElapsed / 3600)}h `}
              {Math.floor((workoutElapsed % 3600) / 60)}min
            </span>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              {language === 'de' ? 'Gesamtdauer' : 'Total Duration'}
            </span>
          </div>

          <button
            onClick={() => {
              const durationMin = Math.round(workoutElapsed / 60);
              onSaveLog({
                date: new Date().toISOString(),
                sessionTitle: activeSessionForLive.dayTitle,
                exercises: currentLogRef.current,
                durationMinutes: durationMin,
                notes: sessionNotes.trim() || undefined,
              });
              setIsLiveSession(false);
              setLiveSessionData(null);
              setRestEndTime(null);
              setRestExerciseName('');
              setWorkoutStartTime(null);
              setRestExpired(false);
              const msg = language === 'de'
                ? `✓ Workout gespeichert! (${durationMin} min)`
                : `✓ Workout saved! (${durationMin} min)`;
              setSaveToast(msg);
              setTimeout(() => setSaveToast(null), 6000);
            }}
            className="w-full py-5 sm:py-8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[1.5rem] sm:rounded-[2.5rem] font-black text-xl sm:text-2xl uppercase tracking-[0.1em] shadow-[0_20px_50px_rgba(79,70,229,0.3)] transition-all active:scale-[0.98] border border-indigo-400/20 flex items-center justify-center gap-4"
          >
            <i className="fas fa-check-circle"></i>
            {language === 'de' ? 'Training beenden' : 'Finish Workout'}
          </button>
        </div>
      </div>

      {/* Exercise Info Modal */}
      {selectedExerciseInfo && (
        <div className="fixed inset-0 z-[300] bg-[#0f172a]/80 backdrop-blur-xl flex items-end sm:items-center justify-center sm:p-6 animate-fade-in transition-all" onClick={() => setSelectedExerciseInfo(null)}>
          <div className="bg-[#1a1f26] rounded-t-[2.5rem] sm:rounded-[3rem] max-w-2xl w-full max-h-[92vh] sm:max-h-[90vh] shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10 animate-scale-in relative text-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }} onClick={e => e.stopPropagation()}>
            {/* Fixed header */}
            <div className="p-5 sm:p-10 lg:p-14 pb-4 sm:pb-6 flex-shrink-0">
              <div className="flex items-start justify-between gap-4 mb-4 sm:mb-6">
                <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                  <span className="px-3 sm:px-4 py-1.5 sm:py-2 bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest">{t.protocol}</span>
                  {selectedExerciseInfo.equipment && (
                    <span className="px-3 sm:px-4 py-1.5 sm:py-2 bg-white/5 text-slate-400 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-dumbbell text-indigo-500"></i> {selectedExerciseInfo.equipment}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setSelectedExerciseInfo(null)}
                  className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all border border-white/5 flex-shrink-0"
                >
                  <i className="fas fa-times text-lg sm:text-2xl"></i>
                </button>
              </div>
              <h3 className="text-2xl sm:text-4xl font-black uppercase tracking-tighter leading-none">{selectedExerciseInfo.name}</h3>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-5 sm:px-10 lg:px-14 pb-8 sm:pb-14" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
              <div className="space-y-8 sm:space-y-10">
                {selectedExerciseInfo.instructions && selectedExerciseInfo.instructions.length > 0 ? (
                  <div className="space-y-5 sm:space-y-6">
                    {selectedExerciseInfo.instructions.map((step, i) => (
                      <div key={i} className="flex gap-4 sm:gap-6 group">
                        <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-slate-800 text-white text-[11px] sm:text-[12px] font-black flex items-center justify-center border border-white/10 shadow-xl group-hover:bg-indigo-600 transition-all">{i + 1}</div>
                        <p className="text-sm text-slate-300 font-medium leading-relaxed pt-1.5 sm:pt-2 transition-colors group-hover:text-white">{step}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 sm:p-8 bg-slate-800/30 rounded-2xl sm:rounded-[2rem] border-2 border-dashed border-white/5 text-center">
                    <i className="fas fa-info-circle text-3xl text-slate-700 mb-4"></i>
                    <p className="text-slate-500 italic text-sm font-medium">{t.noInstructions}</p>
                  </div>
                )}

                {selectedExerciseInfo.notes && (
                  <div className="p-5 sm:p-8 bg-indigo-600/5 rounded-2xl sm:rounded-[2.5rem] border border-indigo-500/10 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-10 text-4xl"><i className="fas fa-wand-magic-sparkles"></i></div>
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-3">{t.aiDeepDive}</p>
                    <p className="text-sm text-slate-400 font-medium italic leading-relaxed">"{selectedExerciseInfo.notes}"</p>
                  </div>
                )}

                {/* Spacer to ensure scrollability on iOS */}
                <div className="h-4"></div>
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
      {/* Save toast notification */}
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
              
              <div className="flex justify-between items-center relative z-10">
                <div>
                  <p className="text-indigo-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">{t.optimizationEngine}</p>
                  <h3 className="text-2xl sm:text-4xl font-black text-white tracking-tighter uppercase leading-none">{t.setup}</h3>
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
                            className={`px-3 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${isActive ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl shadow-indigo-600/20' : 'bg-slate-800/30 border-white/5 text-slate-500 hover:border-white/10'}`}
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
                        className="w-full sm:w-auto p-3 sm:p-5 bg-slate-800/50 rounded-2xl border border-white/5 font-bold text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
                      >
                        {daysList.map(d => <option key={d} value={d} className="bg-slate-900">{d}</option>)}
                      </select>
                      <input 
                        type="text" 
                        value={newFixedActivity} 
                        onChange={e => setNewFixedActivity(e.target.value)} 
                        placeholder={t.activityPlaceholder} 
                        className="flex-1 p-3 sm:p-5 bg-slate-800/50 rounded-2xl border border-white/5 font-bold text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-600 transition-all" 
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
                        className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-5 bg-white/5 hover:bg-white/10 text-white border border-white/5 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all"
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

                <div className="space-y-6">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{t.sessionDuration}</label>
                  <div className="flex items-center gap-6">
                    <input
                      type="range"
                      min={20}
                      max={120}
                      step={5}
                      value={sessionDuration}
                      onChange={e => setSessionDuration(Number(e.target.value))}
                      className="flex-1 h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-indigo-500 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-lg"
                    />
                    <span className="text-2xl font-black text-white tabular-nums min-w-[5rem] text-right">{sessionDuration} {t.durationMin}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-600 font-bold px-1">
                    <span>20 {t.durationMin}</span>
                    <span>60 {t.durationMin}</span>
                    <span>120 {t.durationMin}</span>
                  </div>
                </div>
              </div>
              <div className="pt-12 shrink-0 relative z-10">
                <button
                  onClick={() => { onGenerateWorkout(availableDays, existingWorkouts, sessionDuration); setShowConfig(false); setModificationText(''); setShowModInput(false); }}
                  className="w-full py-5 sm:py-8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[1.5rem] sm:rounded-[2.5rem] font-black text-lg sm:text-2xl uppercase tracking-[0.1em] shadow-[0_20px_50px_rgba(79,70,229,0.3)] transition-all active:scale-[0.98] border border-indigo-400/20"
                >
                  {t.create}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-[2rem] sm:rounded-[3rem] p-5 sm:p-10 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6 shadow-2xl border border-indigo-400/20 relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-10 opacity-10 text-7xl sm:text-9xl pointer-events-none translate-x-4"><i className="fas fa-meteor"></i></div>
                 <div className="relative z-10 min-w-0 flex-1">
                   <p className="text-indigo-200 text-[10px] font-black uppercase tracking-[0.3em] mb-1 sm:mb-2">{t.activeProtocol}</p>
                   <h3 className="text-2xl sm:text-4xl font-black tracking-tighter uppercase mb-1 break-words">{workoutProgram.title}</h3>
                   <p
                     className={`text-indigo-100 italic text-xs sm:text-sm opacity-80 font-medium cursor-pointer sm:cursor-default transition-all ${descExpanded ? '' : 'line-clamp-2 sm:line-clamp-none'}`}
                     onClick={() => setDescExpanded(!descExpanded)}
                   >
                     {workoutProgram.description}
                   </p>
                   {workoutProgram.description && workoutProgram.description.length > 80 && !descExpanded && (
                     <button onClick={() => setDescExpanded(true)} className="text-[9px] font-black text-indigo-200/60 uppercase tracking-widest mt-1 sm:hidden">
                       <i className="fas fa-chevron-down mr-1 text-[7px]"></i>{language === 'de' ? 'Mehr' : 'More'}
                     </button>
                   )}
                 </div>
                 <div className="relative z-10 flex flex-wrap gap-2 sm:gap-3">
                   <button
                     onClick={onCompleteWeek}
                     className="px-4 sm:px-8 py-2.5 sm:py-4 bg-white/20 hover:bg-white/30 rounded-xl sm:rounded-[2rem] text-[9px] sm:text-[10px] font-black uppercase tracking-widest border border-white/30 transition-all backdrop-blur-md flex items-center justify-center gap-2"
                   >
                     <i className="fas fa-flag-checkered"></i> {t.completeWeek}
                   </button>
                   <button
                     onClick={() => setShowModInput(!showModInput)}
                     className={`px-4 sm:px-8 py-2.5 sm:py-4 rounded-xl sm:rounded-[2rem] text-[9px] sm:text-[10px] font-black uppercase tracking-widest border transition-all backdrop-blur-md flex items-center justify-center gap-2 ${
                       showModInput ? 'bg-white/40 border-white/50 shadow-lg' : 'bg-white/20 hover:bg-white/30 border-white/30'
                     }`}
                   >
                     <i className="fas fa-pen-to-square"></i> {t.modifyPlan}
                   </button>
                   <button
                     onClick={() => setShowConfig(true)}
                     className="px-4 sm:px-8 py-2.5 sm:py-4 bg-white/20 hover:bg-white/30 rounded-xl sm:rounded-[2rem] text-[9px] sm:text-[10px] font-black uppercase tracking-widest border border-white/30 transition-all backdrop-blur-md flex items-center justify-center gap-2"
                   >
                     <i className="fas fa-sliders"></i> {t.adapt}
                   </button>
                 </div>
              </div>

              {showModInput && (
                <div className="bg-[#1a1f26] rounded-[2rem] p-6 sm:p-8 border border-indigo-500/20 shadow-xl space-y-4 animate-fade-in">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                      <i className="fas fa-pen-to-square text-indigo-400 text-sm"></i>
                    </div>
                    <h4 className="text-sm font-black text-indigo-400 uppercase tracking-widest">{t.modifyPlan}</h4>
                  </div>
                  <textarea
                    value={modificationText}
                    onChange={e => setModificationText(e.target.value)}
                    placeholder={t.modifyPlaceholder}
                    className="w-full min-h-[100px] rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-white outline-none focus:border-indigo-500 placeholder:text-slate-600 resize-none"
                  />
                  <button
                    onClick={() => {
                      onGenerateWorkout(
                        profile?.workoutPreferences?.availableDays || availableDays,
                        profile?.workoutPreferences?.existingWorkouts || existingWorkouts,
                        sessionDuration,
                        modificationText.trim() || undefined
                      );
                      setShowModInput(false);
                    }}
                    disabled={!modificationText.trim()}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all border border-indigo-400/20 flex items-center justify-center gap-3"
                  >
                    <i className="fas fa-wand-magic-sparkles"></i> {t.modifySubmit}
                  </button>
                </div>
              )}

              {/* ── WEEK DAY SELECTOR (Drag & Drop) ── */}
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2 p-2 bg-slate-800/40 border border-white/5 rounded-[2rem] w-full backdrop-blur-sm">
                {ALL_DAYS.map((dayName, i) => {
                  const session = sessionByDay[dayName];
                  const hasSession = !!session;
                  const isActive = selectedSession && selectedSession.dayTitle.split(':')[0].trim() === dayName;
                  const isCompleted = hasSession && workoutLogs.some(l => l.sessionTitle === session!.dayTitle);
                  const isDragging = dragIdx === i && hasSession;
                  const isDragOver = dragOverIdx === i && dragIdx !== i;
                  const dragSourceDay = dragIdx !== null ? ALL_DAYS[dragIdx] : null;
                  const dragHasSession = dragSourceDay ? !!sessionByDay[dragSourceDay] : false;

                  return (
                    <button
                      key={dayName}
                      ref={el => { dayButtonRefs.current[i] = el; }}
                      draggable={hasSession}
                      onDragStart={(e) => { if (!hasSession) { e.preventDefault(); return; } setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragOver={(e) => { e.preventDefault(); if (dragHasSession) setDragOverIdx(i); }}
                      onDragLeave={() => { if (dragOverIdx === i) setDragOverIdx(null); }}
                      onDrop={(e) => { e.preventDefault(); if (dragIdx !== null && dragSourceDay) handleDayDrop(dragSourceDay, dayName); }}
                      onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                      onTouchStart={(e) => { if (hasSession) touchStartRef.current = { idx: i, startX: e.touches[0].clientX, startY: e.touches[0].clientY }; }}
                      onTouchMove={(e) => {
                        if (!touchStartRef.current) return;
                        const touch = e.touches[0];
                        for (let j = 0; j < dayButtonRefs.current.length; j++) {
                          const btn = dayButtonRefs.current[j];
                          if (btn) {
                            const rect = btn.getBoundingClientRect();
                            if (touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                              setDragOverIdx(j);
                              break;
                            }
                          }
                        }
                      }}
                      onTouchEnd={() => {
                        if (touchStartRef.current !== null && dragOverIdx !== null && dragOverIdx !== touchStartRef.current.idx) {
                          const srcDay = ALL_DAYS[touchStartRef.current.idx];
                          const tgtDay = ALL_DAYS[dragOverIdx];
                          handleDayDrop(srcDay, tgtDay);
                        } else if (hasSession) {
                          setSelectedSession(session);
                        }
                        touchStartRef.current = null;
                        setDragOverIdx(null);
                      }}
                      onClick={() => { if (dragIdx === null && hasSession) setSelectedSession(session); }}
                      className={`flex flex-col items-center gap-1 py-3 sm:py-4 rounded-2xl font-black text-[10px] sm:text-xs uppercase transition-all ${
                        hasSession ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                      } ${isDragging ? 'opacity-30 scale-90' : ''} ${
                        isDragOver ? 'ring-2 ring-indigo-400 bg-indigo-600/20 scale-105' : ''
                      } ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20'
                          : hasSession
                            ? 'bg-slate-700/60 text-white hover:bg-slate-700/80 border border-white/10'
                            : 'text-slate-600 hover:text-slate-500'
                      }`}
                    >
                      <span>{SHORT_DAYS[dayName] || dayName.slice(0, 2)}</span>
                      {hasSession ? (
                        <div className="flex items-center gap-1">
                          {isCompleted && (
                            <div className="bg-emerald-500 text-[7px] w-3.5 h-3.5 rounded-full flex items-center justify-center text-white">
                              <i className="fas fa-check"></i>
                            </div>
                          )}
                          <i className="fas fa-dumbbell text-[8px] opacity-60"></i>
                        </div>
                      ) : (
                        <span className="text-[8px] opacity-30">—</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedSession && (
                <div className="bg-[#1a1f26] rounded-[2rem] sm:rounded-[3.5rem] p-5 sm:p-8 lg:p-14 border border-white/5 shadow-2xl animate-scale-in relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-12 opacity-5 text-9xl pointer-events-none translate-x-4"><i className="fas fa-dumbbell text-white"></i></div>
                  
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sm:gap-8 mb-8 sm:mb-12 pb-6 sm:pb-10 border-b border-white/5 relative z-10">
                    <div>
                      <p className="text-indigo-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">{selectedSession.focus}</p>
                      <h3 className="text-2xl sm:text-4xl font-black text-white tracking-tighter uppercase">{selectedSession.dayTitle}</h3>
                    </div>
                    <button
                      onClick={() => {
                        setLiveSessionData(null);
                        setIsLiveSession(true);
                        setWorkoutStartTime(Date.now());
                        setSessionNotes('');
                        setCurrentLog(selectedSession.exercises.map(ex => ({ exerciseName: ex.name, sets: Array.from({ length: ex.sets }, () => ({ weight: 0, reps: 0 })) })));
                      }}
                      className="px-6 sm:px-12 py-4 sm:py-6 bg-slate-900 text-white rounded-xl sm:rounded-[2rem] font-black uppercase text-sm tracking-widest shadow-2xl hover:bg-slate-950 hover:shadow-indigo-500/10 transition-all border border-white/10 flex items-center gap-4 group"
                    >
                      <i className="fas fa-play text-indigo-500 group-hover:scale-125 transition-transform"></i>
                      {t.start}
                    </button>
                  </div>
                  
                  {selectedSession.warmup && selectedSession.warmup.length > 0 && (
                    <div className="mb-8 p-5 sm:p-6 bg-amber-500/5 border border-amber-500/10 rounded-[2rem] relative z-10">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                          <i className="fas fa-fire-flame-curved text-amber-400 text-sm"></i>
                        </div>
                        <h4 className="text-sm font-black text-amber-400 uppercase tracking-widest">{t.warmup}</h4>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedSession.warmup.map((step, wi) => (
                          <span key={wi} className="px-3.5 py-2 bg-amber-500/10 border border-amber-500/15 rounded-xl text-xs font-semibold text-slate-300">
                            {step}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
                    {(() => {
                      const sessionLog = workoutLogs.find(l => l.sessionTitle === selectedSession.dayTitle);
                      // Build display list: use logged exercises where available (handles swaps), fill rest from plan
                      const loggedNames = new Set(sessionLog?.exercises.map(e => e.exerciseName) || []);
                      const planNames = new Set(selectedSession.exercises.map(e => e.name));
                      // Exercises to show: plan exercises (with log overlay if matching), then swapped-in exercises not in plan
                      const displayExercises: { ex: Exercise; exerciseLog?: ExerciseLog; wasSwapped?: boolean }[] = [];
                      for (const ex of selectedSession.exercises) {
                        const eLog = sessionLog?.exercises.find(le => le.exerciseName === ex.name);
                        if (eLog) {
                          displayExercises.push({ ex, exerciseLog: eLog });
                        } else if (sessionLog && !loggedNames.has(ex.name)) {
                          // Plan exercise was swapped out — check if there's a swapped-in exercise at same index
                          const idx = selectedSession.exercises.indexOf(ex);
                          const swappedLog = sessionLog.exercises[idx];
                          if (swappedLog && !planNames.has(swappedLog.exerciseName)) {
                            const swappedEx: Exercise = { name: swappedLog.exerciseName, sets: swappedLog.sets.length, reps: '-', rest: 0, notes: '' };
                            displayExercises.push({ ex: swappedEx, exerciseLog: swappedLog, wasSwapped: true });
                          } else {
                            displayExercises.push({ ex });
                          }
                        } else {
                          displayExercises.push({ ex, exerciseLog: sessionLog?.exercises.find(le => le.exerciseName === ex.name) });
                        }
                      }
                      // Also add any extra logged exercises not yet shown (e.g. swaps beyond plan length)
                      if (sessionLog) {
                        for (const el of sessionLog.exercises) {
                          if (!displayExercises.some(d => d.ex.name === el.exerciseName)) {
                            displayExercises.push({ ex: { name: el.exerciseName, sets: el.sets.length, reps: '-', rest: 0, notes: '' }, exerciseLog: el, wasSwapped: true });
                          }
                        }
                      }

                      return displayExercises.map(({ ex, exerciseLog, wasSwapped }, i) => (
                        <div key={i} className={`bg-slate-800/30 p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border hover:bg-slate-800/50 hover:border-white/10 transition-all flex flex-col gap-5 group ${wasSwapped ? 'border-amber-500/20' : 'border-white/5'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h5 className="font-black text-white text-base sm:text-xl tracking-tight uppercase leading-tight group-hover:text-indigo-400 transition-colors">{ex.name}</h5>
                              {wasSwapped && (
                                <span className="inline-block mt-1 px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-[8px] font-black uppercase tracking-widest">
                                  <i className="fas fa-shuffle mr-1"></i>{language === 'de' ? 'Getauscht' : 'Swapped'}
                                </span>
                              )}
                              {ex.notes && <p className="text-[10px] text-slate-500 italic mt-2 font-medium leading-relaxed line-clamp-2">{ex.notes}</p>}
                            </div>
                            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-600/10 text-indigo-500 rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-xl border border-indigo-500/10 shrink-0"><i className="fas fa-dumbbell"></i></div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 sm:gap-3">
                            <div className="bg-slate-900/50 p-3 sm:p-4 rounded-xl sm:rounded-2xl text-center border border-white/5">
                              <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">Sets</p>
                              <p className="font-black text-white text-base sm:text-lg tracking-tight">{ex.sets}</p>
                            </div>
                            <div className="bg-slate-900/50 p-3 sm:p-4 rounded-xl sm:rounded-2xl text-center border border-white/5">
                              <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">Reps</p>
                              <p className="font-black text-white text-base sm:text-lg tracking-tight">{ex.reps}</p>
                            </div>
                            <div className="bg-slate-900/50 p-3 sm:p-4 rounded-xl sm:rounded-2xl text-center border border-white/5">
                              <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">{t.rest}</p>
                              <p className="font-black text-white text-base sm:text-lg tracking-tight">{ex.rest}s</p>
                            </div>
                          </div>

                          {exerciseLog && (
                            <div className="pt-4 sm:pt-6 border-t border-white/5 mt-auto">
                              <div className="flex items-center justify-between mb-3 sm:mb-4">
                                <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                                  <i className="fas fa-history"></i> {t.prTracker}
                                </p>
                                <span className="text-[8px] font-black text-slate-500 uppercase">{t.lastResult}</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                {exerciseLog.sets.map((s, si) => (
                                  <div key={si} className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black border transition-colors ${
                                    s.skipped
                                      ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                  }`}>
                                    {s.skipped
                                      ? `S${si+1}: -`
                                      : `S${si+1}: ${getDisplayWeight(s)} × ${getDisplayReps(s)}`
                                    }
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Cardio recommendations per day */}
                  {workoutProgram.cardioRecommendations && workoutProgram.cardioRecommendations.length > 0 && (
                    <div className="mt-8 p-5 sm:p-6 bg-rose-500/5 border border-rose-500/10 rounded-[2rem] relative z-10">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center">
                          <i className="fas fa-heart-pulse text-rose-400 text-sm"></i>
                        </div>
                        <h4 className="text-sm font-black text-rose-400 uppercase tracking-widest">{t.cardioTitle}</h4>
                      </div>
                      <div className="space-y-2">
                        {workoutProgram.cardioRecommendations.map((tip, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 bg-rose-500/5 border border-rose-500/10 rounded-xl">
                            <span className="text-rose-400 font-black text-xs mt-0.5">{i + 1}</span>
                            <p className="text-slate-300 text-xs font-medium leading-relaxed">{tip}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-10 animate-fade-in">
          <div className="bg-[#1a1f26] rounded-[2rem] sm:rounded-[3.5rem] p-5 sm:p-10 lg:p-14 border border-white/5 shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-14 opacity-5 text-9xl pointer-events-none translate-x-4"><i className="fas fa-chart-line text-white"></i></div>
             
             <div className="flex justify-between items-center mb-8 sm:mb-14 relative z-10">
               <div>
                  <p className="text-indigo-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">{t.progressTracker}</p>
                  <h3 className="text-2xl sm:text-4xl font-black text-white tracking-tighter uppercase leading-none">{t.stats}</h3>
               </div>
               <div className="flex items-center gap-3">
                 <button
                   onClick={() => { setManualHistoryError(null); setManualImportMessage(null); setShowImportModal(true); }}
                   className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 border border-indigo-500/20 flex items-center justify-center transition-all"
                   title={t.openImport}
                 >
                   <i className="fas fa-file-import"></i>
                 </button>
                 <button
                   onClick={() => setShowAdHocModal(true)}
                   className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-300 border border-emerald-500/20 flex items-center justify-center transition-all"
                   title={t.addActivity}
                 >
                   <i className="fas fa-person-running"></i>
                 </button>
                 <div className="px-3 sm:px-6 py-2 sm:py-3 bg-white/5 border border-white/5 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest">{workoutLogs.length} {t.sessions}</div>
               </div>
             </div>
             {manualImportMessage && (
               <div className="mb-10 rounded-[2rem] border border-emerald-500/20 bg-emerald-500/10 p-4 relative z-10">
                 <p className="text-sm text-emerald-300">{manualImportMessage}</p>
               </div>
             )}

             {workoutLogs.length === 0 ? (
               <div className="h-60 w-full flex flex-col items-center justify-center text-slate-600 gap-6">
                 <i className="fas fa-dumbbell text-6xl opacity-10 text-indigo-500"></i>
                 <p className="italic font-bold text-lg tracking-tight">{t.noSessions}</p>
               </div>
             ) : (
               <div className="space-y-6 relative z-10">
                 {workoutLogs.map((log, i) => (
                   <div key={i} className="space-y-4">
                     <div
                       onClick={() => setExpandedLogIdx(expandedLogIdx === i ? null : i)}
                       className={`p-4 sm:p-6 bg-slate-800/30 border rounded-2xl sm:rounded-[2.5rem] flex items-center gap-3 sm:gap-8 transition-all hover:bg-slate-800/60 cursor-pointer group ${expandedLogIdx === i ? 'border-indigo-500/40 bg-indigo-500/5 ring-1 ring-indigo-500/20 shadow-2xl' : 'border-white/5'}`}
                     >
                       <div className={`w-10 h-10 sm:w-16 sm:h-16 rounded-xl sm:rounded-[1.5rem] flex items-center justify-center flex-shrink-0 text-lg sm:text-3xl transition-all ${
                          log.isAdHoc
                            ? (expandedLogIdx === i ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-600/20' : 'bg-emerald-900/50 text-emerald-400 group-hover:bg-emerald-800 group-hover:text-white')
                            : (expandedLogIdx === i ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'bg-slate-700 text-slate-400 group-hover:bg-slate-900 group-hover:text-white')
                       }`}>
                          <i className={`fas ${log.isAdHoc ? 'fa-person-running' : 'fa-check'}`}></i>
                       </div>

                       <div className="flex-1 min-w-0">
                         <h4 className={`font-black text-white text-sm sm:text-xl tracking-tight uppercase transition-colors truncate ${log.isAdHoc ? 'group-hover:text-emerald-400' : 'group-hover:text-indigo-400'}`}>{log.sessionTitle}</h4>
                         <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-4 gap-y-0.5 mt-1 sm:mt-2">
                           <div className="flex items-center gap-1.5">
                             <div className={`w-1.5 h-1.5 rounded-full shadow-[0_0_8px] ${log.isAdHoc ? 'bg-emerald-500 shadow-emerald-500/80' : 'bg-indigo-500 shadow-indigo-500/80'}`}></div>
                             <span className="text-[9px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider sm:tracking-widest">{new Date(log.date).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                           </div>
                           <span className="text-slate-600 tracking-widest text-[10px] hidden sm:inline">•</span>
                           <span className="text-[9px] sm:text-[11px] font-black text-slate-500 uppercase tracking-wider sm:tracking-widest leading-none">{log.exercises.length} {t.exercises}</span>
                           {log.durationMinutes && (
                             <>
                               <span className="text-slate-600 tracking-widest text-[10px] hidden sm:inline">•</span>
                               <span className="text-[9px] sm:text-[11px] font-black text-indigo-400 uppercase tracking-wider sm:tracking-widest leading-none flex items-center gap-1">
                                 <i className="fas fa-stopwatch text-[8px]"></i> {log.durationMinutes} min
                               </span>
                             </>
                           )}
                           {log.caloriesBurned && (
                             <>
                               <span className="text-slate-600 tracking-widest text-[10px] hidden sm:inline">•</span>
                               <span className="text-[9px] sm:text-[11px] font-black text-orange-400 uppercase tracking-wider sm:tracking-widest leading-none flex items-center gap-1">
                                 <i className="fas fa-fire text-[8px]"></i> {log.caloriesBurned} {t.kcalBurned}
                               </span>
                             </>
                           )}
                         </div>
                       </div>

                       <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-slate-900 border border-white/5 text-slate-500 group-hover:text-white flex items-center justify-center transition-all shadow-xl flex-shrink-0">
                         <i className={`fas fa-chevron-${expandedLogIdx === i ? 'up' : 'down'} text-xs sm:text-sm`}></i>
                       </div>
                     </div>

                     {expandedLogIdx === i && (
                       <div className="p-4 sm:p-10 bg-slate-900/40 border border-white/5 rounded-2xl sm:rounded-[3rem] shadow-inner space-y-6 sm:space-y-10 animate-fade-in mx-0 sm:mx-6 mb-6 sm:mb-10 border-t-0 -mt-6 sm:-mt-10 pt-10 sm:pt-16">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
                           {log.exercises.map((el, exi) => (
                             <div key={exi} className="bg-slate-800/50 p-4 sm:p-6 rounded-xl sm:rounded-[2rem] border border-white/5 group/ex">
                               <div className="flex items-center justify-between mb-3 sm:mb-6">
                                 <h5 className="font-black text-white text-xs sm:text-base tracking-tight uppercase flex items-center gap-2 sm:gap-3">
                                   <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-indigo-600 rounded-full shadow-[0_0_8px_rgba(79,70,229,0.5)] flex-shrink-0"></span>
                                   <span className="break-words">{el.exerciseName}</span>
                                 </h5>
                               </div>
                               <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                 {el.sets.map((s, si) => (
                                   <div key={si} className={`px-2.5 sm:px-4 py-2 sm:py-3 border rounded-xl sm:rounded-2xl flex flex-col items-center min-w-[55px] sm:min-w-[70px] transition-all transform hover:scale-105 ${
                                     s.skipped
                                       ? 'bg-red-500/10 border-red-500/20'
                                       : 'bg-slate-900 border-white/5'
                                   }`}>
                                     <span className="text-[8px] font-black text-slate-500 uppercase mb-2">{t.setLabel} {si+1}</span>
                                     {s.skipped ? (
                                       <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">{t.skipped}</span>
                                     ) : (
                                       <>
                                         <span className="text-sm font-black text-white">{getDisplayWeight(s)}</span>
                                         <span className="text-[8px] font-extrabold text-indigo-500 uppercase mt-1 opacity-80">{getDisplayReps(s)} {t.reps}</span>
                                       </>
                                     )}
                                   </div>
                                 ))}
                               </div>
                             </div>
                           ))}
                         </div>
                         {/* Session notes */}
                         {log.notes && (
                           <div className="p-5 bg-violet-500/5 border border-violet-500/10 rounded-2xl">
                             <div className="flex items-center gap-2 mb-2">
                               <i className="fas fa-pen text-violet-400 text-xs"></i>
                               <p className="text-[9px] font-black text-violet-400 uppercase tracking-widest">{language === 'de' ? 'Notizen' : 'Notes'}</p>
                             </div>
                             <p className="text-sm text-slate-300 font-medium leading-relaxed whitespace-pre-wrap">{log.notes}</p>
                           </div>
                         )}
                       </div>
                     )}
                   </div>
                 ))}
               </div>
             )}
          </div>
        </div>
      )}

      {/* ── Recovery & Training Load Section ── */}
      <div className="mt-8 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <i className="fas fa-heartbeat text-emerald-400 text-sm"></i>
          <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">{t.recoveryTitle}</h3>
        </div>

        {!recoverySummary || recoverySummary.entries.length === 0 ? (
          <div className="rounded-2xl sm:rounded-[2.5rem] bg-[#0f172a]/60 border border-white/10 p-8 text-center">
            <i className="fas fa-heart-circle-check text-slate-600 text-3xl mb-4"></i>
            <p className="text-sm text-slate-500 font-medium">{t.noRecoveryData}</p>
          </div>
        ) : (
          <>
            {/* Recovery Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Avg Recovery Score */}
              <div className="rounded-2xl sm:rounded-[2.5rem] bg-[#0f172a]/60 border border-white/10 p-6">
                <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-2">{t.avgRecovery}</p>
                <p className="text-3xl font-black text-white">{Math.round(recoverySummary.avgRecoveryScore)}</p>
                <p className="text-[10px] text-slate-500 font-bold mt-1">/ 100</p>
              </div>
              {/* Avg Training Load */}
              <div className="rounded-2xl sm:rounded-[2.5rem] bg-[#0f172a]/60 border border-white/10 p-6">
                <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest mb-2">{t.avgLoad}</p>
                <p className="text-3xl font-black text-white">{Math.round(recoverySummary.avgTrainingLoad)}</p>
              </div>
              {/* Trend */}
              <div className="rounded-2xl sm:rounded-[2.5rem] bg-[#0f172a]/60 border border-white/10 p-6">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">{t.trend}</p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">
                    {recoverySummary.trend === 'improving' ? '↑' : recoverySummary.trend === 'declining' ? '↓' : '→'}
                  </span>
                  <span className={`text-sm font-black uppercase ${recoverySummary.trend === 'improving' ? 'text-emerald-400' : recoverySummary.trend === 'declining' ? 'text-red-400' : 'text-slate-300'}`}>
                    {recoverySummary.trend === 'improving' ? t.improving : recoverySummary.trend === 'declining' ? t.declining : t.stable}
                  </span>
                </div>
              </div>
              {/* Load/Recovery Ratio */}
              <div className="rounded-2xl sm:rounded-[2.5rem] bg-[#0f172a]/60 border border-white/10 p-6">
                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2">{t.loadRatio}</p>
                <p className={`text-3xl font-black ${recoverySummary.loadToRecoveryRatio <= 1.2 ? 'text-emerald-400' : recoverySummary.loadToRecoveryRatio <= 1.8 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {recoverySummary.loadToRecoveryRatio.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Recovery Timeline Chart */}
            <div className="rounded-2xl sm:rounded-[2.5rem] bg-[#0f172a]/60 border border-white/10 p-6">
              <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-4">{t.trainingLoad} / {t.recoveryScore}</p>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={recoverySummary.entries.slice(-14).map(e => ({
                  date: e.workoutDate.slice(5),
                  load: Math.round(e.trainingLoad),
                  recovery: Math.round(e.recoveryScore),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" tick={{ fill: '#fb923c', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: '#34d399', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', fontSize: 12, fontWeight: 700 }} />
                  <Bar yAxisId="left" dataKey="load" fill="#fb923c" fillOpacity={0.7} radius={[6, 6, 0, 0]} name={t.trainingLoad} />
                  <Line yAxisId="right" type="monotone" dataKey="recovery" stroke="#34d399" strokeWidth={2.5} dot={{ fill: '#34d399', r: 3 }} name={t.recoveryScore} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Recent Recovery Entries */}
            <div className="rounded-2xl sm:rounded-[2.5rem] bg-[#0f172a]/60 border border-white/10 p-6 space-y-3">
              <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2">{t.recoveryScore} — {language === 'de' ? 'Letzte Einträge' : 'Recent Entries'}</p>
              {recoverySummary.entries.slice(-5).reverse().map((entry, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-white truncate">{entry.workoutTitle}</p>
                    <p className="text-[10px] text-slate-500 font-bold">{entry.workoutDate.slice(0, 10)}</p>
                    {entry.baselineHRV != null && entry.nextDayHRV != null && (
                      <p className="text-[10px] text-slate-500 mt-1">
                        HRV: {Math.round(entry.baselineHRV)} → {Math.round(entry.nextDayHRV)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-[10px] font-black text-orange-400">
                      {Math.round(entry.trainingLoad)}
                    </span>
                    <span className={`px-3 py-1 rounded-full border text-[10px] font-black ${
                      entry.recoveryScore >= 75 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                      entry.recoveryScore >= 50 ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
                      'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}>
                      {Math.round(entry.recoveryScore)}
                    </span>
                    <span className={`text-[9px] font-black uppercase tracking-wider ${
                      entry.recoveryStatus === 'optimal' ? 'text-emerald-400' :
                      entry.recoveryStatus === 'adequate' ? 'text-yellow-400' :
                      'text-red-400'
                    }`}>
                      {entry.recoveryStatus === 'optimal' ? t.optimal :
                       entry.recoveryStatus === 'adequate' ? t.adequate :
                       t.insufficient}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* AI Insight Bubbles */}
            <div className="rounded-2xl sm:rounded-[2.5rem] bg-[#0f172a]/60 border border-white/10 p-6 space-y-4">
              {recoveryInsight && recoveryInsight.length > 0 && (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <i className="fas fa-brain text-indigo-400 text-xs"></i>
                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">AI Recovery Insight</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {recoveryInsight.map((bubble, bi) => {
                      const statusStyles = bubble.status === 'good'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : bubble.status === 'bad'
                        ? 'bg-red-500/10 border-red-500/20 text-red-400'
                        : 'bg-amber-500/10 border-amber-500/20 text-amber-400';
                      const iconBg = bubble.status === 'good'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : bubble.status === 'bad'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-amber-500/20 text-amber-400';
                      return (
                        <div key={bi} className={`p-4 rounded-2xl border flex items-start gap-3 ${statusStyles}`}>
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                            <i className={`fas ${bubble.icon} text-sm`}></i>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-wider opacity-70 mb-0.5">{bubble.label}</p>
                            <p className="text-xs font-bold text-slate-200 leading-snug">{bubble.value}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {onAnalyzeRecovery && (
                <button
                  onClick={onAnalyzeRecovery}
                  disabled={isAnalyzingRecovery}
                  className="w-full px-6 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest transition-all border border-indigo-400/20"
                >
                  <i className="fas fa-wand-magic-sparkles mr-2"></i>
                  {isAnalyzingRecovery ? t.analyzingRecovery : t.analyzeRecovery}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {showAdHocModal && (
        <div className="fixed inset-0 z-[300] bg-[#0f172a]/80 backdrop-blur-xl flex items-center justify-center p-2 sm:p-6 animate-fade-in">
          <div className="bg-[#1a1f26] rounded-[2rem] sm:rounded-[3.5rem] p-5 sm:p-8 lg:p-12 max-w-lg w-full shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10 relative">
            <button
              onClick={() => { setShowAdHocModal(false); setAdHocActivity(''); setAdHocDuration(60); }}
              className="absolute top-5 right-5 sm:top-8 sm:right-8 w-12 h-12 rounded-2xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center transition-all border border-white/5"
            >
              <i className="fas fa-times"></i>
            </button>
            <div className="space-y-4 mb-6">
              <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.3em]">{t.addActivity}</p>
              <h4 className="text-xl sm:text-3xl font-black text-white tracking-tight uppercase">
                <i className="fas fa-person-running mr-3 text-emerald-400"></i>
                {t.addActivity}
              </h4>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-2 uppercase tracking-wider font-bold">{t.activityName}</label>
                <input
                  type="text"
                  value={adHocActivity}
                  onChange={(e) => setAdHocActivity(e.target.value)}
                  placeholder="Padel Tennis, Schwimmen, Fußball..."
                  className="w-full rounded-xl sm:rounded-2xl border border-white/10 bg-slate-900/60 px-5 py-4 text-sm text-white outline-none transition-all focus:border-emerald-500 placeholder:text-slate-600"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-2 uppercase tracking-wider font-bold">{t.duration}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={10}
                    max={180}
                    step={5}
                    value={adHocDuration}
                    onChange={(e) => setAdHocDuration(Number(e.target.value))}
                    className="flex-1 accent-emerald-500"
                  />
                  <span className="text-white font-black text-lg min-w-[4rem] text-center">{adHocDuration} min</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 pt-2">
                <button
                  onClick={() => { setShowAdHocModal(false); setAdHocActivity(''); setAdHocDuration(60); }}
                  className="px-6 py-4 bg-white/5 hover:bg-white/10 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest border border-white/10"
                >
                  {t.close}
                </button>
                <button
                  onClick={handleAddAdHocActivity}
                  disabled={isEstimatingAdHoc || adHocActivity.trim().length === 0}
                  className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest transition-all border border-emerald-400/20"
                >
                  <i className="fas fa-fire mr-2"></i>
                  {isEstimatingAdHoc ? t.estimating : t.addToHistory}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-[300] bg-[#0f172a]/80 backdrop-blur-xl flex items-center justify-center p-2 sm:p-6 animate-fade-in">
          <div className="bg-[#1a1f26] rounded-[2rem] sm:rounded-[3.5rem] p-5 sm:p-8 lg:p-12 max-w-3xl w-full shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10 relative">
            <button
              onClick={() => setShowImportModal(false)}
              className="absolute top-5 right-5 sm:top-8 sm:right-8 w-12 h-12 rounded-2xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center transition-all border border-white/5"
            >
              <i className="fas fa-times"></i>
            </button>
            <div className="space-y-4 mb-6">
              <p className="text-indigo-500 text-[10px] font-black uppercase tracking-[0.3em]">{t.importedHistorySummary}</p>
              <h4 className="text-xl sm:text-3xl font-black text-white tracking-tight uppercase">{t.manualHistoryTitle}</h4>
              <p className="text-sm text-slate-400">{t.manualHistorySubtitle}</p>
            </div>
            <div className="space-y-4">
              <textarea
                value={manualHistoryText}
                onChange={(e) => setManualHistoryText(e.target.value)}
                placeholder={t.manualHistoryPlaceholder}
                className="w-full min-h-[220px] rounded-xl sm:rounded-[2rem] border border-white/10 bg-slate-900/60 p-6 text-sm text-white outline-none transition-all focus:border-indigo-500 placeholder:text-slate-600"
              />
              <div className="flex items-center justify-between gap-4">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="px-6 py-4 bg-white/5 hover:bg-white/10 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest border border-white/10"
                >
                  {t.close}
                </button>
                <button
                  onClick={handleInterpretHistory}
                  disabled={isInterpretingHistory || manualHistoryText.trim().length === 0}
                  className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest transition-all border border-indigo-400/20"
                >
                  <i className="fas fa-file-import mr-2"></i>
                  {isInterpretingHistory ? t.interpretingHistory : t.interpretHistory}
                </button>
              </div>
              {manualHistoryError && (
                <div className="rounded-[1.5rem] border border-red-500/20 bg-red-500/10 p-4">
                  <p className="text-sm text-red-300">{manualHistoryError}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkoutTab;
