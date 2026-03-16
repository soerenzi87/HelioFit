
// Add missing React import
import React, { useState } from 'react';
import { AIAnalysis, UserProfile, Language, FitnessGoal, HealthData, ProgressInsight } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, AreaChart, Area } from 'recharts';

interface DashboardProps {
  analysis: AIAnalysis | null;
  progressAnalysis: ProgressInsight[] | null;
  profile: UserProfile;
  healthData: HealthData | null;
  language: Language;
  onRefresh: () => void;
  onAnalyzeProgress: () => void;
  onUpdateProfile: (updated: UserProfile) => void;
  onResetSync?: () => void;
  isAnalyzing: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ analysis, progressAnalysis, profile, healthData, language, onRefresh, onAnalyzeProgress, onUpdateProfile, onResetSync, isAnalyzing }) => {
  const [selectedInsight, setSelectedInsight] = useState<ProgressInsight | null>(null);

  const t = language === 'de' ? {
    status: 'Status: Aktiv',
    weight: 'Gewicht',
    age: 'Alter',
    focus: 'Fokus-Ziele:',
    cockpit: 'KI-Cockpit',
    progressCockpit: 'Fortschritts-Analyse',
    weightHistory: 'Gewichtsverlauf',
    progressLabel: 'Fortschritt',
    noData: 'Noch keine Daten vorhanden',
    targets: 'Tägliche Zielvorgaben',
    energy: 'Energiebedarf (TEE)',
    recommended: 'Ziel-Aufnahme',
    hydration: 'Hydrierung',
    protein: 'Eiweiß',
    carbs: 'Carbs',
    fats: 'Fette',
    liter: 'Liter',
    refresh: 'Plan erstellen',
    analyzeProgress: 'Fortschritt analysieren',
    analyzing: 'Analysiere...',
    deficitLabel: 'Aggressivität des Defizits',
    deficitMild: 'Moderat (-250)',
    deficitStandard: 'Standard (-500)',
    deficitAggressive: 'Intensiv (-750)',
    deficitMaintenance: 'Erhaltung (±0)',
    goalsMap: {
      [FitnessGoal.WEIGHT_LOSS]: 'Gewichtsreduzierung',
      [FitnessGoal.MUSCLE_GAIN]: 'Muskelaufbau',
      [FitnessGoal.MAINTENANCE]: 'Gewicht halten',
      [FitnessGoal.ATHLETIC_PERFORMANCE]: 'Athletische Leistung',
      [FitnessGoal.FLEXIBILITY]: 'Flexibilität & Mobilität',
      [FitnessGoal.ENDURANCE]: 'Ausdauer',
    },
  } : {
    status: 'Status: Active',
    weight: 'Weight',
    age: 'Age',
    focus: 'Focus Goals:',
    cockpit: 'AI Cockpit',
    weightHistory: 'Weight History',
    progressLabel: 'Progress',
    noData: 'No data available yet',
    targets: 'Daily Targets',
    energy: 'Energy Needs (TEE)',
    recommended: 'Calorie Target',
    hydration: 'Hydration',
    protein: 'Protein',
    carbs: 'Carbs',
    fats: 'Fats',
    liter: 'Liters',
    refresh: 'Start AI Analysis',
    analyzing: 'Analyzing...',
    deficitLabel: 'Deficit Intensity',
    deficitMild: 'Mild (-250)',
    deficitStandard: 'Standard (-500)',
    deficitAggressive: 'Aggressive (-750)',
    deficitMaintenance: 'Maintenance (±0)',
    goalsMap: {
      [FitnessGoal.WEIGHT_LOSS]: 'Weight Loss',
      [FitnessGoal.MUSCLE_GAIN]: 'Muscle Gain',
      [FitnessGoal.MAINTENANCE]: 'Maintain Weight',
      [FitnessGoal.ATHLETIC_PERFORMANCE]: 'Athletic Performance',
      [FitnessGoal.FLEXIBILITY]: 'Flexibility & Mobility',
      [FitnessGoal.ENDURANCE]: 'Endurance',
    },
  };

  const handleDeficitChange = (val: number) => {
    onUpdateProfile({ ...profile, calorieAdjustment: val });
  };

  // Zusammenführung von manuellen Logs und Health-Importen
  const manualWeights = profile.weightHistory || [];
  const importedWeights = (healthData?.metrics || [])
    .filter(m => m.weight)
    .map(m => ({ date: m.date, weight: m.weight! })) || [];

  const combinedWeightData = [...manualWeights, ...importedWeights]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(entry => ({
      date: new Date(entry.date).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { day: '2-digit', month: '2-digit' }),
      weight: entry.weight
    }));

  const weightData = combinedWeightData;

  const currentDeficit = profile.calorieAdjustment || 0;
  const isWeightLossGoal = (profile.goals || []).includes(FitnessGoal.WEIGHT_LOSS);

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-[#1a1f26] p-8 rounded-[2.5rem] shadow-2xl border border-white/5 text-white">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[1.25rem] flex items-center justify-center text-white shadow-xl overflow-hidden border border-white/10">
              {profile.profilePicture ? (
                <img src={profile.profilePicture} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-black italic">{profile.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div>
              <h3 className="font-black text-xl tracking-tight">{profile.name}</h3>
              <p className="text-orange-500 text-[10px] uppercase tracking-[0.2em] font-black">{t.status}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 bg-slate-800/50 rounded-2xl border border-white/5">
              <p className="text-slate-500 text-[9px] font-black mb-1 uppercase tracking-widest">{t.weight}</p>
              <p className="font-black text-lg text-white">{profile.weight} <span className="text-[10px] text-slate-500">kg</span></p>
            </div>
            <div className="p-4 bg-slate-800/50 rounded-2xl border border-white/5">
              <p className="text-slate-500 text-[9px] font-black mb-1 uppercase tracking-widest">{t.age}</p>
              <p className="font-black text-lg text-white">{profile.age} <span className="text-[10px] text-slate-500">{language === 'de' ? 'J.' : 'y.'}</span></p>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] ml-1">{t.focus}</p>
            <div className="flex flex-wrap gap-2">
              {(profile.goals || []).map(goal => (
                <span key={goal} className="px-3 py-1 bg-orange-500/10 text-orange-500 rounded-lg text-[10px] font-black border border-orange-500/20 uppercase tracking-widest">
                  {t.goalsMap[goal] || goal}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-[#1a1f26] p-8 rounded-[2.5rem] shadow-2xl text-white relative overflow-hidden border border-white/5">
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none transition-transform hover:scale-110 duration-1000"><i className="fas fa-bolt-lightning text-9xl"></i></div>
          <div className="flex justify-between items-start mb-8 relative z-10">
            <div>
              <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">{language === 'de' ? 'Intelligenz' : 'Intelligence'}</p>
              <h3 className="text-3xl font-black tracking-tighter flex items-center gap-3">
                {t.cockpit}
              </h3>
            </div>
            <div className="flex flex-wrap gap-3">
              {onResetSync && (
                <button 
                  onClick={onResetSync}
                  className="px-6 py-3 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl flex items-center gap-2"
                >
                  <i className="fas fa-unlink"></i> Reset
                </button>
              )}
              <button 
                onClick={onRefresh} 
                disabled={isAnalyzing}
                className={`px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isAnalyzing ? 'bg-slate-800 text-slate-500' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-600/20'}`}
              >
                {isAnalyzing ? t.analyzing : t.refresh}
              </button>
            </div>
          </div>
          
          {analysis ? (
            <div className="space-y-6 relative z-10">
              <div className="p-6 bg-white/5 rounded-[1.5rem] border border-white/5 italic">
                <p className="text-slate-300 leading-relaxed text-lg font-medium">"{analysis.summary}"</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(analysis.recommendations || []).slice(0, 2).map((rec, i) => (
                  <div key={i} className="flex items-start gap-4 text-xs bg-white/5 p-5 rounded-2xl border border-white/5 backdrop-blur-sm">
                    <i className="fas fa-star text-amber-500 mt-0.5 flex-shrink-0 text-xs"></i>
                    <span className="text-slate-300 font-semibold leading-normal">{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-white/5 rounded-[2rem]">
              <i className="fas fa-robot text-4xl mb-4 opacity-10 text-indigo-500"></i>
              <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">{language === 'de' ? 'Bereit für die KI-Analyse' : 'Ready for AI Analysis'}</p>
            </div>
          )}
        </div>
      </div>

      {isWeightLossGoal && (
        <div className="bg-[#1a1f26] p-8 rounded-[2.5rem] shadow-2xl border border-white/5">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-6 ml-1">{t.deficitLabel}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[0, -250, -500, -750].map(val => (
              <button 
                key={val} 
                onClick={() => handleDeficitChange(val)}
                className={`px-6 py-5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all border ${currentDeficit === val ? 'bg-orange-600 border-orange-500 text-white shadow-xl shadow-orange-600/20' : 'bg-slate-800/50 border-white/5 text-slate-400 hover:text-white hover:bg-slate-800'}`}
              >
                {val === 0 ? t.deficitMaintenance : val === -250 ? t.deficitMild : val === -500 ? t.deficitStandard : t.deficitAggressive}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-[#1a1f26] p-8 rounded-[2.5rem] shadow-2xl text-white relative overflow-hidden border border-white/5">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none transition-transform hover:-rotate-12 duration-1000"><i className="fas fa-chart-line text-9xl"></i></div>
        <div className="flex justify-between items-start mb-8 relative z-10">
          <div>
            <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">{language === 'de' ? 'Performance' : 'Performance'}</p>
            <h3 className="text-3xl font-black tracking-tighter flex items-center gap-3">
              {t.progressCockpit}
            </h3>
          </div>
          <button 
            onClick={onAnalyzeProgress} 
            disabled={isAnalyzing}
            className={`px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isAnalyzing ? 'bg-slate-800 text-slate-500' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-600/20'}`}
          >
            {isAnalyzing ? t.analyzing : t.analyzeProgress}
          </button>
        </div>
        
        {Array.isArray(progressAnalysis) && progressAnalysis.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
            {progressAnalysis.map((insight, idx) => {
              const impactColors = {
                positive: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:border-emerald-500/40',
                neutral: 'border-blue-500/20 bg-blue-500/10 text-blue-400 hover:border-blue-500/40',
                negative: 'border-amber-500/20 bg-amber-500/10 text-amber-400 hover:border-amber-500/40'
              };
              const colors = impactColors[insight.impact] || impactColors.neutral;
              
              return (
                <button 
                  key={idx} 
                  onClick={() => setSelectedInsight(insight)}
                  className={`p-6 rounded-[2rem] border ${colors} text-left transition-all hover:scale-[1.03] active:scale-[0.97] flex flex-col gap-3 shadow-lg`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-60">{insight.category}</span>
                    <i className={`fas ${insight.impact === 'positive' ? 'fa-circle-check text-emerald-500' : insight.impact === 'negative' ? 'fa-circle-exclamation text-amber-500' : 'fa-circle-info text-blue-500'} text-xs`}></i>
                  </div>
                  <h4 className="font-black text-sm leading-tight text-white mb-1">{insight.title}</h4>
                  <p className="text-[10px] font-bold text-slate-400 line-clamp-2 leading-relaxed">{insight.summary}</p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-white/5 rounded-[2rem]">
            <i className="fas fa-history text-4xl mb-4 opacity-10 text-emerald-500"></i>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">{language === 'de' ? 'Warte auf Analyse' : 'Waiting for Analysis'}</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedInsight && (
        <div className="fixed inset-0 z-[200] bg-[#0f172a]/80 backdrop-blur-xl flex items-center justify-center p-6 animate-fade-in transition-all">
          <div className="bg-[#1a1f26] rounded-[3rem] p-10 max-w-xl w-full shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10 animate-scale-in relative text-white">
            <button 
              onClick={() => setSelectedInsight(null)} 
              className="absolute top-8 right-8 w-12 h-12 rounded-2xl bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all border border-white/5"
            >
              <i className="fas fa-times text-xl"></i>
            </button>
            <div className="flex items-center gap-4 mb-8">
              <span className="px-4 py-1.5 bg-indigo-600/20 rounded-xl text-[10px] font-black uppercase tracking-widest text-indigo-400 border border-indigo-500/20">{selectedInsight.category}</span>
              <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${selectedInsight.impact === 'positive' ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/20' : selectedInsight.impact === 'negative' ? 'bg-amber-600/20 text-amber-400 border-amber-500/20' : 'bg-blue-600/20 text-blue-400 border-blue-500/20'}`}>
                {selectedInsight.impact}
              </span>
            </div>
            <h3 className="text-4xl font-black mb-6 tracking-tighter uppercase">{selectedInsight.title}</h3>
            <div className="p-8 bg-slate-800/50 rounded-[2rem] border border-white/5 mb-8 italic">
              <p className="text-slate-300 font-bold leading-relaxed text-lg">"{selectedInsight.summary}"</p>
            </div>
            <p className="text-slate-400 font-medium leading-[1.8] text-sm whitespace-pre-wrap">{selectedInsight.detail}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#1a1f26] p-8 rounded-[2.5rem] shadow-2xl border border-white/5">
          <h3 className="font-black text-xl mb-8 text-white flex items-center justify-between uppercase tracking-tighter">
            <span>{t.weightHistory}</span>
            <span className="text-slate-500 font-black text-[10px] bg-white/5 px-3 py-1 rounded-lg uppercase tracking-[0.2em]">{t.progressLabel}</span>
          </h3>
          <div className="h-64">
            {weightData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weightData}>
                  <defs>
                    <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/><stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b', fontWeight: 800}} dy={10} />
                  <YAxis domain={['auto', 'auto']} axisLine={false} tickLine={false} hide />
                  <Tooltip 
                    contentStyle={{backgroundColor: '#1e293b', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)'}} 
                    itemStyle={{color: '#fff', fontWeight: 'bold'}}
                  />
                  <Area type="monotone" dataKey="weight" stroke="#4f46e5" strokeWidth={4} fillOpacity={1} fill="url(#colorWeight)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="flex items-center justify-center h-full text-slate-700 font-black uppercase tracking-widest text-[10px]">{t.noData}</div>}
          </div>
        </div>

        <div className="bg-[#1a1f26] p-8 rounded-[2.5rem] shadow-2xl border border-white/5">
          <h3 className="font-black text-xl mb-8 text-white uppercase tracking-tighter">{t.targets}</h3>
          {analysis ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 bg-slate-800/50 rounded-[1.5rem] border border-white/5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-700 flex items-center justify-center text-slate-400 text-xs"><i className="fas fa-calculator"></i></div>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{t.energy}</p>
                  </div>
                  <p className="font-black text-2xl text-white">{analysis.targets.maintenanceCalories} <span className="text-[10px] text-slate-500 uppercase tracking-widest">kcal</span></p>
                </div>
                <div className="p-5 bg-indigo-600/10 rounded-[1.5rem] border border-indigo-500/20">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-xs"><i className="fas fa-bullseye"></i></div>
                    <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">{t.recommended}</p>
                  </div>
                  <p className="font-black text-2xl text-indigo-400">{(analysis.targets.maintenanceCalories || 0) + (profile.calorieAdjustment || 0)} <span className="text-[10px] text-indigo-500/60 uppercase tracking-widest">kcal</span></p>
                </div>
              </div>

              <div className="flex items-center justify-between p-6 bg-blue-600/10 rounded-[2rem] border border-blue-500/20">
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-2xl shadow-lg shadow-blue-600/20"><i className="fas fa-glass-water"></i></div>
                  <div>
                    <p className="text-[10px] text-blue-400 font-black uppercase tracking-[0.2em] mb-1">{t.hydration}</p>
                    <p className="font-black text-3xl text-white leading-none">{analysis.targets.water} <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{t.liter}</span></p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                 <div className="text-center p-4 bg-slate-800/50 rounded-2xl border border-white/5"><p className="text-[9px] text-slate-500 font-black uppercase mb-1 tracking-widest">{t.protein}</p><p className="font-black text-lg text-white">{analysis.targets.protein}<span className="text-[10px] opacity-40 ml-0.5">g</span></p></div>
                 <div className="text-center p-4 bg-slate-800/50 rounded-2xl border border-white/5"><p className="text-[9px] text-slate-500 font-black uppercase mb-1 tracking-widest">{t.carbs}</p><p className="font-black text-lg text-white">{analysis.targets.carbs}<span className="text-[10px] opacity-40 ml-0.5">g</span></p></div>
                 <div className="text-center p-4 bg-slate-800/50 rounded-2xl border border-white/5"><p className="text-[9px] text-slate-500 font-black uppercase mb-1 tracking-widest">{t.fats}</p><p className="font-black text-lg text-white">{analysis.targets.fats}<span className="text-[10px] opacity-40 ml-0.5">g</span></p></div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-white/5 rounded-[2rem]">
              <i className="fas fa-chart-pie text-4xl mb-4 opacity-10 text-slate-500"></i>
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">{language === 'de' ? 'Warte auf Analyse' : 'Waiting for Analysis'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
