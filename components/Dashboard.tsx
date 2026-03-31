
// Add missing React import
import React, { useState, useMemo } from 'react';
import { AIAnalysis, UserProfile, Language, FitnessGoal, HealthData, ProgressInsight, WorkoutProgram } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, AreaChart, Area, ReferenceLine } from 'recharts';

interface DashboardProps {
  analysis: AIAnalysis | null;
  progressAnalysis: ProgressInsight[] | null;
  profile: UserProfile;
  healthData: HealthData | null;
  workoutPlan: WorkoutProgram | null;
  language: Language;
  onRefresh: () => void;
  onAnalyzeProgress: () => void;
  onUpdateProfile: (updated: UserProfile) => void;
  onResetSync?: () => void;
  isAnalyzing: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ analysis, progressAnalysis, profile, healthData, workoutPlan, language, onRefresh, onAnalyzeProgress, onUpdateProfile, onResetSync, isAnalyzing }) => {
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
      {profile.mockMode && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-3 flex items-center gap-3">
          <i className="fas fa-flask text-amber-500 text-sm"></i>
          <span className="text-amber-400 text-[10px] font-black uppercase tracking-widest">
            {language === 'de' ? 'Demo-Modus — Simulierte Daten' : 'Demo Mode — Simulated Data'}
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-[#1a1f26] p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl border border-white/5 text-white">
          <div className="flex items-center gap-4 mb-6 sm:mb-8">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[1.25rem] flex items-center justify-center text-white shadow-xl overflow-hidden border border-white/10 shrink-0">
              {profile.profilePicture ? (
                <img src={profile.profilePicture} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl sm:text-2xl font-black italic">{profile.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-lg sm:text-xl tracking-tight truncate">{profile.name}</h3>
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

        <div className="lg:col-span-2 bg-[#1a1f26] p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl text-white relative overflow-hidden border border-white/5">
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none transition-transform hover:scale-110 duration-1000"><i className="fas fa-bolt-lightning text-9xl"></i></div>
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 sm:gap-0 mb-6 sm:mb-8 relative z-10">
            <div>
              <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">{language === 'de' ? 'Intelligenz' : 'Intelligence'}</p>
              <h3 className="text-2xl sm:text-3xl font-black tracking-tighter flex items-center gap-3">
                {t.cockpit}
              </h3>
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {onResetSync && (
                <button
                  onClick={onResetSync}
                  className="px-4 sm:px-6 py-2.5 sm:py-3 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl flex items-center gap-2"
                >
                  <i className="fas fa-unlink"></i> Reset
                </button>
              )}
              <button
                onClick={onRefresh}
                disabled={isAnalyzing}
                className={`px-6 sm:px-8 py-3 sm:py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isAnalyzing ? 'bg-slate-800 text-slate-500' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-600/20'}`}
              >
                {isAnalyzing ? t.analyzing : t.refresh}
              </button>
            </div>
          </div>
          
          {analysis ? (
            <div className="space-y-6 relative z-10">
              <div className="p-6 bg-white/5 rounded-[1.5rem] border border-white/5 italic">
                <p className="text-slate-300 leading-relaxed text-base sm:text-lg font-medium">"{analysis.summary}"</p>
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
        <div className="bg-[#1a1f26] p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl border border-white/5">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-6 ml-1">{t.deficitLabel}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[0, -250, -500, -750].map(val => (
              <button 
                key={val} 
                onClick={() => handleDeficitChange(val)}
                className={`px-4 py-3 sm:px-6 sm:py-5 rounded-xl sm:rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all border ${currentDeficit === val ? 'bg-orange-600 border-orange-500 text-white shadow-xl shadow-orange-600/20' : 'bg-slate-800/50 border-white/5 text-slate-400 hover:text-white hover:bg-slate-800'}`}
              >
                {val === 0 ? t.deficitMaintenance : val === -250 ? t.deficitMild : val === -500 ? t.deficitStandard : t.deficitAggressive}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-[#1a1f26] p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl text-white relative overflow-hidden border border-white/5">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none transition-transform hover:-rotate-12 duration-1000"><i className="fas fa-chart-line text-9xl"></i></div>
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 sm:gap-0 mb-6 sm:mb-8 relative z-10">
          <div>
            <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">{language === 'de' ? 'Performance' : 'Performance'}</p>
            <h3 className="text-2xl sm:text-3xl font-black tracking-tighter flex items-center gap-3">
              {t.progressCockpit}
            </h3>
          </div>
          <button
            onClick={onAnalyzeProgress}
            disabled={isAnalyzing}
            className={`px-6 sm:px-8 py-3 sm:py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isAnalyzing ? 'bg-slate-800 text-slate-500' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-600/20'}`}
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
        <div className="fixed inset-0 z-[200] bg-[#0f172a]/80 backdrop-blur-xl flex items-end sm:items-center justify-center p-0 sm:p-6 animate-fade-in transition-all">
          <div className="bg-[#1a1f26] rounded-t-[2rem] sm:rounded-[3rem] p-6 sm:p-10 max-w-xl w-full max-h-[85vh] overflow-y-auto shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10 animate-scale-in relative text-white">
            <button
              onClick={() => setSelectedInsight(null)}
              className="absolute top-4 sm:top-8 right-4 sm:right-8 w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all border border-white/5"
            >
              <i className="fas fa-times text-lg sm:text-xl"></i>
            </button>
            <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8 mt-1">
              <span className="px-3 sm:px-4 py-1.5 bg-indigo-600/20 rounded-xl text-[10px] font-black uppercase tracking-widest text-indigo-400 border border-indigo-500/20">{selectedInsight.category}</span>
              <span className={`px-3 sm:px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${selectedInsight.impact === 'positive' ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/20' : selectedInsight.impact === 'negative' ? 'bg-amber-600/20 text-amber-400 border-amber-500/20' : 'bg-blue-600/20 text-blue-400 border-blue-500/20'}`}>
                {selectedInsight.impact}
              </span>
            </div>
            <h3 className="text-2xl sm:text-4xl font-black mb-4 sm:mb-6 tracking-tighter uppercase">{selectedInsight.title}</h3>
            <div className="p-5 sm:p-8 bg-slate-800/50 rounded-[1.5rem] sm:rounded-[2rem] border border-white/5 mb-6 sm:mb-8 italic">
              <p className="text-slate-300 font-bold leading-relaxed text-base sm:text-lg">"{selectedInsight.summary}"</p>
            </div>
            <p className="text-slate-400 font-medium leading-[1.8] text-sm whitespace-pre-wrap">{selectedInsight.detail}</p>
          </div>
        </div>
      )}

      {/* ── Progress Projection Tile ── */}
      {analysis && (
        <ProgressProjectionTile
          profile={profile}
          analysis={analysis}
          workoutPlan={workoutPlan}
          healthData={healthData}
          language={language}
        />
      )}

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-[#1a1f26] p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl border border-white/5">
          <h3 className="font-black text-lg sm:text-xl mb-6 sm:mb-8 text-white uppercase tracking-tighter">{t.targets}</h3>
          {analysis ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 bg-slate-800/50 rounded-[1.5rem] border border-white/5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-700 flex items-center justify-center text-slate-400 text-xs"><i className="fas fa-calculator"></i></div>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{t.energy}</p>
                  </div>
                  <p className="font-black text-xl sm:text-2xl text-white">{analysis.targets.maintenanceCalories} <span className="text-[10px] text-slate-500 uppercase tracking-widest">kcal</span></p>
                </div>
                <div className="p-5 bg-indigo-600/10 rounded-[1.5rem] border border-indigo-500/20">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-xs"><i className="fas fa-bullseye"></i></div>
                    <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">{t.recommended}</p>
                  </div>
                  <p className="font-black text-xl sm:text-2xl text-indigo-400">{(analysis.targets.calories || 0) + (profile.calorieAdjustment || 0)} <span className="text-[10px] text-indigo-500/60 uppercase tracking-widest">kcal</span></p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 sm:p-6 bg-blue-600/10 rounded-[2rem] border border-blue-500/20">
                <div className="flex items-center gap-3 sm:gap-5">
                  <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-lg sm:text-2xl shadow-lg shadow-blue-600/20"><i className="fas fa-glass-water"></i></div>
                  <div>
                    <p className="text-[10px] text-blue-400 font-black uppercase tracking-[0.2em] mb-1">{t.hydration}</p>
                    <p className="font-black text-2xl sm:text-3xl text-white leading-none">{analysis.targets.water} <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{t.liter}</span></p>
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

// ── Progress Projection Component ──
interface ProjectionProps {
  profile: UserProfile;
  analysis: AIAnalysis;
  workoutPlan: WorkoutProgram | null;
  healthData: HealthData | null;
  language: Language;
}

const ProgressProjectionTile: React.FC<ProjectionProps> = ({ profile, analysis, workoutPlan, healthData, language }) => {
  const projection = useMemo(() => {
    const currentWeight = profile.weight;
    const height = profile.height;
    const age = profile.age;
    const gender = profile.gender;
    const bodyFat = profile.bodyFat || (healthData?.metrics || []).filter(m => m.bodyFat).pop()?.bodyFat || (gender === 'male' ? 20 : 28);
    const deficit = profile.calorieAdjustment || 0;
    const sessionsPerWeek = workoutPlan?.sessions?.length || 3;
    const proteinTarget = analysis.targets.protein;

    // Basal Metabolic Rate (Mifflin-St Jeor)
    const bmr = gender === 'male'
      ? 10 * currentWeight + 6.25 * height - 5 * age + 5
      : 10 * currentWeight + 6.25 * height - 5 * age - 161;

    // Calories burned per workout session (moderate resistance training)
    const caloriesPerSession = Math.round(currentWeight * 5); // ~5 kcal/kg/session
    const weeklyWorkoutBurn = sessionsPerWeek * caloriesPerSession;

    // Total weekly deficit
    const dailyDeficit = Math.abs(deficit);
    const weeklyDeficitFromDiet = dailyDeficit * 7;
    const totalWeeklyDeficit = weeklyDeficitFromDiet + weeklyWorkoutBurn;

    // 1 kg body fat = ~7700 kcal
    const KG_PER_KCAL = 1 / 7700;

    // With adequate protein (>1.6g/kg) + resistance training:
    // ~80% of weight loss comes from fat, ~20% water/glycogen (minimal muscle loss)
    const fatLossRatio = proteinTarget >= currentWeight * 1.4 ? 0.85 : 0.70;

    // Build 12-week projection
    const weeks = 12;
    type DataPoint = { week: number; label: string; weight: number; bodyFat: number; muscleMass: number; fatMass: number; actualWeight?: number; actualBodyFat?: number };
    const data: DataPoint[] = [];

    let w = currentWeight;
    let fatMass = currentWeight * (bodyFat / 100);
    let leanMass = currentWeight - fatMass;

    for (let i = 0; i <= weeks; i++) {
      const bf = w > 0 ? (fatMass / w) * 100 : bodyFat;
      data.push({
        week: i,
        label: i === 0 ? (language === 'de' ? 'Jetzt' : 'Now') : `W${i}`,
        weight: Math.round(w * 10) / 10,
        bodyFat: Math.round(bf * 10) / 10,
        muscleMass: Math.round(leanMass * 10) / 10,
        fatMass: Math.round(fatMass * 10) / 10,
      });

      if (i < weeks) {
        const weeklyLoss = totalWeeklyDeficit * KG_PER_KCAL;
        const fatLost = weeklyLoss * fatLossRatio;
        const otherLoss = weeklyLoss * (1 - fatLossRatio);

        // With resistance training, slight muscle gain possible (~0.05-0.1 kg/week for beginners in deficit)
        const muscleGainRate = sessionsPerWeek >= 3 && proteinTarget >= currentWeight * 1.4 ? 0.05 : 0;

        fatMass = Math.max(fatMass - fatLost, currentWeight * 0.04); // Min 4% body fat
        leanMass = leanMass - otherLoss + muscleGainRate;
        w = fatMass + leanMass;
      }
    }

    // ── Overlay real measurements ──
    // Collect real weight+bodyFat data from healthData.metrics and profile.weightHistory
    const realMeasurements: { date: string; weight?: number; bodyFat?: number }[] = [];

    // From health metrics (scale data — most complete with bodyFat)
    if (healthData?.metrics) {
      for (const m of healthData.metrics) {
        if (m.weight || m.bodyFat) {
          realMeasurements.push({ date: m.date, weight: m.weight, bodyFat: m.bodyFat });
        }
      }
    }
    // From weightHistory (simple weight entries)
    if (profile.weightHistory) {
      for (const e of profile.weightHistory) {
        // Only add if not already present from metrics for this date
        if (!realMeasurements.find(r => r.date === e.date)) {
          realMeasurements.push({ date: e.date, weight: e.weight });
        }
      }
    }

    // Sort by date ascending
    realMeasurements.sort((a, b) => a.date.localeCompare(b.date));

    // Determine start date (projection start = today or first measurement date)
    const now = new Date();
    // Find the earliest measurement to determine the projection start reference
    const startDate = realMeasurements.length > 0
      ? new Date(Math.min(now.getTime(), new Date(realMeasurements[0].date).getTime()))
      : now;

    // Map real measurements to week index and overlay onto chart data
    let hasRealData = false;
    // Always set week 0 actual = current profile weight (starting point)
    data[0].actualWeight = currentWeight;
    data[0].actualBodyFat = bodyFat;

    for (const m of realMeasurements) {
      const mDate = new Date(m.date);
      const daysDiff = (mDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      const weekIdx = Math.round(daysDiff / 7);

      if (weekIdx >= 0 && weekIdx <= weeks) {
        // Use the latest measurement for each week
        if (m.weight) {
          data[weekIdx].actualWeight = Math.round(m.weight * 10) / 10;
          hasRealData = true;
        }
        if (m.bodyFat) {
          data[weekIdx].actualBodyFat = Math.round(m.bodyFat * 10) / 10;
          hasRealData = true;
        }
      }
    }

    // Milestones
    const w4 = data[4];
    const w8 = data[8];
    const w12 = data[12];
    const totalLoss = Math.round((currentWeight - w12.weight) * 10) / 10;
    const totalFatLoss = Math.round((data[0].fatMass - w12.fatMass) * 10) / 10;
    const bfDrop = Math.round((data[0].bodyFat - w12.bodyFat) * 10) / 10;

    // Calculate actual progress vs projection (for the latest real data point)
    let actualProgress: { weekLabel: string; weightDiff: number; onTrack: boolean } | null = null;
    if (hasRealData) {
      // Find the latest week with actual data
      for (let i = weeks; i >= 1; i--) {
        if (data[i].actualWeight) {
          const projectedLoss = currentWeight - data[i].weight;
          const actualLoss = currentWeight - data[i].actualWeight!;
          actualProgress = {
            weekLabel: data[i].label,
            weightDiff: Math.round((actualLoss - projectedLoss) * 10) / 10,
            onTrack: actualLoss >= projectedLoss * 0.8, // within 80% of target = on track
          };
          break;
        }
      }
    }

    return { data, currentWeight, bodyFat, totalLoss, totalFatLoss, bfDrop, w4, w8, w12, sessionsPerWeek, dailyDeficit, weeklyWorkoutBurn, hasRealData, actualProgress };
  }, [profile, analysis, workoutPlan, healthData, language]);

  const t = language === 'de' ? {
    title: 'Deine Prognose',
    subtitle: 'Projektion vs. reale Messwerte',
    weeks: 'Wochen',
    weightLoss: 'Gewichtsverlust',
    fatLoss: 'Fettverlust',
    bfDrop: 'KFA-Reduktion',
    in12w: 'in 12 Wochen',
    weight: 'Gewicht (Ziel)',
    bodyFat: 'KFA (Ziel)',
    actualWeight: 'Gewicht (Real)',
    actualBf: 'KFA (Real)',
    muscle: 'Muskelmasse',
    basis: 'Basis der Berechnung',
    deficitDay: 'Defizit/Tag',
    workoutBurn: 'Training/Woche',
    sessions: 'Sessions/Woche',
    disclaimer: 'Annäherung basierend auf Kaloriendefizit, Trainingsfrequenz und Proteinzufuhr. Individuelle Ergebnisse können abweichen.',
    now: 'Jetzt',
    target4: '4 Wo.',
    target8: '8 Wo.',
    target12: '12 Wo.',
    onTrack: 'Im Plan',
    ahead: 'Voraus',
    behind: 'Rückstand',
    vsProjection: 'vs. Prognose',
    noRealData: 'Noch keine Messdaten — synchronisiere deine Waage um den Fortschritt zu sehen',
  } : {
    title: 'Your Projection',
    subtitle: 'Projection vs. real measurements',
    weeks: 'Weeks',
    weightLoss: 'Weight Loss',
    fatLoss: 'Fat Loss',
    bfDrop: 'BF% Drop',
    in12w: 'in 12 weeks',
    weight: 'Weight (Target)',
    bodyFat: 'Body Fat (Target)',
    actualWeight: 'Weight (Actual)',
    actualBf: 'BF% (Actual)',
    muscle: 'Muscle Mass',
    basis: 'Calculation Basis',
    deficitDay: 'Deficit/Day',
    workoutBurn: 'Training/Week',
    sessions: 'Sessions/Week',
    disclaimer: 'Approximation based on calorie deficit, training frequency, and protein intake. Individual results may vary.',
    now: 'Now',
    target4: '4 wk',
    target8: '8 wk',
    target12: '12 wk',
    onTrack: 'On Track',
    ahead: 'Ahead',
    behind: 'Behind',
    vsProjection: 'vs. projection',
    noRealData: 'No measurement data yet — sync your scale to see progress',
  };

  const { data, totalLoss, totalFatLoss, bfDrop, w4, w8, w12, dailyDeficit, weeklyWorkoutBurn, sessionsPerWeek, hasRealData, actualProgress } = projection;

  if (totalLoss <= 0 && bfDrop <= 0) return null; // No projection needed for maintenance/surplus

  return (
    <div className="bg-[#1a1f26] p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl text-white relative overflow-hidden border border-white/5">
      <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none"><i className="fas fa-rocket text-9xl"></i></div>

      {/* Header */}
      <div className="mb-6 sm:mb-8 relative z-10">
        <p className="text-cyan-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">{language === 'de' ? 'Motivation' : 'Motivation'}</p>
        <h3 className="text-2xl sm:text-3xl font-black tracking-tighter">{t.title}</h3>
        <p className="text-slate-500 text-xs font-bold mt-1">{t.subtitle}</p>
      </div>

      {/* Key Metrics — 3 big numbers */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div className="p-4 sm:p-5 bg-gradient-to-br from-cyan-600/20 to-cyan-600/5 rounded-[1.5rem] border border-cyan-500/20 text-center">
          <p className="text-[9px] text-cyan-400 font-black uppercase tracking-widest mb-2">{t.weightLoss}</p>
          <p className="font-black text-2xl sm:text-3xl text-cyan-400">-{totalLoss}</p>
          <p className="text-[10px] text-slate-500 font-bold mt-1">kg {t.in12w}</p>
        </div>
        <div className="p-4 sm:p-5 bg-gradient-to-br from-orange-600/20 to-orange-600/5 rounded-[1.5rem] border border-orange-500/20 text-center">
          <p className="text-[9px] text-orange-400 font-black uppercase tracking-widest mb-2">{t.fatLoss}</p>
          <p className="font-black text-2xl sm:text-3xl text-orange-400">-{totalFatLoss}</p>
          <p className="text-[10px] text-slate-500 font-bold mt-1">kg {t.in12w}</p>
        </div>
        <div className="p-4 sm:p-5 bg-gradient-to-br from-emerald-600/20 to-emerald-600/5 rounded-[1.5rem] border border-emerald-500/20 text-center">
          <p className="text-[9px] text-emerald-400 font-black uppercase tracking-widest mb-2">{t.bfDrop}</p>
          <p className="font-black text-2xl sm:text-3xl text-emerald-400">-{bfDrop}%</p>
          <p className="text-[10px] text-slate-500 font-bold mt-1">{t.in12w}</p>
        </div>
      </div>

      {/* Progress status badge */}
      {actualProgress && (
        <div className={`mb-4 px-4 py-3 rounded-xl border flex items-center gap-3 ${
          actualProgress.onTrack
            ? actualProgress.weightDiff >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-cyan-500/10 border-cyan-500/20'
            : 'bg-amber-500/10 border-amber-500/20'
        }`}>
          <i className={`fas ${actualProgress.onTrack ? 'fa-check-circle' : 'fa-exclamation-triangle'} text-lg ${
            actualProgress.onTrack
              ? actualProgress.weightDiff >= 0 ? 'text-emerald-400' : 'text-cyan-400'
              : 'text-amber-400'
          }`}></i>
          <div>
            <p className={`text-xs font-black ${
              actualProgress.onTrack
                ? actualProgress.weightDiff >= 0 ? 'text-emerald-400' : 'text-cyan-400'
                : 'text-amber-400'
            }`}>
              {actualProgress.onTrack
                ? actualProgress.weightDiff >= 0
                  ? `${t.ahead} — ${Math.abs(actualProgress.weightDiff)} kg ${language === 'de' ? 'mehr als erwartet' : 'more than expected'}`
                  : `${t.onTrack} ✓`
                : `${t.behind} — ${Math.abs(actualProgress.weightDiff)} kg ${t.vsProjection}`
              }
            </p>
            <p className="text-[9px] text-slate-500 font-bold">{language === 'de' ? `Stand ${actualProgress.weekLabel}` : `As of ${actualProgress.weekLabel}`}</p>
          </div>
        </div>
      )}

      {/* Chart legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3 px-1">
        <span className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400">
          <span className="w-4 h-0.5 bg-cyan-500 rounded inline-block"></span> {t.weight}
        </span>
        <span className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400">
          <span className="w-4 h-0.5 bg-orange-500 rounded inline-block" style={{ borderTop: '1px dashed #f97316' }}></span> {t.bodyFat}
        </span>
        {hasRealData && (
          <>
            <span className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block"></span> {t.actualWeight}
            </span>
            <span className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400">
              <span className="w-1.5 h-1.5 bg-rose-400 rounded-full inline-block"></span> {t.actualBf}
            </span>
          </>
        )}
      </div>

      {/* Chart: Weight + Body Fat projection with real data overlay */}
      <div className="h-56 sm:h-64 mb-6 sm:mb-8">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="projWeight" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="projFat" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 800 }} dy={10} />
            <YAxis yAxisId="weight" domain={['auto', 'auto']} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748b', fontWeight: 700 }} />
            <YAxis yAxisId="bf" orientation="right" domain={['auto', 'auto']} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748b', fontWeight: 700 }} unit="%" />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)' }}
              itemStyle={{ fontWeight: 'bold' }}
              formatter={(value: number | undefined, name: string) => {
                if (value === undefined || value === null) return [null, null];
                if (name === 'weight') return [`${value} kg`, t.weight];
                if (name === 'bodyFat') return [`${value}%`, t.bodyFat];
                if (name === 'actualWeight') return [`${value} kg`, t.actualWeight];
                if (name === 'actualBodyFat') return [`${value}%`, t.actualBf];
                return [value, name];
              }}
            />
            {/* Projected lines (area fills — subtle) */}
            <Area yAxisId="weight" type="monotone" dataKey="weight" stroke="#06b6d4" strokeWidth={2} strokeDasharray={hasRealData ? "6 3" : "0"} fillOpacity={1} fill="url(#projWeight)" dot={false} />
            <Area yAxisId="bf" type="monotone" dataKey="bodyFat" stroke="#f97316" strokeWidth={1.5} strokeDasharray="5 5" fillOpacity={1} fill="url(#projFat)" dot={false} />
            {/* Real measurement overlay lines (solid, bold, with dots) */}
            {hasRealData && (
              <>
                <Area yAxisId="weight" type="monotone" dataKey="actualWeight" stroke="#34d399" strokeWidth={3} fillOpacity={0} fill="none" dot={{ r: 4, fill: '#34d399', stroke: '#1a1f26', strokeWidth: 2 }} activeDot={{ r: 6, fill: '#34d399' }} connectNulls />
                <Area yAxisId="bf" type="monotone" dataKey="actualBodyFat" stroke="#fb7185" strokeWidth={2} fillOpacity={0} fill="none" dot={{ r: 3, fill: '#fb7185', stroke: '#1a1f26', strokeWidth: 2 }} activeDot={{ r: 5, fill: '#fb7185' }} connectNulls />
              </>
            )}
            <ReferenceLine yAxisId="weight" x="W4" stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
            <ReferenceLine yAxisId="weight" x="W8" stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* No data hint */}
      {!hasRealData && (
        <div className="mb-4 px-4 py-3 bg-white/5 rounded-xl border border-white/5 flex items-center gap-3">
          <i className="fas fa-weight text-slate-600"></i>
          <p className="text-[10px] text-slate-500 font-bold">{t.noRealData}</p>
        </div>
      )}

      {/* Milestone cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">
        {[
          { label: t.now, w: data[0].weight, bf: data[0].bodyFat, aw: data[0].actualWeight, abf: data[0].actualBodyFat },
          { label: t.target4, w: w4.weight, bf: w4.bodyFat, aw: w4.actualWeight, abf: w4.actualBodyFat },
          { label: t.target8, w: w8.weight, bf: w8.bodyFat, aw: w8.actualWeight, abf: w8.actualBodyFat },
          { label: t.target12, w: w12.weight, bf: w12.bodyFat, aw: w12.actualWeight, abf: w12.actualBodyFat },
        ].map((m, i) => (
          <div key={i} className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border text-center ${i === 3 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white/5 border-white/5'}`}>
            <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${i === 3 ? 'text-emerald-400' : 'text-slate-500'}`}>{m.label}</p>
            <p className={`font-black text-sm sm:text-lg ${i === 3 ? 'text-emerald-400' : 'text-white'}`}>{m.w}<span className="text-[8px] text-slate-500 ml-0.5">kg</span></p>
            {m.aw && i > 0 && (
              <p className={`text-[9px] font-black ${m.aw <= m.w ? 'text-emerald-400' : 'text-amber-400'}`}>
                {m.aw}<span className="text-[7px] ml-0.5">kg real</span>
              </p>
            )}
            <p className="text-[9px] text-orange-400 font-bold">{m.bf}%</p>
            {m.abf && i > 0 && (
              <p className={`text-[8px] font-bold ${m.abf <= m.bf ? 'text-emerald-400' : 'text-amber-400'}`}>
                {m.abf}% real
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Calculation basis — small footer */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 px-4 py-3 bg-white/5 rounded-xl border border-white/5 text-[9px] text-slate-500 font-bold">
        <span className="flex items-center gap-1.5"><i className="fas fa-fire text-red-400"></i> {t.deficitDay}: {dailyDeficit} kcal</span>
        <span className="flex items-center gap-1.5"><i className="fas fa-dumbbell text-indigo-400"></i> {t.workoutBurn}: ~{weeklyWorkoutBurn} kcal</span>
        <span className="flex items-center gap-1.5"><i className="fas fa-calendar text-cyan-400"></i> {t.sessions}: {sessionsPerWeek}×</span>
      </div>
      <p className="text-[8px] text-slate-600 mt-3 px-1 leading-relaxed">{t.disclaimer}</p>
    </div>
  );
};

export default Dashboard;
