import React, { useState } from 'react';
import { WorkoutSession, WorkoutProgram, Exercise, ExerciseLog, WorkoutLog, Language, UserProfile } from '../../types';
import { adjustWorkoutSession, WorkoutAdjustmentDraft } from '../../services/geminiService';
import { isBodyweightExercise, parseSuggestedWeight, parseMaxReps, weightPlaceholder, repsPlaceholder } from './workoutHelpers';
import { WorkoutTranslations } from './workoutTranslations';

interface LiveSessionProps {
  session: WorkoutSession;
  currentLog: ExerciseLog[];
  setCurrentLog: (log: ExerciseLog[]) => void;
  onSaveLog: (log: WorkoutLog) => void;
  onFinish: () => void;
  language: Language;
  profile: UserProfile | null;
  t: WorkoutTranslations;
  workoutLogs: WorkoutLog[];
  // Timer state
  restDisplay: number | null;
  restEndTime: number | null;
  setRestEndTime: (v: number | null) => void;
  restExerciseName: string;
  setRestExerciseName: (v: string) => void;
  restExpired: boolean;
  setRestExpired: (v: boolean) => void;
  workoutElapsed: number;
  workoutStartTime: number | null;
  // Session state
  sessionNotes: string;
  setSessionNotes: (v: string) => void;
  saveToast: string | null;
  // Handlers from parent
  handleRestStart: (exName: string, restSeconds: number | string) => void;
  handleAcceptSuggestion: (exIdx: number, sIdx: number, exercise: Exercise) => void;
  handleFinishSet: (exIdx: number, sIdx: number, exercise: Exercise) => void;
  handleSkipSet: (exIdx: number, sIdx: number) => void;
  handleSwapExercise: (exIdx: number, exercise: Exercise) => void;
  swappingExIdx: number | null;
  swapDrafts: { exIdx: number; options: Exercise[] } | null;
  handlePickSwap: (alternative: Exercise) => void;
  setSwapDrafts: (v: null) => void;
  // Workout adjustment
  workoutAdjustInput: string;
  setWorkoutAdjustInput: (v: string) => void;
  workoutDraft: WorkoutAdjustmentDraft | null;
  setWorkoutDraft: (v: WorkoutAdjustmentDraft | null) => void;
  isAdjustingWorkout: boolean;
  setIsAdjustingWorkout: (v: boolean) => void;
  onUpdateWorkoutPlan: (plan: any) => void;
  workoutProgram: WorkoutProgram | null;
  liveSessionData: WorkoutSession | null;
  setLiveSessionData: (v: WorkoutSession | null) => void;
  // Audio
  playCue: (text: string, isRestEnd?: boolean) => void;
}

const LiveSession: React.FC<LiveSessionProps> = (props) => {
  const {
    session, currentLog, setCurrentLog, onSaveLog, onFinish, language, profile, t, workoutLogs,
    restDisplay, restEndTime, setRestEndTime, restExerciseName, setRestExerciseName,
    restExpired, setRestExpired, workoutElapsed, workoutStartTime,
    sessionNotes, setSessionNotes, saveToast,
    handleRestStart, handleAcceptSuggestion, handleFinishSet, handleSkipSet,
    handleSwapExercise, swappingExIdx, swapDrafts, handlePickSwap, setSwapDrafts,
    workoutAdjustInput, setWorkoutAdjustInput, workoutDraft, setWorkoutDraft,
    isAdjustingWorkout, setIsAdjustingWorkout, onUpdateWorkoutPlan, workoutProgram,
    liveSessionData, setLiveSessionData, playCue,
  } = props;

  // Local state
  const [selectedExerciseInfo, setSelectedExerciseInfo] = useState<Exercise | null>(null);
  const [historyExercise, setHistoryExercise] = useState<string | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);

  // Local helper
  const getExerciseHistory = (exerciseName: string) => {
    return workoutLogs
      .flatMap(log => log.exercises
        .filter(ex => ex.exerciseName.toLowerCase() === exerciseName.toLowerCase())
        .map(ex => ({ date: log.date, sets: ex.sets }))
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  };

  return (
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
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tighter uppercase leading-none truncate">{session.dayTitle}</h2>
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
              if (window.confirm(confirmEnd)) { onFinish(); }
            }}
            className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all border border-white/5"
          >
            <i className="fas fa-times text-xl sm:text-2xl"></i>
          </button>
        </div>

        {/* Rest timer is now only shown as floating bottom bar — no inline block that forces scrolling */}

        {/* Warmup in live session */}
        {session.warmup && session.warmup.length > 0 && (
          <div className="mb-8 p-5 sm:p-6 bg-amber-500/5 border border-amber-500/10 rounded-[2rem] relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <i className="fas fa-fire-flame-curved text-amber-400 text-sm"></i>
              </div>
              <h4 className="text-sm font-black text-amber-400 uppercase tracking-widest">{t.warmup}</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {session.warmup.map((step, wi) => (
                <span key={wi} className="px-3.5 py-2 bg-amber-500/10 border border-amber-500/15 rounded-xl text-xs font-semibold text-slate-300">
                  {step}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-14 relative z-10">
          {session.exercises.map((ex, exIdx) => (
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 ml-0 sm:ml-6 md:ml-10">
                {currentLog[exIdx]?.sets.map((set, sIdx) => {
                  const isDone = set.done === true;
                  const isSkipped = set.skipped === true;
                  const isBW = isBodyweightExercise(ex);
                  const hasValues = isBW ? set.reps > 0 : (set.weight > 0 || set.reps > 0);
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
                        {!isBodyweightExercise(ex) ? (
                        <div className="flex-1">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">{t.weight}</label>
                          <div className="relative">
                            <input
                              type="number"
                              inputMode="decimal"
                              placeholder={weightPlaceholder(ex.suggestedWeight)}
                              value={set.weight || ''}
                              disabled={isSkipped || isDone}
                              onChange={(e) => { const copy = [...currentLog]; copy[exIdx].sets[sIdx].weight = parseFloat(e.target.value) || 0; setCurrentLog(copy); }}
                              className={`w-full bg-slate-900/50 rounded-xl py-3 pl-3 pr-8 sm:py-4 sm:pl-4 sm:pr-10 outline-none font-black text-base sm:text-xl transition-all ${isSkipped ? 'text-red-300 border border-red-500/10' : isDone ? 'text-emerald-300 border border-emerald-500/10' : 'text-white border border-white/5 focus:border-indigo-500 focus:bg-slate-900'}`}
                            />
                            <span className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-[9px] sm:text-[10px] font-black text-slate-600 uppercase">kg</span>
                          </div>
                        </div>
                        ) : (
                        <div className="flex-1 flex items-end">
                          <div className="w-full bg-slate-900/30 rounded-xl p-3 sm:p-4 border border-white/5 flex items-center justify-center gap-2">
                            <i className="fas fa-person text-indigo-400 text-sm"></i>
                            <span className="font-black text-lg sm:text-xl text-indigo-300">BW</span>
                          </div>
                        </div>
                        )}
                        <div className="flex-1">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">{t.reps}</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder={repsPlaceholder(ex.reps) || ex.reps || ''}
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
                      if (!profile || !session) return;
                      setIsAdjustingWorkout(true);
                      try {
                        const draft = await adjustWorkoutSession(profile, session.exercises, workoutAdjustInput, language);
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
                    const isNew = !session?.exercises.some(o => o.name === ex.name);
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
                  {session?.exercises
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
                      if (!workoutDraft || !workoutProgram || !session) return;
                      const sessionIdx = workoutProgram.sessions.findIndex(s => s.dayTitle === session.dayTitle);
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
                sessionTitle: session.dayTitle,
                exercises: currentLog,
                durationMinutes: durationMin,
                notes: sessionNotes.trim() || undefined,
              });
              onFinish();
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
};

export default LiveSession;
