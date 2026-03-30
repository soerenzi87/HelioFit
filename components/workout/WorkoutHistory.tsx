
import React, { useState } from 'react';
import { WorkoutLog, ExerciseLog, Language, RecoveryBubble } from '../../types';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrainingRecoverySummary } from '../../services/recoveryService';
import { WorkoutTranslations } from './workoutTranslations';
import { getDisplayWeight, getDisplayReps } from './workoutHelpers';

interface WorkoutHistoryProps {
  workoutLogs: WorkoutLog[];
  language: Language;
  t: WorkoutTranslations;
  recoverySummary?: TrainingRecoverySummary | null;
  recoveryInsight?: RecoveryBubble[] | null;
  onAnalyzeRecovery?: () => void;
  isAnalyzingRecovery?: boolean;
  // Ad-hoc modal
  showAdHocModal: boolean;
  setShowAdHocModal: (v: boolean) => void;
  adHocActivity: string;
  setAdHocActivity: (v: string) => void;
  adHocDuration: number;
  setAdHocDuration: (v: number) => void;
  adHocDate: string;
  setAdHocDate: (v: string) => void;
  isEstimatingAdHoc: boolean;
  handleAddAdHocActivity: () => void;
  // Import modal
  showImportModal: boolean;
  setShowImportModal: (v: boolean) => void;
  manualHistoryText: string;
  setManualHistoryText: (v: string) => void;
  isInterpretingHistory: boolean;
  handleInterpretHistory: () => void;
  manualHistoryError: string | null;
  manualImportMessage: string | null;
  setManualHistoryError: (v: string | null) => void;
  setManualImportMessage: (v: string | null) => void;
}

const WorkoutHistory: React.FC<WorkoutHistoryProps> = (props) => {
  const {
    workoutLogs, language, t, recoverySummary, recoveryInsight,
    onAnalyzeRecovery, isAnalyzingRecovery,
    showAdHocModal, setShowAdHocModal, adHocActivity, setAdHocActivity,
    adHocDuration, setAdHocDuration, adHocDate, setAdHocDate,
    isEstimatingAdHoc, handleAddAdHocActivity,
    showImportModal, setShowImportModal, manualHistoryText, setManualHistoryText,
    isInterpretingHistory, handleInterpretHistory, manualHistoryError, manualImportMessage,
    setManualHistoryError, setManualImportMessage,
  } = props;

  const [expandedLogIdx, setExpandedLogIdx] = useState<number | null>(null);

  return (
    <>
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
                  recovery: e.pending ? undefined : Math.round(e.recoveryScore),
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
                    {entry.pending ? (
                      <span className="px-3 py-1 rounded-full bg-slate-500/10 border border-slate-500/20 text-[10px] font-black text-slate-400">
                        <i className="fas fa-clock mr-1"></i>—
                      </span>
                    ) : (
                      <span className={`px-3 py-1 rounded-full border text-[10px] font-black ${
                        entry.recoveryScore >= 75 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                        entry.recoveryScore >= 50 ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
                        'bg-red-500/10 border-red-500/20 text-red-400'
                      }`}>
                        {Math.round(entry.recoveryScore)}
                      </span>
                    )}
                    <span className={`text-[9px] font-black uppercase tracking-wider ${
                      entry.recoveryStatus === 'pending' ? 'text-slate-500' :
                      entry.recoveryStatus === 'optimal' ? 'text-emerald-400' :
                      entry.recoveryStatus === 'adequate' ? 'text-yellow-400' :
                      'text-red-400'
                    }`}>
                      {entry.recoveryStatus === 'pending' ? t.pending :
                       entry.recoveryStatus === 'optimal' ? t.optimal :
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
              onClick={() => { setShowAdHocModal(false); setAdHocActivity(''); setAdHocDuration(60); setAdHocDate(new Date().toISOString().slice(0, 10)); }}
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
                <label className="block text-xs text-slate-400 mb-2 uppercase tracking-wider font-bold">{language === 'de' ? 'Datum' : 'Date'}</label>
                <input
                  type="date"
                  value={adHocDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setAdHocDate(e.target.value)}
                  className="w-full rounded-xl sm:rounded-2xl border border-white/10 bg-slate-900/60 px-5 py-4 text-sm text-white outline-none transition-all focus:border-emerald-500 [color-scheme:dark]"
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
                  onClick={() => { setShowAdHocModal(false); setAdHocActivity(''); setAdHocDuration(60); setAdHocDate(new Date().toISOString().slice(0, 10)); }}
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
    </>
  );
};

export default WorkoutHistory;
