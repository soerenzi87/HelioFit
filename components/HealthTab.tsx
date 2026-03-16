
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

type MetricCategory = 'steps' | 'vitals' | 'weight' | 'bodycomp' | 'regeneration';
type VitalSubType = 'heartRate' | 'hrv' | 'spo2' | 'respiratoryRate' | 'bodyTemperature' | 'bloodPressure';

const HealthTab: React.FC<HealthTabProps> = ({ profile, healthData, insights, onUpdateInsights, onResetSync, onUploadData, isLoading, language }) => {
  const [selectedInsight, setSelectedInsight] = useState<HealthInsight | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isParsingApple, setIsParsingApple] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<MetricCategory | null>(null);
  const [timeRange, setTimeRange] = useState<number>(30); // Tage
  const [vitalSubType, setVitalSubType] = useState<VitalSubType>('heartRate');
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
    bodyComp: 'Körperzusammensetzung',
    musclePct: 'Muskel %',
    waterPct: 'Wasser %',
    visceralFat: 'Viszeralfett',
    bmr: 'Grundumsatz (kcal)',
    bodyAge: 'Körperalter',
    healthScore: 'Health Score',
    boneMass: 'Knochenmasse (kg)',
    fatMass: 'Fettmasse (kg)',
    muscleMass: 'Muskelmasse (kg)',
    distance: 'Distanz (km)',
    regeneration: 'Regeneration',
    sleep: 'Schlafdauer (h)',
    deepSleep: 'Tiefschlaf (min)',
    remSleep: 'REM-Schlaf (min)',
    lightSleep: 'Leichtschlaf (min)',
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
    swipeHint: 'Wischen für mehr',
    readings: 'Messwerte',
    bloodPressure: 'Blutdruck',
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
    bodyComp: 'Body Composition',
    musclePct: 'Muscle %',
    waterPct: 'Water %',
    visceralFat: 'Visceral Fat',
    bmr: 'BMR (kcal)',
    bodyAge: 'Body Age',
    healthScore: 'Health Score',
    boneMass: 'Bone Mass (kg)',
    fatMass: 'Fat Mass (kg)',
    muscleMass: 'Muscle Mass (kg)',
    distance: 'Distance (km)',
    regeneration: 'Regeneration',
    sleep: 'Sleep (h)',
    deepSleep: 'Deep Sleep (min)',
    remSleep: 'REM Sleep (min)',
    lightSleep: 'Light Sleep (min)',
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
    swipeHint: 'Swipe for more',
    readings: 'Readings',
    bloodPressure: 'Blood Pressure',
  };

  const formattedMetrics = useMemo(() => {
    return (healthData?.metrics || []).map(m => ({
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

  // ── Helpers for individual readings ──
  const filterByTime = <T extends { time: string }>(arr: T[] | undefined): T[] => {
    if (!arr || arr.length === 0) return [];
    if (timeRange === 0) return arr;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - timeRange);
    return arr.filter(r => new Date(r.time) >= cutoff);
  };

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(language === 'de' ? 'de-DE' : 'en-US', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  };

  const fmtTimeFull = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(language === 'de' ? 'de-DE' : 'en-US', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const downsample = <T,>(arr: T[], maxPoints: number = 1000): T[] => {
    if (arr.length <= maxPoints) return arr;
    const step = Math.ceil(arr.length / maxPoints);
    return arr.filter((_, i) => i % step === 0);
  };

  // ── Detail View ──
  const DetailView = () => {
    if (!selectedCategory) return null;

    const catMap = {
      steps: { title: t.steps, icon: 'fa-shoe-prints', color: '#f97316', bg: 'bg-orange-50', text: 'text-orange-500' },
      vitals: { title: t.vitals, icon: 'fa-heart-pulse', color: '#ef4444', bg: 'bg-red-50', text: 'text-red-500' },
      weight: { title: t.weightTrend, icon: 'fa-weight-scale', color: '#1e293b', bg: 'bg-slate-100', text: 'text-slate-900' },
      bodycomp: { title: t.bodyComp, icon: 'fa-person-rays', color: '#8b5cf6', bg: 'bg-violet-50', text: 'text-violet-500' },
      regeneration: { title: t.regeneration, icon: 'fa-bed', color: '#6366f1', bg: 'bg-indigo-50', text: 'text-indigo-500' },
    };

    const catInfo = catMap[selectedCategory as keyof typeof catMap];
    const r = healthData?.readings;

    // ── Shared header component ──
    const StickyHeader = () => (
      <div className="sticky top-0 z-[210] bg-[#0f172a]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-5xl mx-auto w-full p-6 sm:p-10 space-y-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => { setSelectedCategory(null); setVitalSubType('heartRate'); }} 
                className="group flex items-center gap-3 text-slate-400 hover:text-white transition-all font-black uppercase tracking-widest text-[10px]"
              >
                <div className="w-10 h-10 rounded-full bg-white/5 shadow-sm flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all border border-white/10">
                  <i className="fas fa-arrow-left"></i>
                </div>
                {t.back}
              </button>
              <button 
                onClick={onResetSync} 
                className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-xl"
              >
                <i className="fas fa-unlink"></i> {t.resetSync}
              </button>
            </div>
            <div className="flex gap-2 p-1 bg-white/5 rounded-2xl shadow-xl border border-white/5 backdrop-blur-md">
              {[7, 30, 0].map(val => (
                <button 
                  key={val} 
                  onClick={() => setTimeRange(val)} 
                  className={`px-5 py-2.5 rounded-xl font-black text-[9px] uppercase transition-all ${timeRange === val ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {val === 7 ? t.days7 : val === 30 ? t.days30 : t.daysAll}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 ${catInfo.bg.replace('bg-', 'bg-').replace('-50', '-600/20')} ${catInfo.text.replace('text-', 'text-').replace('-500', '-400')} rounded-[1.25rem] flex items-center justify-center text-2xl shadow-xl border border-white/10`}>
              <i className={`fas ${catInfo.icon}`}></i>
            </div>
            <div>
              <h2 className="text-3xl font-black text-white tracking-tight uppercase">{catInfo.title}</h2>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.detailTitle}</p>
            </div>
          </div>
        </div>
      </div>
    );

    // ── Vitals detail with sub-type selection ──
    if (selectedCategory === 'vitals') {
      const vitalOptions = [
        { key: 'heartRate' as VitalSubType, label: t.heartRate, color: '#ef4444', unit: 'BPM', icon: 'fa-heart-pulse' },
        { key: 'hrv' as VitalSubType, label: t.hrv, color: '#6366f1', unit: 'ms', icon: 'fa-wave-square' },
        { key: 'spo2' as VitalSubType, label: t.oxygen, color: '#3b82f6', unit: '%', icon: 'fa-lungs' },
        { key: 'respiratoryRate' as VitalSubType, label: t.respiration, color: '#10b981', unit: '/min', icon: 'fa-wind' },
        { key: 'bodyTemperature' as VitalSubType, label: t.temp, color: '#ec4899', unit: '°C', icon: 'fa-temperature-half' },
        { key: 'bloodPressure' as VitalSubType, label: t.bloodPressure, color: '#f97316', unit: 'mmHg', icon: 'fa-gauge-high' },
      ];

      const readingsMap: Record<string, any[]> = {
        heartRate: filterByTime(r?.heartRate),
        hrv: filterByTime(r?.hrv),
        spo2: filterByTime(r?.spo2),
        respiratoryRate: filterByTime(r?.respiratoryRate),
        bodyTemperature: filterByTime(r?.bodyTemperature),
        bloodPressure: filterByTime(r?.bloodPressure),
      };

      const activeOpt = vitalOptions.find(v => v.key === vitalSubType) || vitalOptions[0];
      const activeReadings = readingsMap[vitalSubType] || [];
      const isBP = vitalSubType === 'bloodPressure';

      // Chart data
      const chartData = isBP
        ? downsample(activeReadings.map((x: any) => ({ timeLabel: fmtTime(x.time), systolic: x.systolic, diastolic: x.diastolic })))
        : downsample(activeReadings.map((x: any) => ({ timeLabel: fmtTime(x.time), value: x.value })));

      return (
        <div className="fixed inset-x-0 bottom-0 top-16 z-[200] bg-[#0f172a] flex flex-col animate-fade-in">
          <StickyHeader />
          <div className="flex-grow overflow-y-auto no-scrollbar px-6 sm:px-12 py-10">
            <div className="max-w-5xl mx-auto w-full space-y-10 pb-32">
              {/* Sub-type selector */}
              <div className="flex gap-2 flex-wrap">
                {vitalOptions.map(opt => {
                  const count = (readingsMap[opt.key] || []).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setVitalSubType(opt.key)}
                      className={`px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                        vitalSubType === opt.key
                          ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20'
                          : 'bg-white/5 text-slate-500 border border-white/5 hover:border-white/10 hover:text-slate-300'
                      }`}
                    >
                      <i className={`fas ${opt.icon}`} style={{ color: vitalSubType === opt.key ? 'white' : opt.color }}></i>
                      {opt.label}
                      <span className={`text-[8px] ${vitalSubType === opt.key ? 'text-indigo-200' : 'text-slate-600'}`}>({count})</span>
                    </button>
                  );
                })}
              </div>

              {/* Chart */}
              {chartData.length > 0 && (
                <div className="bg-slate-800/30 p-6 sm:p-12 rounded-[3.5rem] border border-white/5 shadow-2xl backdrop-blur-sm">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: activeOpt.color }}></div>
                    <span className="text-sm font-black text-white uppercase tracking-widest">{activeOpt.label}</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2">{activeReadings.length} {t.readings}</span>
                  </div>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      {isBP ? (
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="timeLabel" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} interval={Math.max(0, Math.floor(chartData.length / 8))} />
                          <YAxis domain={['auto', 'auto']} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                          <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 'bold', color: '#fff' }} />
                          <Line type="monotone" dataKey="systolic" stroke="#ef4444" strokeWidth={3} dot={false} isAnimationActive={false} name="Systolisch" />
                          <Line type="monotone" dataKey="diastolic" stroke="#3b82f6" strokeWidth={3} dot={false} isAnimationActive={false} name="Diastolisch" />
                        </LineChart>
                      ) : (
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="timeLabel" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} interval={Math.max(0, Math.floor(chartData.length / 8))} />
                          <YAxis domain={['auto', 'auto']} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 'bold', color: '#fff' }}
                            formatter={(value: number) => [`${value} ${activeOpt.unit}`, activeOpt.label]}
                          />
                          <Line type="monotone" dataKey="value" stroke={activeOpt.color} strokeWidth={3} dot={false} isAnimationActive={false} />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Individual Readings Table */}
              <div className="bg-slate-800/20 rounded-[3rem] border border-white/5 shadow-2xl overflow-hidden backdrop-blur-sm">
                <div className="p-10 border-b border-white/5 bg-white/2 flex items-center justify-between">
                  <h3 className="text-xl font-black text-white uppercase tracking-tight">{t.history}</h3>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{activeReadings.length} {t.readings}</span>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto no-scrollbar">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-[#1e293b] z-10">
                      <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        <th className="px-10 py-6">{t.date}</th>
                        <th className="px-10 py-6">{t.value}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {[...activeReadings].reverse().slice(0, 500).map((reading: any, idx: number) => (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="px-10 py-5 text-sm font-bold text-slate-300">{fmtTimeFull(reading.time)}</td>
                          <td className="px-10 py-5 text-sm font-black" style={{ color: activeOpt.color }}>
                            {isBP ? `${reading.systolic}/${reading.diastolic} ${activeOpt.unit}` : `${reading.value} ${activeOpt.unit}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ── Steps detail ──
    if (selectedCategory === 'steps') {
      const stepReadings = filterByTime(r?.steps);
      const calReadings = filterByTime(r?.calories);
      const distReadings = filterByTime(r?.distance);

      // Merge all activity readings into one table sorted by time
      const activityReadings = [
        ...stepReadings.map((s: any) => ({ time: s.time, label: `${s.count.toLocaleString()} Schritte`, type: 'steps' })),
        ...calReadings.map((c: any) => ({ time: c.time, label: `${Math.round(c.kilocalories)} kcal`, type: 'cal' })),
        ...distReadings.map((d: any) => ({ time: d.time, label: `${(d.meters / 1000).toFixed(2)} km`, type: 'dist' })),
      ].sort((a, b) => b.time.localeCompare(a.time));

      return (
        <div className="fixed inset-x-0 bottom-0 top-16 z-[200] bg-[#0f172a] flex flex-col animate-fade-in">
          <StickyHeader />
          <div className="flex-grow overflow-y-auto no-scrollbar px-6 sm:px-12 py-10">
            <div className="max-w-5xl mx-auto w-full space-y-10 pb-32">
              {/* Daily aggregated chart */}
              <div className="bg-slate-800/30 p-6 sm:p-12 rounded-[3.5rem] border border-white/5 shadow-2xl backdrop-blur-sm h-[450px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={filteredMetrics}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="dateStr" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b', fontWeight: 'bold'}} />
                    <YAxis yAxisId="steps" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                    <YAxis yAxisId="energy" orientation="right" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#f97316'}} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 'bold', color: '#fff' }}
                    />
                    <Bar yAxisId="steps" dataKey="steps" fill="#f97316" radius={[8, 8, 0, 0]} name="Schritte" />
                    <Line yAxisId="energy" type="monotone" dataKey="activeEnergy" stroke="#f59e0b" strokeWidth={3} dot={false} name="kcal" />
                    <Line yAxisId="steps" type="monotone" dataKey="distance" stroke="#3b82f6" strokeWidth={2} dot={false} name={t.distance} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Individual readings table */}
              <div className="bg-slate-800/20 rounded-[3rem] border border-white/5 shadow-2xl overflow-hidden backdrop-blur-sm">
                <div className="p-10 border-b border-white/5 bg-white/2 flex items-center justify-between">
                  <h3 className="text-xl font-black text-white uppercase tracking-tight">{t.history}</h3>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{activityReadings.length} {t.readings}</span>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto no-scrollbar">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-[#1e293b] z-10">
                      <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        <th className="px-10 py-6">{t.date}</th>
                        <th className="px-10 py-6">{t.value}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {activityReadings.slice(0, 500).map((reading, idx) => (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="px-10 py-5 text-sm font-bold text-slate-300">{fmtTimeFull(reading.time)}</td>
                          <td className="px-10 py-5 text-sm font-black text-orange-400">{reading.label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ── Weight detail with individual readings ──
    if (selectedCategory === 'weight') {
      const weightReadings = filterByTime(r?.weight);
      const hasReadings = weightReadings.length > 0;

      const chartData = hasReadings
        ? downsample(weightReadings.map((w: any) => ({
            timeLabel: fmtTime(w.time),
            weight: w.value,
            bodyFat: w.bodyFat,
          })))
        : filteredMetrics.filter(m => m.weight || m.bodyFat).map(m => ({
            timeLabel: (m as any).dateStr,
            weight: m.weight,
            bodyFat: m.bodyFat,
          }));

      return (
        <div className="fixed inset-x-0 bottom-0 top-16 z-[200] bg-[#0f172a] flex flex-col animate-fade-in">
          <StickyHeader />
          <div className="flex-grow overflow-y-auto no-scrollbar px-6 sm:px-12 py-10">
            <div className="max-w-5xl mx-auto w-full space-y-10 pb-32">
              {/* Weight chart */}
              <div className="bg-slate-800/30 p-6 sm:p-12 rounded-[3.5rem] border border-white/5 shadow-2xl backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-8">
                  <span className="text-sm font-black text-white uppercase tracking-widest">{t.weight}</span>
                  {hasReadings && <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2">{weightReadings.length} {t.readings}</span>}
                </div>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="timeLabel" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b', fontWeight: 'bold'}} interval={Math.max(0, Math.floor(chartData.length / 8))} />
                      <YAxis yAxisId="w" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#f1f5f9'}} domain={['auto', 'auto']} />
                      <YAxis yAxisId="bf" orientation="right" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#f59e0b'}} domain={[0, 40]} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 'bold', color: '#fff' }}
                      />
                      <Area yAxisId="w" type="monotone" dataKey="weight" name={t.weight} stroke="#4f46e5" fill="#4f46e520" strokeWidth={4} />
                      <Line yAxisId="bf" type="monotone" dataKey="bodyFat" name={t.bodyFat} stroke="#f59e0b" strokeWidth={3} dot={{r: 4}} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Individual weight readings table */}
              <div className="bg-slate-800/20 rounded-[3rem] border border-white/5 shadow-2xl overflow-hidden backdrop-blur-sm">
                <div className="p-10 border-b border-white/5 bg-white/2 flex items-center justify-between">
                  <h3 className="text-xl font-black text-white uppercase tracking-tight">{t.history}</h3>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{hasReadings ? weightReadings.length : filteredMetrics.filter(m => m.weight).length} {t.readings}</span>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto no-scrollbar">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-[#1e293b] z-10">
                      <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        <th className="px-10 py-6">{t.date}</th>
                        <th className="px-10 py-6">{t.value}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {hasReadings
                        ? [...weightReadings].reverse().slice(0, 500).map((w: any, idx: number) => {
                            const parts = [`${w.value} kg`];
                            if (w.bodyFat) parts.push(`${w.bodyFat}% Fett`);
                            if (w.bmi) parts.push(`BMI ${w.bmi}`);
                            return (
                              <tr key={idx} className="hover:bg-white/5 transition-colors">
                                <td className="px-10 py-5 text-sm font-bold text-slate-300">{fmtTimeFull(w.time)}</td>
                                <td className="px-10 py-5 text-sm font-black text-slate-400">{parts.join(' / ')}</td>
                              </tr>
                            );
                          })
                        : [...filteredMetrics].reverse().filter(m => m.weight).map((m, idx) => (
                            <tr key={idx} className="hover:bg-white/5 transition-colors">
                              <td className="px-10 py-5 text-sm font-bold text-slate-300">{(m as any).fullDateStr}</td>
                              <td className="px-10 py-5 text-sm font-black text-slate-400">
                                {[m.weight && `${m.weight} kg`, m.bodyFat && `${m.bodyFat}% Fett`, m.bmi && `BMI ${m.bmi}`].filter(Boolean).join(' / ')}
                              </td>
                            </tr>
                          ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ── Body Comp detail (daily, scale measurements) ──
    if (selectedCategory === 'bodycomp') {
      return (
        <div className="fixed inset-x-0 bottom-0 top-16 z-[200] bg-[#0f172a] flex flex-col animate-fade-in">
          <StickyHeader />
          <div className="flex-grow overflow-y-auto no-scrollbar px-6 sm:px-12 py-10">
            <div className="max-w-5xl mx-auto w-full space-y-10 pb-32">
              <div className="bg-slate-800/30 p-6 sm:p-12 rounded-[3.5rem] border border-white/5 shadow-2xl backdrop-blur-sm h-[450px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={filteredMetrics.filter(m => m.musclePct || m.bodyFat || m.waterPct)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="dateStr" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b', fontWeight: 'bold'}} />
                    <YAxis yAxisId="pct" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#8b5cf6'}} domain={[0, 80]} />
                    <YAxis yAxisId="score" orientation="right" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#10b981'}} domain={[0, 100]} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 'bold', color: '#fff' }}
                    />
                    <Line yAxisId="pct" type="monotone" dataKey="musclePct" name={t.musclePct} stroke="#8b5cf6" strokeWidth={3} dot={{r: 3}} />
                    <Line yAxisId="pct" type="monotone" dataKey="bodyFat" name={t.bodyFat} stroke="#f59e0b" strokeWidth={3} dot={{r: 3}} />
                    <Line yAxisId="pct" type="monotone" dataKey="waterPct" name={t.waterPct} stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line yAxisId="score" type="monotone" dataKey="healthScore" name={t.healthScore} stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-slate-800/20 rounded-[3rem] border border-white/5 shadow-2xl overflow-hidden backdrop-blur-sm">
                <div className="p-10 border-b border-white/5 bg-white/2">
                  <h3 className="text-xl font-black text-white uppercase tracking-tight">{t.history}</h3>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto no-scrollbar">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-[#1e293b] z-10">
                      <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        <th className="px-10 py-6">{t.date}</th>
                        <th className="px-10 py-6">{t.value}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {[...filteredMetrics].reverse().filter(m => m.musclePct || m.bodyFat || m.waterPct).map((m, idx) => {
                        const parts = [
                          m.musclePct ? `${m.musclePct}% Muskel` : null,
                          m.waterPct ? `${m.waterPct}% Wasser` : null,
                          m.visceralFat ? `VF ${m.visceralFat}` : null,
                          m.bmr ? `${m.bmr} kcal BMR` : null,
                          m.bodyAge ? `Alter ${m.bodyAge}` : null,
                          m.healthScore ? `Score ${m.healthScore}` : null,
                        ].filter(Boolean);
                        return (
                          <tr key={idx} className="hover:bg-white/5 transition-colors">
                            <td className="px-10 py-5 text-sm font-bold text-slate-300">{(m as any).fullDateStr}</td>
                            <td className="px-10 py-5 text-sm font-black text-slate-400">{parts.join(' / ')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ── Body Comp detail (daily, scale measurements) ──
    if (selectedCategory === 'regeneration') {
      return (
        <div className="fixed inset-x-0 bottom-0 top-16 z-[200] bg-[#0f172a] flex flex-col animate-fade-in">
          <StickyHeader />
          <div className="flex-grow overflow-y-auto no-scrollbar px-6 sm:px-12 py-10">
            <div className="max-w-5xl mx-auto w-full space-y-10 pb-32">
              <div className="bg-slate-800/30 p-6 sm:p-12 rounded-[3.5rem] border border-white/5 shadow-2xl backdrop-blur-sm h-[450px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={filteredMetrics.filter(m => m.sleepHours)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="dateStr" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b', fontWeight: 'bold'}} />
                    <YAxis yAxisId="hours" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#6366f1'}} />
                    <YAxis yAxisId="min" orientation="right" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 'bold', color: '#fff' }}
                    />
                    <Bar yAxisId="hours" dataKey="sleepHours" name={t.sleep} fill="rgba(99, 102, 241, 0.4)" stroke="#6366f1" radius={[8, 8, 0, 0]} />
                    <Line yAxisId="min" type="monotone" dataKey="deepSleepMinutes" name={t.deepSleep} stroke="#fff" strokeWidth={2} dot={false} />
                    <Line yAxisId="min" type="monotone" dataKey="remSleepMinutes" name={t.remSleep} stroke="#a855f7" strokeWidth={2} dot={false} />
                    <Line yAxisId="min" type="monotone" dataKey="lightSleepMinutes" name={t.lightSleep} stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-slate-800/20 rounded-[3rem] border border-white/5 shadow-2xl overflow-hidden backdrop-blur-sm">
                <div className="p-10 border-b border-white/5 bg-white/2">
                  <h3 className="text-xl font-black text-white uppercase tracking-tight">{t.history}</h3>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto no-scrollbar">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-[#1e293b] z-10">
                      <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        <th className="px-10 py-6">{t.date}</th>
                        <th className="px-10 py-6">{t.value}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {[...filteredMetrics].reverse().filter(m => m.sleepHours).map((m, idx) => {
                        const parts = [
                          m.sleepHours ? `${m.sleepHours.toFixed(1)}h` : null,
                          m.deepSleepMinutes ? `${m.deepSleepMinutes} min Tief` : null,
                          m.remSleepMinutes ? `${m.remSleepMinutes} min REM` : null,
                          m.lightSleepMinutes ? `${m.lightSleepMinutes} min Leicht` : null,
                        ].filter(Boolean);
                        return (
                          <tr key={idx} className="hover:bg-white/5 transition-colors">
                            <td className="px-10 py-5 text-sm font-bold text-slate-300">{(m as any).fullDateStr}</td>
                            <td className="px-10 py-5 text-sm font-black text-slate-400">{parts.join(' / ')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
  };

  if ((!healthData || healthData?.metrics?.length === 0) && !isLoading && !isParsingApple) return (
    <div className="bg-[#1a1f26] rounded-[2.5rem] p-12 text-center border border-white/5 shadow-2xl space-y-8 animate-fade-in">
      <div className="w-24 h-24 bg-indigo-600/10 text-indigo-400 rounded-3xl flex items-center justify-center text-4xl mx-auto border border-indigo-500/20 shadow-xl shadow-indigo-600/10"><i className="fas fa-file-medical"></i></div>
      <div className="max-w-md mx-auto space-y-4">
        <h2 className="text-3xl font-black text-white tracking-tight">{t.noSync}</h2>
        <p className="text-slate-500 font-bold text-sm leading-relaxed">{language === 'de' ? 'Bitte konfiguriere deine Datenquellen in den Einstellungen.' : 'Please configure your data sources in the settings.'}</p>
      </div>
    </div>
  );

  if (isLoading || isParsingApple) return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <div className={`w-20 h-20 border-4 ${isParsingApple ? 'border-indigo-500' : 'border-emerald-500'} border-t-transparent rounded-full animate-spin mb-8 shadow-xl`}></div>
      <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-[10px] animate-pulse">
        {isParsingApple ? t.parsing : t.syncing}
      </p>
    </div>
  );

  return (
    <div className="space-y-6 pb-10 relative">
      {selectedCategory && <DetailView />}

      {/* Insight Modal */}
      {selectedInsight && (
        <div className="fixed inset-0 z-[150] bg-[#0f172a]/80 backdrop-blur-xl flex items-center justify-center p-6 animate-fade-in transition-all">
          <div className="bg-[#1a1f26] rounded-[3rem] p-10 max-w-xl w-full shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10 animate-scale-in relative text-white">
            <button 
              onClick={() => setSelectedInsight(null)} 
              className="absolute top-8 right-8 w-12 h-12 rounded-2xl bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all border border-white/5"
            >
              <i className="fas fa-times text-xl"></i>
            </button>
            <div className={`w-16 h-16 ${getInsightStyle(selectedInsight).bg.replace('bg-', 'bg-').replace('-50', '-600/20')} ${getInsightStyle(selectedInsight).text.replace('text-', 'text-').replace('-600', '-400')} rounded-[1.25rem] border border-white/5 flex items-center justify-center text-3xl mb-8 shadow-xl`}>
              <i className={`fas ${getInsightStyle(selectedInsight).icon}`}></i>
            </div>
            <h3 className="text-3xl font-black text-white mb-6 tracking-tighter uppercase">{selectedInsight.title}</h3>
            <div className="p-8 bg-slate-800/50 rounded-[2rem] border border-white/5 mb-8 italic">
              <p className="text-slate-300 font-bold leading-relaxed text-lg">"{selectedInsight.detail}"</p>
            </div>
            <button
              onClick={() => { setSelectedCategory(selectedInsight?.category as MetricCategory); setSelectedInsight(null); }}
              className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-4 transition-all"
            >
              <i className="fas fa-chart-line text-sm"></i> {t.showData}
            </button>
          </div>
        </div>
      )}

      {/* Checkup Cockpit */}
      <div className="bg-[#1a1f26] p-10 rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 p-10 opacity-5 text-9xl pointer-events-none translate-x-4 transition-transform hover:-rotate-12 duration-1000"><i className="fas fa-wand-magic-sparkles text-white"></i></div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-10 relative z-10">
          <div>
            <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Health Intelligence</p>
            <h3 className="text-3xl font-black flex items-center gap-4 tracking-tighter text-white uppercase">{t.checkup}</h3>
          </div>
          <div className="flex gap-3">
            <button onClick={onResetSync} className="px-6 py-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-xl">
              <i className="fas fa-unlink"></i> {t.resetSync}
            </button>
            <button onClick={handleAnalyze} disabled={isAnalyzing} className="px-8 py-3 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-600/20 disabled:opacity-50">
              {isAnalyzing ? <i className="fas fa-circle-notch animate-spin"></i> : <i className="fas fa-rotate"></i>} {t.update}
            </button>
          </div>
        </div>

        {isAnalyzing ? (
          <div className="flex gap-4 animate-pulse overflow-x-auto no-scrollbar pb-6 px-2">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-48 min-w-[280px] bg-slate-800/50 rounded-[2rem] flex-shrink-0 border border-white/5"></div>)}
          </div>
        ) : (
          <div className="relative">
            {/* Carousel Container */}
            <div className="flex overflow-x-auto gap-5 pb-10 px-2 snap-x snap-mandatory no-scrollbar mask-fade-edges-x cursor-grab active:cursor-grabbing">
              {insights.length > 0 ? insights.map((insight, idx) => {
                const style = getInsightStyle(insight);
                const impactColor = insight.impact === 'positive' ? 'emerald' : insight.impact === 'negative' ? 'amber' : 'blue';
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedInsight(insight)}
                    className={`flex-shrink-0 snap-start flex flex-col gap-5 p-8 w-[300px] sm:w-[340px] lg:w-[380px] bg-slate-800/30 border border-white/5 rounded-[3rem] transition-all hover:bg-slate-800/50 hover:border-white/10 hover:shadow-2xl active:scale-[0.98] group relative overflow-hidden`}
                  >
                    <div className={`absolute top-0 right-0 p-5 bg-${impactColor}-500/10 text-${impactColor}-400 rounded-bl-[2rem] border-l border-b border-white/5 transition-colors group-hover:bg-${impactColor}-500/20`}>
                       <i className={`fas ${style.impactInfo.icon} text-xl`}></i>
                    </div>

                    <div className="flex items-center gap-5">
                      <div className={`w-14 h-14 bg-indigo-600/10 text-indigo-400 rounded-2xl flex items-center justify-center text-2xl border border-indigo-500/20 shadow-xl group-hover:scale-110 transition-transform`}>
                        <i className={`fas ${style.icon}`}></i>
                      </div>
                      <div className="text-left pr-12">
                        <p className={`text-lg font-black tracking-tight leading-tight text-white group-hover:text-indigo-400 transition-colors line-clamp-1`}>{insight.title}</p>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mt-1">{insight.category}</p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-400 font-bold text-left line-clamp-3 italic leading-relaxed pt-2 opacity-80 group-hover:opacity-100 transition-opacity">
                      {insight.detail}
                    </p>
                  </button>
                );
              }) : (
                <div className="py-16 px-10 bg-slate-800/20 border-2 border-dashed border-white/5 rounded-[3.5rem] w-full flex flex-col items-center justify-center gap-6 text-slate-500">
                  <i className="fas fa-robot text-5xl opacity-10 text-indigo-500"></i>
                  <p className="text-sm font-bold italic text-center max-w-sm tracking-wide leading-relaxed">Klicke oben auf "{t.update}", um personalisierte Insights zu generieren.</p>
                </div>
              )}
            </div>

            {/* Visual Indicator for Scrolling */}
            {insights.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 bg-white/5 border border-white/5 backdrop-blur-md rounded-full opacity-60 pointer-events-none">
                <i className="fas fa-chevron-left text-[8px] animate-pulse text-indigo-400"></i>
                <span className="text-[9px] font-black uppercase tracking-[0.3em] whitespace-nowrap text-white">{t.swipeHint}</span>
                <i className="fas fa-chevron-right text-[8px] animate-pulse text-indigo-400"></i>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Latest Body Comp Summary Cards */}
      {(() => {
        const latest = formattedMetrics.slice().reverse().find(m => m.musclePct || m.visceralFat || m.bmr);
        if (!latest) return null;
        const items = [
          { label: t.musclePct, value: latest.musclePct, unit: '%', icon: 'fa-dumbbell', color: 'text-violet-400', bg: 'bg-violet-600/10' },
          { label: t.waterPct, value: latest.waterPct, unit: '%', icon: 'fa-droplet', color: 'text-blue-400', bg: 'bg-blue-600/10' },
          { label: t.visceralFat, value: latest.visceralFat, unit: '', icon: 'fa-shield-heart', color: 'text-amber-400', bg: 'bg-amber-600/10' },
          { label: t.bmr, value: latest.bmr, unit: ' kcal', icon: 'fa-fire', color: 'text-red-400', bg: 'bg-red-600/10' },
          { label: t.bodyAge, value: latest.bodyAge, unit: '', icon: 'fa-hourglass-half', color: 'text-emerald-400', bg: 'bg-emerald-600/10' },
          { label: t.healthScore, value: latest.healthScore, unit: '', icon: 'fa-star', color: 'text-yellow-400', bg: 'bg-yellow-600/10' },
          { label: t.boneMass, value: latest.boneMassKg, unit: ' kg', icon: 'fa-bone', color: 'text-slate-400', bg: 'bg-slate-700/30' },
          { label: t.muscleMass, value: latest.muscleMassKg, unit: ' kg', icon: 'fa-person-walking', color: 'text-violet-400', bg: 'bg-violet-600/10' },
        ].filter(i => i.value != null);
        if (items.length === 0) return null;
        return (
          <div className="bg-[#1a1f26] p-10 rounded-[2.5rem] border border-white/5 shadow-2xl">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-violet-600/10 text-violet-400 rounded-2xl flex items-center justify-center text-xl border border-violet-500/20 shadow-xl"><i className="fas fa-person-rays"></i></div>
              <div>
                <h4 className="text-2xl font-black text-white tracking-tight uppercase">{t.bodyComp}</h4>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">{language === 'de' ? 'Aktuelle Messwerte' : 'Latest Readings'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {items.map(item => (
                <div key={item.label} className={`${item.bg} rounded-[2rem] p-6 text-center border border-white/5 transition-transform hover:scale-[1.03]`}>
                  <div className={`${item.color} text-xl mb-3`}><i className={`fas ${item.icon}`}></i></div>
                  <div className="text-2xl font-black text-white tracking-tighter">{item.value}<span className="text-xs text-slate-500 ml-0.5">{item.unit}</span></div>
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          { cat: 'steps', title: t.steps, icon: 'fa-shoe-prints', color: '#f97316', bg: 'bg-orange-600/10', text: 'text-orange-400', data: formattedMetrics.filter(m => m.steps).slice(-14), key: 'steps', chartType: 'bar' as const },
          { cat: 'vitals', title: t.vitals, icon: 'fa-heart-pulse', color: '#ef4444', bg: 'bg-red-600/10', text: 'text-red-400', data: formattedMetrics.filter(m => m.restingHeartRate).slice(-14), key: 'restingHeartRate', chartType: 'line' as const },
          { cat: 'weight', title: t.weightTrend, icon: 'fa-weight-scale', color: '#4f46e5', bg: 'bg-indigo-600/10', text: 'text-indigo-400', data: formattedMetrics.filter(m => m.weight).slice(-14), key: 'weight', chartType: 'area' as const },
          { cat: 'bodycomp', title: t.bodyComp, icon: 'fa-person-rays', color: '#8b5cf6', bg: 'bg-violet-600/10', text: 'text-violet-400', data: formattedMetrics.filter(m => m.bodyFat || m.musclePct).slice(-14), key: 'bodyFat', chartType: 'line' as const },
          { cat: 'regeneration', title: t.regeneration, icon: 'fa-bed', color: '#6366f1', bg: 'bg-indigo-600/10', text: 'text-indigo-400', data: formattedMetrics.filter(m => m.sleepHours).slice(-14), key: 'sleepHours', chartType: 'bar' as const },
        ].filter(item => item.data.length > 0).map(item => (
          <div key={item.cat} onClick={() => setSelectedCategory(item.cat as any)} className="bg-[#1a1f26] p-8 rounded-[2.5rem] border border-white/5 shadow-2xl hover:bg-slate-800/50 transition-all cursor-pointer group hover:scale-[1.02] active:scale-[0.98]">
            <div className="flex justify-between items-start mb-8">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">{t.activity}</p>
                <h4 className="text-xl font-black text-white tracking-tighter uppercase">{item.title}</h4>
              </div>
              <div className={`w-11 h-11 ${item.bg} ${item.text} rounded-2xl flex items-center justify-center text-xl border border-white/5 group-hover:scale-110 group-hover:bg-opacity-20 transition-all`}><i className={`fas ${item.icon}`}></i></div>
            </div>
            <div className="h-44 w-full pointer-events-none mb-2">
              <ResponsiveContainer width="100%" height="100%">
                {item.chartType === 'bar' ? (
                  <BarChart data={item.data}><Bar dataKey={item.key} fill={item.color} radius={[6, 6, 0, 0]} opacity={0.8} /></BarChart>
                ) : item.chartType === 'area' ? (
                  <AreaChart data={item.data}>
                    <defs>
                      <linearGradient id={`gradient-${item.cat}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={item.color} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={item.color} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <YAxis domain={['auto', 'auto']} hide />
                    <Area type="monotone" dataKey={item.key} stroke={item.color} fill={`url(#gradient-${item.cat})`} strokeWidth={4} />
                  </AreaChart>
                ) : (
                  <LineChart data={item.data}>
                    <YAxis domain={['auto', 'auto']} hide />
                    <Line type="monotone" dataKey={item.key} stroke={item.color} strokeWidth={4} dot={false} strokeLinecap="round" />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
            <div className="flex justify-end">
              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2 group-hover:gap-3 transition-all">Details <i className="fas fa-arrow-right"></i></span>
            </div>
          </div>
        ))}
      </div>

      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xml,.zip" className="hidden" />
    </div>
  );
};

export default HealthTab;
