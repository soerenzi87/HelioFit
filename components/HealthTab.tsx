
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { UserProfile, HealthData, Language, HealthMetricEntry, HealthInsight } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line, ComposedChart } from 'recharts';
import { analyzeHealthTrends } from '../services/geminiService';
import { processAppleHealthFile } from '../services/appleHealthService';

interface HealthTabProps {
  profile: UserProfile;
  healthData: HealthData | null;
  insights: HealthInsight[];
  onUpdateInsights: (insights: HealthInsight[]) => void;
  onResetSync: () => void;
  onUploadData: (data: HealthData, fileName: string) => void;
  isLoading: boolean;
  language: Language;
}

type MetricCategory = 'steps' | 'vitals' | 'weight' | 'regeneration';

const HealthTab: React.FC<HealthTabProps> = ({ profile, healthData, insights, onUpdateInsights, onResetSync, onUploadData, isLoading, language }) => {
  const [selectedInsight, setSelectedInsight] = useState<HealthInsight | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isParsingApple, setIsParsingApple] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<MetricCategory | null>(null);
  const [timeRange, setTimeRange] = useState<number>(30); // Tage
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = language === 'de' ? {
    noSync: 'Gesundheitsdaten importieren',
    noSyncSub: 'Lade deinen Apple Health Export hoch oder verbinde Google Health.',
    syncBtn: 'Google Health Sync',
    withingsBtn: 'Withings Sync',
    appleBtn: 'Apple Health Upload',
    parsing: 'Verarbeite Apple Health Datei...',
    syncing: 'Synchronisiere mit Google Health...',
    checkup: 'AI Health Checkup',
    analyzing: 'Helio scannt Vitaldaten...',
    update: 'Analyse aktualisieren',
    activity: 'Aktivität',
    steps: 'Schritte & Energie',
    vitals: 'Vitalwerte',
    heartRate: 'Puls (BPM)',
    hrv: 'HRV (ms)',
    oxygen: 'SpO2 %',
    respiration: 'Atmung',
    glucose: 'Blutzucker (mg/dL)',
    temp: 'Körpertemp (°C)',
    weightTrend: 'Körperwerte',
    weight: 'Gewicht (kg)',
    bodyFat: 'Körperfett %',
    leanMass: 'Magermasse (kg)',
    regeneration: 'Regeneration',
    sleep: 'Schlafdauer (h)',
    syncStatus: 'Datenquellen & Sync',
    lastUpdate: 'Zuletzt aktualisiert',
    uploadedFiles: 'Hochgeladene Apple-Dateien',
    googleStatus: 'Google Health Sync',
    withingsStatus: 'Withings API Sync',
    healthBridgeStatus: 'HealthBridge API Sync',
    healthBridgeBtn: 'HealthBridge Sync',
    resetSync: 'Verbindung trennen',
    googleActive: 'Verbunden & Live',
    googleInactive: 'Nicht verbunden',
    reUpload: 'Datei aktualisieren',
    detailTitle: 'Detail-Analyse',
    days7: '7 Tage',
    days30: '30 Tage',
    daysAll: 'Alle',
    history: 'Historie (Logs)',
    date: 'Datum',
    value: 'Wert',
    back: 'Zurück',
    insightDetails: 'Insight Details',
    showData: 'Daten ansehen',
    swipeHint: 'Wischen für mehr'
  } : {
    noSync: 'Import Health Data',
    noSyncSub: 'Upload Apple Health export or connect Google Health.',
    syncBtn: 'Google Health Sync',
    withingsBtn: 'Withings Sync',
    appleBtn: 'Apple Health Upload',
    parsing: 'Processing Apple Health File...',
    syncing: 'Syncing with Google Health...',
    checkup: 'AI Health Checkup',
    analyzing: 'Helio scanning vitals...',
    update: 'Update Analysis',
    activity: 'Activity',
    steps: 'Steps & Energy',
    vitals: 'Vitals',
    heartRate: 'Pulse (BPM)',
    hrv: 'HRV (ms)',
    oxygen: 'SpO2 %',
    respiration: 'Respiration',
    glucose: 'Blood Glucose (mg/dL)',
    temp: 'Body Temp (°C)',
    weightTrend: 'Body Composition',
    weight: 'Weight (kg)',
    bodyFat: 'Body Fat %',
    leanMass: 'Lean Mass (kg)',
    regeneration: 'Regeneration',
    sleep: 'Sleep (h)',
    syncStatus: 'Data Sources',
    lastUpdate: 'Last updated',
    uploadedFiles: 'Uploaded Apple Files',
    googleStatus: 'Google Health Sync',
    withingsStatus: 'Withings API Sync',
    healthBridgeStatus: 'HealthBridge API Sync',
    healthBridgeBtn: 'HealthBridge Sync',
    resetSync: 'Disconnect Connection',
    googleActive: 'Connected & Live',
    googleInactive: 'Not connected',
    reUpload: 'Update file',
    detailTitle: 'Deep Dive Analysis',
    days7: '7 Days',
    days30: '30 Days',
    daysAll: 'All',
    history: 'History Logs',
    date: 'Date',
    value: 'Value',
    back: 'Back',
    insightDetails: 'Insight Details',
    showData: 'View Data',
    swipeHint: 'Swipe for more'
  };

  const formattedMetrics = useMemo(() => {
    return healthData?.metrics.map(m => ({
      ...m,
      dateStr: new Date(m.date).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { day: '2-digit', month: '2-digit' }),
      fullDateStr: new Date(m.date).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })
    })) || [];
  }, [healthData, language]);

  const filteredMetrics = useMemo(() => {
    if (timeRange === 0) return formattedMetrics;
    return formattedMetrics.slice(-timeRange);
  }, [formattedMetrics, timeRange]);

  const handleAnalyze = async () => {
    if (!healthData) return;
    setIsAnalyzing(true);
    try {
      const data = await analyzeHealthTrends(healthData, profile, language);
      onUpdateInsights(data);
    } catch (e) { 
      console.error(e);
    } finally { 
      setIsAnalyzing(false); 
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsingApple(true);
    try {
      const data = await processAppleHealthFile(file);
      onUploadData(data, file.name);
    } catch (err) {
      console.error(err);
      alert("Fehler beim Verarbeiten.");
    } finally {
      setIsParsingApple(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getInsightStyle = (insight: HealthInsight) => {
    const categories = {
      steps: { bg: 'bg-orange-50', border: 'border-orange-100', text: 'text-orange-600', icon: 'fa-shoe-prints' },
      vitals: { bg: 'bg-red-50', border: 'border-red-100', text: 'text-red-600', icon: 'fa-heart-pulse' },
      weight: { bg: 'bg-slate-100', border: 'border-slate-200', text: 'text-slate-800', icon: 'fa-weight-scale' },
      regeneration: { bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-600', icon: 'fa-bed' }
    };
    
    const colors = categories[insight.category as keyof typeof categories] || categories.vitals;

    const impacts = {
      positive: { icon: 'fa-circle-check', color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-200' },
      neutral: { icon: 'fa-circle-info', color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-200' },
      negative: { icon: 'fa-circle-exclamation', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-200' }
    };
    
    const impactInfo = impacts[insight.impact as keyof typeof impacts] || impacts.neutral;

    return { ...colors, impactInfo };
  };

  const DetailView = () => {
    if (!selectedCategory) return null;

    const catMap = {
      steps: { title: t.steps, icon: 'fa-shoe-prints', color: '#f97316', bg: 'bg-orange-50', text: 'text-orange-500' },
      vitals: { title: t.vitals, icon: 'fa-heart-pulse', color: '#ef4444', bg: 'bg-red-50', text: 'text-red-500' },
      weight: { title: t.weightTrend, icon: 'fa-weight-scale', color: '#1e293b', bg: 'bg-slate-100', text: 'text-slate-900' },
      regeneration: { title: t.regeneration, icon: 'fa-bed', color: '#6366f1', bg: 'bg-indigo-50', text: 'text-indigo-500' },
    };
    
    const catInfo = catMap[selectedCategory as keyof typeof catMap];

    return (
      <div className="fixed inset-0 z-[100] bg-slate-50/95 backdrop-blur-xl flex flex-col animate-fade-in overflow-y-auto no-scrollbar">
        <div className="max-w-5xl mx-auto w-full p-4 sm:p-8 space-y-8 pb-24">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div className="flex items-center gap-4">
              <button onClick={() => setSelectedCategory(null)} className="group flex items-center gap-3 text-slate-400 hover:text-slate-900 transition-all font-black uppercase tracking-widest text-[10px]">
                <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-all"><i className="fas fa-arrow-left"></i></div>
                {t.back}
              </button>
              <button onClick={onResetSync} className="px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all shadow-sm">
                <i className="fas fa-unlink"></i> {t.resetSync}
              </button>
            </div>
            <div className="flex gap-2 p-1 bg-white rounded-2xl shadow-sm border border-slate-100">
              {[7, 30, 0].map(val => (
                <button key={val} onClick={() => setTimeRange(val)} className={`px-5 py-2.5 rounded-xl font-black text-[9px] uppercase transition-all ${timeRange === val ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400'}`}>
                  {val === 7 ? t.days7 : val === 30 ? t.days30 : t.daysAll}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 ${catInfo.bg} ${catInfo.text} rounded-[1.25rem] flex items-center justify-center text-2xl shadow-sm border border-white`}><i className={`fas ${catInfo.icon}`}></i></div>
            <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">{catInfo.title}</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.detailTitle}</p>
            </div>
          </div>

          <div className="bg-white p-6 sm:p-10 rounded-[3rem] border border-slate-100 shadow-xl h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              {selectedCategory === 'steps' ? (
                <ComposedChart data={filteredMetrics}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="dateStr" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 'bold'}} />
                  <YAxis yAxisId="steps" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                  <YAxis yAxisId="energy" orientation="right" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#f97316'}} />
                  <Tooltip />
                  <Bar yAxisId="steps" dataKey="steps" fill="#f97316" radius={[8, 8, 0, 0]} name="Schritte" />
                  <Line yAxisId="energy" type="monotone" dataKey="activeEnergy" stroke="#f59e0b" strokeWidth={3} dot={false} name="kcal" />
                </ComposedChart>
              ) : selectedCategory === 'vitals' ? (
                <LineChart data={filteredMetrics}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="dateStr" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 'bold'}} />
                  <YAxis yAxisId="hr" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#ef4444'}} domain={['auto', 'auto']} />
                  <YAxis yAxisId="hrv" orientation="right" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#6366f1'}} domain={['auto', 'auto']} />
                  <Tooltip />
                  <Line yAxisId="hr" type="monotone" dataKey="restingHeartRate" name={t.heartRate} stroke="#ef4444" strokeWidth={4} dot={{r: 5}} />
                  <Line yAxisId="hrv" type="monotone" dataKey="hrv" name={t.hrv} stroke="#6366f1" strokeWidth={3} dot={false} strokeDasharray="5 5" />
                  <Line yAxisId="hr" type="monotone" dataKey="oxygenSaturation" name={t.oxygen} stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line yAxisId="hr" type="monotone" dataKey="respiratoryRate" name={t.respiration} stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line yAxisId="hr" type="monotone" dataKey="bloodGlucose" name={t.glucose} stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line yAxisId="hr" type="monotone" dataKey="bodyTemperature" name={t.temp} stroke="#ec4899" strokeWidth={2} dot={false} />
                </LineChart>
              ) : selectedCategory === 'weight' ? (
                <ComposedChart data={filteredMetrics.filter(m => m.weight || m.bodyFat)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="dateStr" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 'bold'}} />
                  <YAxis yAxisId="w" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#1e293b'}} domain={['auto', 'auto']} />
                  <YAxis yAxisId="bf" orientation="right" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#f59e0b'}} domain={[0, 40]} />
                  <Tooltip />
                  <Area yAxisId="w" type="monotone" dataKey="weight" name={t.weight} stroke="#1e293b" fill="#f1f5f9" strokeWidth={4} />
                  <Line yAxisId="bf" type="monotone" dataKey="bodyFat" name={t.bodyFat} stroke="#f59e0b" strokeWidth={3} dot={{r: 4}} />
                  <Line yAxisId="w" type="monotone" dataKey="leanBodyMass" name={t.leanMass} stroke="#10b981" strokeWidth={2} dot={false} />
                </ComposedChart>
              ) : (
                <BarChart data={filteredMetrics}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="dateStr" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 'bold'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                  <Tooltip />
                  <Bar dataKey="sleepHours" name={t.sleep} fill="#6366f1" radius={[8, 8, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
            <div className="p-8 border-b border-slate-50 bg-slate-50/50"><h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{t.history}</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest"><th className="px-8 py-5">{t.date}</th><th className="px-8 py-5">{t.value}</th></tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {[...filteredMetrics].reverse().map((m, idx) => {
                    let mainVal = "-";
                    if (selectedCategory === 'steps') mainVal = m.steps ? `${m.steps.toLocaleString()} Schritte / ${m.activityMinutes || 0} Min Aktiv` : '-';
                    if (selectedCategory === 'vitals') {
                      const parts = [
                        m.restingHeartRate ? `${m.restingHeartRate} BPM` : null,
                        m.hrv ? `${m.hrv} ms HRV` : null,
                        m.oxygenSaturation ? `${Math.round(m.oxygenSaturation * 100) / 100}% O2` : null,
                        m.bloodGlucose ? `${m.bloodGlucose} mg/dL` : null,
                        m.bodyTemperature ? `${m.bodyTemperature}°C` : null
                      ].filter(Boolean);
                      mainVal = parts.length > 0 ? parts.join(' / ') : '-';
                    }
                    if (selectedCategory === 'weight') mainVal = `${m.weight || '-'} kg / ${m.bodyFat || '-'} % Fett`;
                    if (selectedCategory === 'regeneration') mainVal = `${m.sleepHours || '-'} h Schlaf`;

                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-5 text-sm font-bold text-slate-900">{m.fullDateStr}</td>
                        <td className="px-8 py-5 text-sm font-black text-slate-600">{mainVal}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if ((!healthData || healthData.metrics.length === 0) && !isLoading && !isParsingApple) return (
    <div className="bg-white rounded-[2.5rem] p-8 md:p-12 text-center border border-slate-100 shadow-sm space-y-8 animate-fade-in">
      <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center text-3xl mx-auto border border-emerald-100"><i className="fas fa-file-medical"></i></div>
      <div className="max-w-md mx-auto space-y-4">
        <h2 className="text-2xl font-black text-slate-900">{t.noSync}</h2>
        <p className="text-slate-500 font-medium text-sm">{language === 'de' ? 'Bitte konfiguriere deine Datenquellen in den Einstellungen.' : 'Please configure your data sources in the settings.'}</p>
      </div>
    </div>
  );

  if (isLoading || isParsingApple) return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <div className={`w-16 h-16 border-4 ${isParsingApple ? 'border-slate-900' : 'border-emerald-500'} border-t-transparent rounded-full animate-spin mb-6`}></div>
      <p className="text-slate-500 font-black uppercase tracking-widest text-[10px] animate-pulse">
        {isParsingApple ? t.parsing : t.syncing}
      </p>
    </div>
  );

  return (
    <div className="space-y-6 pb-10 relative">
      {selectedCategory && <DetailView />}
      
      {/* Insight Modal */}
      {selectedInsight && (
        <div className="fixed inset-0 z-[150] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl animate-scale-in relative">
            <button onClick={() => setSelectedInsight(null)} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all"><i className="fas fa-times"></i></button>
            <div className={`w-14 h-14 ${getInsightStyle(selectedInsight).bg} ${getInsightStyle(selectedInsight).text} rounded-2xl flex items-center justify-center text-2xl mb-6 shadow-sm`}>
              <i className={`fas ${getInsightStyle(selectedInsight).icon}`}></i>
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-4 uppercase tracking-tight">{selectedInsight.title}</h3>
            <p className="text-slate-600 font-medium leading-relaxed mb-8">{selectedInsight.detail}</p>
            <button 
              onClick={() => { setSelectedCategory(selectedInsight?.category as MetricCategory); setSelectedInsight(null); }}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-slate-100 flex items-center justify-center gap-3"
            >
              <i className="fas fa-chart-line"></i> {t.showData}
            </button>
          </div>
        </div>
      )}

      {/* Checkup Cockpit */}
      <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-5 text-8xl pointer-events-none translate-x-4"><i className="fas fa-wand-magic-sparkles text-slate-900"></i></div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h3 className="text-xl font-black flex items-center gap-3 uppercase tracking-tight text-slate-900"><i className="fas fa-brain text-emerald-500"></i> {t.checkup}</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">KI-gestützte Vitalwert-Analyse</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onResetSync} className="px-4 py-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all shadow-md">
              <i className="fas fa-unlink"></i> {t.resetSync}
            </button>
            <button onClick={handleAnalyze} disabled={isAnalyzing} className="px-6 py-3 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-slate-100 disabled:opacity-50">
              {isAnalyzing ? <i className="fas fa-circle-notch animate-spin"></i> : <i className="fas fa-rotate"></i>} {t.update}
            </button>
          </div>
        </div>

        {isAnalyzing ? (
          <div className="flex gap-4 animate-pulse overflow-x-auto no-scrollbar pb-6 px-2">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-40 min-w-[280px] bg-slate-100 rounded-[2rem] flex-shrink-0"></div>)}
          </div>
        ) : (
          <div className="relative">
            {/* Carousel Container */}
            <div className="flex overflow-x-auto gap-4 pb-10 px-2 snap-x snap-mandatory no-scrollbar mask-fade-edges-x cursor-grab active:cursor-grabbing">
              {insights.length > 0 ? insights.map((insight, idx) => {
                const style = getInsightStyle(insight);
                return (
                  <button 
                    key={idx} 
                    onClick={() => setSelectedInsight(insight)}
                    className={`flex-shrink-0 snap-start flex flex-col gap-4 p-6 w-[280px] sm:w-[320px] lg:w-[360px] bg-white border-2 ${style.impactInfo.border} rounded-[2.5rem] transition-all hover:shadow-xl active:scale-[0.98] group relative overflow-hidden`}
                  >
                    <div className={`absolute top-0 right-0 p-4 ${style.impactInfo.bg} ${style.impactInfo.color} rounded-bl-[2rem] transition-colors group-hover:bg-opacity-20`}>
                       <i className={`fas ${style.impactInfo.icon} text-xl`}></i>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 ${style.bg} ${style.text} rounded-2xl flex items-center justify-center text-lg shadow-sm group-hover:scale-110 transition-transform`}>
                        <i className={`fas ${style.icon}`}></i>
                      </div>
                      <div className="text-left pr-10">
                        <p className={`text-base font-black uppercase tracking-tight leading-tight ${style.text} line-clamp-1`}>{insight.title}</p>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">{insight.category}</p>
                      </div>
                    </div>
                    
                    <p className="text-xs text-slate-500 font-medium text-left line-clamp-3 italic leading-relaxed pt-2">
                      {insight.detail}
                    </p>
                  </button>
                );
              }) : (
                <div className="py-12 px-8 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem] w-full flex flex-col items-center justify-center gap-4 text-slate-400">
                  <i className="fas fa-robot text-4xl opacity-20"></i>
                  <p className="text-sm font-bold italic text-center max-w-sm">Klicke oben auf "Analyse aktualisieren", um personalisierte Insights zu generieren.</p>
                </div>
              )}
            </div>
            
            {/* Visual Indicator for Scrolling */}
            {insights.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 bg-slate-100 rounded-full opacity-60 pointer-events-none">
                <i className="fas fa-chevron-left text-[8px] animate-pulse"></i>
                <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">{t.swipeHint}</span>
                <i className="fas fa-chevron-right text-[8px] animate-pulse"></i>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { cat: 'steps', title: t.steps, icon: 'fa-shoe-prints', color: '#f97316', bg: 'bg-orange-50', data: formattedMetrics.slice(-14), key: 'steps' },
          { cat: 'vitals', title: t.vitals, icon: 'fa-heart-pulse', color: '#ef4444', bg: 'bg-red-50', data: formattedMetrics.slice(-14), key: 'restingHeartRate' },
          { cat: 'weight', title: t.weightTrend, icon: 'fa-weight-scale', color: '#f97316', bg: 'bg-slate-900', data: formattedMetrics.filter(m => m.weight).slice(-14), key: 'weight' },
          { cat: 'regeneration', title: t.regeneration, icon: 'fa-bed', color: '#6366f1', bg: 'bg-indigo-50', data: formattedMetrics.slice(-14), key: 'sleepHours' }
        ].map(item => (
          <div key={item.cat} onClick={() => setSelectedCategory(item.cat as any)} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer group">
            <div className="flex justify-between items-center mb-6">
              <div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.activity}</p><h4 className="text-lg font-black text-slate-900">{item.title}</h4></div>
              <div className={`w-9 h-9 ${item.bg} ${item.cat === 'weight' ? 'text-white' : item.cat === 'steps' ? 'text-orange-500' : item.cat === 'vitals' ? 'text-red-500' : 'text-indigo-500'} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform`}><i className={`fas ${item.icon}`}></i></div>
            </div>
            <div className="h-40 w-full pointer-events-none">
              <ResponsiveContainer width="100%" height="100%">
                {item.cat === 'steps' || item.cat === 'regeneration' ? (
                  <BarChart data={item.data}><Bar dataKey={item.key} fill={item.color} radius={[4, 4, 0, 0]} /></BarChart>
                ) : item.cat === 'weight' ? (
                  <AreaChart data={item.data}>
                    <YAxis domain={['auto', 'auto']} hide />
                    <Area type="monotone" dataKey={item.key} stroke={item.cat === 'weight' ? '#f97316' : '#1e293b'} fill={item.cat === 'weight' ? 'rgba(249,115,22,0.1)' : '#f1f5f9'} strokeWidth={3} />
                  </AreaChart>
                ) : (
                  <LineChart data={item.data}>
                    <YAxis domain={['auto', 'auto']} hide />
                    <Line type="monotone" dataKey={item.key} stroke="#ef4444" strokeWidth={3} dot={false} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>

      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xml,.zip" className="hidden" />
    </div>
  );
};

export default HealthTab;
