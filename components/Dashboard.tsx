
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
  const importedWeights = healthData?.metrics
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
  const isWeightLossGoal = profile.goals.includes(FitnessGoal.WEIGHT_LOSS);

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-3xl shadow-md border border-slate-100">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-gradient-to-br from-orange-400 to-amber-500 rounded-full flex items-center justify-center text-white shadow-inner overflow-hidden border-2 border-white">
              <span className="text-xl font-black">{profile.name.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900">{profile.name}</h3>
              <p className="text-slate-400 text-[10px] uppercase tracking-wider font-bold">{t.status}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-slate-500 text-[9px] font-semibold mb-1 uppercase">{t.weight}</p>
              <p className="font-black text-base text-slate-900">{profile.weight} kg</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-slate-500 text-[9px] font-semibold mb-1 uppercase">{t.age}</p>
              <p className="font-black text-base text-slate-900">{profile.age} {language === 'de' ? 'J.' : 'y.'}</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-slate-500 text-[9px] font-bold uppercase tracking-tight">{t.focus}</p>
            <div className="flex flex-wrap gap-1.5">
              {profile.goals.map(goal => (
                <span key={goal} className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded-lg text-[9px] font-bold border border-orange-100">
                  {t.goalsMap[goal]}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 to-indigo-950 p-6 rounded-3xl shadow-xl text-white relative overflow-hidden border border-slate-800">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><i className="fas fa-bolt-lightning text-8xl"></i></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <i className="fas fa-magic text-amber-400 text-sm"></i> {t.cockpit}
            </h3>
            <div className="flex flex-wrap gap-2">
              {onResetSync && (
                <button 
                  onClick={onResetSync}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500 text-red-200 hover:text-white border border-red-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center gap-2"
                >
                  <i className="fas fa-unlink"></i> Reset Fit
                </button>
              )}
              <button 
                onClick={onRefresh} 
                disabled={isAnalyzing}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isAnalyzing ? 'bg-slate-700 text-slate-400' : 'bg-white/10 hover:bg-white/20 text-white border border-white/20 shadow-sm'}`}
              >
                {isAnalyzing ? t.analyzing : t.refresh}
              </button>
            </div>
          </div>
          
          {analysis ? (
            <div className="space-y-5 relative z-10">
              <p className="text-slate-200 leading-relaxed italic text-base font-medium">"{analysis.summary}"</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {analysis.recommendations.slice(0, 2).map((rec, i) => (
                  <div key={i} className="flex items-start gap-3 text-xs bg-white/5 p-3.5 rounded-2xl border border-white/10 backdrop-blur-sm">
                    <i className="fas fa-star text-amber-400 mt-1 flex-shrink-0 text-[10px]"></i>
                    <span className="text-slate-200 font-medium">{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-white/10 rounded-2xl">
              <i className="fas fa-robot text-3xl mb-3 opacity-20"></i>
              <p className="text-slate-400 text-xs italic font-medium">Bereit für die KI-Analyse deiner Daten.</p>
            </div>
          )}
        </div>
      </div>

      {isWeightLossGoal && (
        <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{t.deficitLabel}</p>
          <div className="grid grid-cols-1 xs:grid-cols-2 sm:flex sm:flex-wrap gap-3">
            {[0, -250, -500, -750].map(val => (
              <button 
                key={val} 
                onClick={() => handleDeficitChange(val)}
                className={`px-4 py-3.5 rounded-2xl text-[10px] font-black uppercase transition-all border ${currentDeficit === val ? 'bg-orange-500 border-orange-500 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100'}`}
              >
                {val === 0 ? t.deficitMaintenance : val === -250 ? t.deficitMild : val === -500 ? t.deficitStandard : t.deficitAggressive}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gradient-to-br from-indigo-900 to-slate-900 p-6 rounded-3xl shadow-xl text-white relative overflow-hidden border border-indigo-800">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><i className="fas fa-chart-line text-8xl"></i></div>
        <div className="flex justify-between items-start mb-6 relative z-10">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <i className="fas fa-brain text-emerald-400 text-sm"></i> {t.progressCockpit}
          </h3>
          <button 
            onClick={onAnalyzeProgress} 
            disabled={isAnalyzing}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isAnalyzing ? 'bg-slate-700 text-slate-400' : 'bg-white/10 hover:bg-white/20 text-white border border-white/20 shadow-sm'}`}
          >
            {isAnalyzing ? t.analyzing : t.analyzeProgress}
          </button>
        </div>
        
        {Array.isArray(progressAnalysis) && progressAnalysis.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10">
            {progressAnalysis.map((insight, idx) => {
              const impactColors = {
                positive: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
                neutral: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
                negative: 'border-amber-500/30 bg-amber-500/10 text-amber-400'
              };
              const colors = impactColors[insight.impact] || impactColors.neutral;
              
              return (
                <button 
                  key={idx} 
                  onClick={() => setSelectedInsight(insight)}
                  className={`p-4 rounded-2xl border ${colors} text-left transition-all hover:scale-[1.02] active:scale-[0.98] flex flex-col gap-2`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-70">{insight.category}</span>
                    <i className={`fas ${insight.impact === 'positive' ? 'fa-circle-check' : insight.impact === 'negative' ? 'fa-circle-exclamation' : 'fa-circle-info'} text-xs`}></i>
                  </div>
                  <h4 className="font-black text-sm leading-tight">{insight.title}</h4>
                  <p className="text-[10px] font-medium opacity-80 line-clamp-2">{insight.summary}</p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-white/10 rounded-2xl">
            <i className="fas fa-history text-3xl mb-3 opacity-20"></i>
            <p className="text-slate-400 text-xs italic font-medium">Analysiere deinen Fortschritt im Vergleich zum Start.</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedInsight && (
        <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl animate-scale-in relative text-slate-900">
            <button onClick={() => setSelectedInsight(null)} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all"><i className="fas fa-times"></i></button>
            <div className="flex items-center gap-3 mb-6">
              <span className="px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-500">{selectedInsight.category}</span>
              <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${selectedInsight.impact === 'positive' ? 'bg-emerald-100 text-emerald-600' : selectedInsight.impact === 'negative' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                {selectedInsight.impact}
              </span>
            </div>
            <h3 className="text-2xl font-black mb-4 uppercase tracking-tight">{selectedInsight.title}</h3>
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-6">
              <p className="text-slate-600 font-medium leading-relaxed italic">"{selectedInsight.summary}"</p>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedInsight.detail}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-3xl shadow-md border border-slate-100">
          <h3 className="font-black text-base mb-4 text-slate-900 flex items-center justify-between uppercase tracking-tight">
            <span>{t.weightHistory}</span>
            <span className="text-slate-400 font-bold text-[9px] bg-slate-50 px-2 py-0.5 rounded-md uppercase tracking-widest">{t.progressLabel}</span>
          </h3>
          <div className="h-48">
            {weightData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weightData}>
                  <defs>
                    <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.1}/><stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 9, fill: '#94a3b8', fontWeight: 600}} />
                  <YAxis domain={['auto', 'auto']} axisLine={false} tickLine={false} hide />
                  <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                  <Area type="monotone" dataKey="weight" stroke="#f97316" strokeWidth={2.5} fillOpacity={1} fill="url(#colorWeight)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="flex items-center justify-center h-full text-slate-300 font-black uppercase tracking-widest text-[10px]">{t.noData}</div>}
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-md border border-slate-100">
          <h3 className="font-black text-base mb-4 text-slate-900 uppercase tracking-tight">{t.targets}</h3>
          {analysis ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-slate-200 flex items-center justify-center text-slate-500 text-[10px]"><i className="fas fa-calculator"></i></div>
                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-wide">{t.energy}</p>
                  </div>
                  <p className="font-black text-lg text-slate-900 mt-1">{analysis.targets.maintenanceCalories} <span className="text-[9px] text-slate-400">kcal</span></p>
                </div>
                <div className="p-3 bg-orange-50 rounded-2xl border border-orange-100">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-orange-500 flex items-center justify-center text-white text-[10px]"><i className="fas fa-bullseye"></i></div>
                    <p className="text-[9px] text-orange-700 font-black uppercase tracking-wide">{t.recommended}</p>
                  </div>
                  <p className="font-black text-lg text-orange-600 mt-1">{(analysis.targets.maintenanceCalories || 0) + (profile.calorieAdjustment || 0)} <span className="text-[9px] text-orange-400">kcal</span></p>
                </div>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-blue-50 rounded-2xl border border-blue-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center text-white text-base shadow-sm"><i className="fas fa-glass-water"></i></div>
                  <div>
                    <p className="text-[9px] text-blue-700 font-bold uppercase tracking-wide leading-none">{t.hydration}</p>
                    <p className="font-black text-lg text-slate-900 leading-none mt-1">{analysis.targets.water} <span className="text-[9px] font-bold text-slate-500 uppercase">{t.liter}</span></p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                 <div className="text-center p-2.5 bg-slate-50 rounded-2xl border border-slate-100"><p className="text-[8px] text-slate-500 font-black uppercase mb-0.5 tracking-widest">{t.protein}</p><p className="font-black text-sm text-slate-900">{analysis.targets.protein}g</p></div>
                 <div className="text-center p-2.5 bg-slate-50 rounded-2xl border border-slate-100"><p className="text-[8px] text-slate-500 font-black uppercase mb-0.5 tracking-widest">{t.carbs}</p><p className="font-black text-sm text-slate-900">{analysis.targets.carbs}g</p></div>
                 <div className="text-center p-2.5 bg-slate-50 rounded-2xl border border-slate-100"><p className="text-[8px] text-slate-500 font-black uppercase mb-0.5 tracking-widest">{t.fats}</p><p className="font-black text-sm text-slate-900">{analysis.targets.fats}g</p></div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-slate-50 rounded-2xl">
              <i className="fas fa-chart-pie text-3xl mb-3 opacity-10"></i>
              <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest">Warte auf Analyse...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
