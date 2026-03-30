
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { UserProfile, HealthData, Language, HealthMetricEntry, HealthInsight, HealthDataSource, HealthMetricPreferenceKey, HealthReadings, SegmentalData, CorrelationInsight } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line, ComposedChart } from 'recharts';
import { analyzeHealthTrends } from '../services/geminiService';
import { processAppleHealthFile } from '../services/appleHealthService';
import { getHealthTranslations } from './health/healthTranslations';

interface HealthTabProps {
  profile: UserProfile;
  healthData: HealthData | null;
  insights: HealthInsight[];
  onUpdateInsights: (insights: HealthInsight[]) => void;
  onResetSync: () => void;
  onUploadData: (data: HealthData, fileName: string) => void;
  isLoading: boolean;
  language: Language;
  correlationInsights?: CorrelationInsight[] | null;
  onAnalyzeCorrelations?: () => void;
  isAnalyzingCorrelations?: boolean;
}

type MetricCategory = 'steps' | 'vitals' | 'weight' | 'bodycomp' | 'regeneration';
type VitalSubType = 'heartRate' | 'hrv' | 'spo2' | 'respiratoryRate' | 'bodyTemperature' | 'bloodPressure';

const HealthTab: React.FC<HealthTabProps> = ({ profile, healthData, insights, onUpdateInsights, onResetSync, onUploadData, isLoading, language, correlationInsights, onAnalyzeCorrelations, isAnalyzingCorrelations }) => {
  const [selectedInsight, setSelectedInsight] = useState<HealthInsight | null>(null);
  const [correlationExpanded, setCorrelationExpanded] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isParsingApple, setIsParsingApple] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<MetricCategory | null>(null);
  const [timeRange, setTimeRange] = useState<number>(30); // Tage
  const [vitalSubType, setVitalSubType] = useState<VitalSubType>('heartRate');
  const [bodyCompView, setBodyCompView] = useState<'fat' | 'muscle' | 'overview'>('overview');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = getHealthTranslations(language);

  const formattedMetrics = useMemo(() => {
    return (healthData?.metrics || []).map(m => ({
      ...m,
      distanceKm: m.distance ? +(m.distance / 1000).toFixed(2) : undefined,
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
      alert(language === 'de' ? "Fehler beim Verarbeiten." : "Error processing data.");
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

  const getMetricSource = (metric: HealthMetricEntry, key: HealthMetricPreferenceKey) => {
    const dateKey = metric.date.split('T')[0];
    return healthData?.sources?.metricSources?.[dateKey]?.[key];
  };

  const getReadingSource = (key: keyof HealthReadings) => healthData?.sources?.readingSources?.[key];

  const formatSource = (source?: HealthDataSource) => (source ? t.sourceMap[source] : '—');

  // Get latest body composition data (last metric entry with body comp values)
  const latestBodyComp = useMemo(() => {
    const metrics = healthData?.metrics || [];
    const result: Record<string, number | undefined> = {};
    let segFat: SegmentalData | undefined;
    let segMuscle: SegmentalData | undefined;
    const fields = ['bodyFat', 'musclePct', 'waterPct', 'proteinPct', 'boneMassKg', 'fatMassKg', 'muscleMassKg', 'visceralFat', 'bmr', 'bodyAge', 'healthScore', 'bmi', 'leanBodyMass', 'weight', 'waistHipRatio', 'skeletalMuscleIndex'] as const;
    for (let i = metrics.length - 1; i >= 0; i--) {
      const m = metrics[i];
      for (const f of fields) {
        if (result[f] === undefined && m[f] != null) result[f] = m[f] as number;
      }
      if (!segFat && m.segmentalFatKg) segFat = m.segmentalFatKg;
      if (!segMuscle && m.segmentalMuscleKg) segMuscle = m.segmentalMuscleKg;
      if (fields.every(f => result[f] !== undefined) && segFat && segMuscle) break;
    }
    return { ...result, segFat, segMuscle };
  }, [healthData]);

  // ── Body Silhouette SVG Component ──
  const BodyCompositionVisual: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
    const bc = latestBodyComp;
    const hasData = bc.musclePct || bc.bodyFat || bc.waterPct;

    if (!hasData) {
      return <div className="flex items-center justify-center h-full text-slate-600 text-xs font-bold">{t.noBodyComp}</div>;
    }

    const musclePct = bc.musclePct || 0;
    const fatPct = bc.bodyFat || 0;
    const waterPct = bc.waterPct || 0;
    const proteinPct = bc.proteinPct || 0;
    const bonePct = bc.weight && bc.boneMassKg ? Math.round(bc.boneMassKg / bc.weight * 1000) / 10 : 0;

    // Color mapping for body regions
    const muscleColor = musclePct > 40 ? '#22c55e' : musclePct > 30 ? '#84cc16' : '#eab308';
    const fatColor = fatPct < 15 ? '#3b82f6' : fatPct < 25 ? '#f59e0b' : '#ef4444';

    // Score ring
    const score = bc.healthScore || 0;
    const scoreColor = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444';

    const compItems = [
      { label: t.musclePct, value: musclePct, unit: '%', color: '#8b5cf6', icon: 'fa-dumbbell' },
      { label: t.fatMass, value: fatPct, unit: '%', color: '#f59e0b', icon: 'fa-droplet' },
      { label: t.waterPct, value: waterPct, unit: '%', color: '#3b82f6', icon: 'fa-water' },
      { label: t.proteinPct, value: proteinPct, unit: '%', color: '#ec4899', icon: 'fa-dna' },
      { label: t.boneMass, value: bonePct, unit: '%', color: '#94a3b8', icon: 'fa-bone' },
    ].filter(i => i.value > 0);

    // Shared body silhouette path (clean outline matching reference image)
    const BodySilhouette = ({ size = 'full', fillColor = 'rgba(99,102,241,0.12)', strokeColor = 'rgba(255,255,255,0.15)' }: { size?: 'compact' | 'full'; fillColor?: string; strokeColor?: string }) => (
      <svg viewBox="-10 -15 280 440" className="w-full h-full">
        <g fill={fillColor} stroke={strokeColor} strokeWidth={size === 'compact' ? '1.8' : '1.2'} strokeLinejoin="round" strokeLinecap="round">
          {/* Head */}
          <ellipse cx="130" cy="18" rx="18" ry="22" />
          {/* Neck */}
          <rect x="122" y="38" width="16" height="14" rx="4" />
          {/* Torso + shoulders + arms as connected shape */}
          <path d="M116 52 C108 56 90 62 68 68 C58 72 48 78 42 88 C36 96 34 108 36 118 C34 130 30 148 28 162 C26 174 26 184 30 192 C34 198 40 200 44 196 L46 192 C50 186 56 172 60 156 C64 140 68 122 72 108 L76 96 L74 120 C72 136 72 152 76 168 L82 186 C84 192 88 198 92 204 C96 212 104 220 118 224 L130 226 L142 224 C156 220 164 212 168 204 C172 198 176 192 178 186 L184 168 C188 152 188 136 186 120 L184 96 L188 108 C192 122 196 140 200 156 C204 172 210 186 214 192 L216 196 C220 200 226 198 230 192 C234 184 234 174 232 162 C230 148 226 130 224 118 C226 108 224 96 218 88 C212 78 202 72 192 68 C170 62 152 56 144 52 Z" />
          {/* Left leg */}
          <path d="M96 224 C92 242 86 268 84 296 C82 320 80 340 82 356 C84 366 90 374 98 378 L120 378 C116 372 114 364 112 356 C110 340 110 320 112 296 C114 268 118 244 118 226 Z" />
          {/* Right leg */}
          <path d="M164 224 C168 242 174 268 176 296 C178 320 180 340 178 356 C176 366 170 374 162 378 L140 378 C144 372 146 364 148 356 C150 340 150 320 148 296 C146 268 142 244 142 226 Z" />
          {/* Feet */}
          <path d="M84 368 C80 374 78 384 82 392 C86 398 96 400 108 400 C116 400 120 394 120 388 L120 378" />
          <path d="M176 368 C180 374 182 384 178 392 C174 398 164 400 152 400 C144 400 140 394 140 388 L140 378" />
        </g>
      </svg>
    );

    if (compact) {
      return (
        <div className="flex items-center gap-5 h-full w-full">
          <div className="relative flex-shrink-0 w-24 h-44">
            <BodySilhouette size="compact" />
          </div>
          <div className="flex-1 space-y-1.5">
            {compItems.slice(0, 3).map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="text-[8px] font-black text-slate-500 uppercase w-12 truncate">{item.label}</span>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(item.value, 100)}%`, backgroundColor: item.color }} />
                </div>
                <span className="text-[9px] font-black text-white w-8 text-right">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Full view for detail page
    const segFat = bc.segFat as SegmentalData | undefined;
    const segMuscle = bc.segMuscle as SegmentalData | undefined;
    const hasSegmental = !!(segFat || segMuscle);

    // Compute historical trends for each body region
    const metrics = healthData?.metrics || [];
    const segHistory = useMemo(() => {
      const regions = ['leftArm', 'rightArm', 'trunk', 'leftLeg', 'rightLeg'] as const;
      const result: Record<string, { muscle: number[]; fat: number[]; dates: string[] }> = {};
      for (const r of regions) result[r] = { muscle: [], fat: [], dates: [] };
      for (const m of metrics) {
        const sf = m.segmentalFatKg;
        const sm = m.segmentalMuscleKg;
        if (!sf && !sm) continue;
        for (const r of regions) {
          const fatVal = sf?.[r];
          const muscleVal = sm?.[r];
          if (fatVal != null || muscleVal != null) {
            result[r].fat.push(fatVal || 0);
            result[r].muscle.push(muscleVal || 0);
            result[r].dates.push(m.date);
          }
        }
      }
      return result;
    }, [metrics]);

    // Trend arrow helper — invertColors for fat (increasing fat = bad = red)
    const getTrend = (values: number[], invertColors = false): { arrow: string; delta: number; color: string } => {
      if (values.length < 2) return { arrow: '—', delta: 0, color: '#64748b' };
      const last = values[values.length - 1];
      const prev = values[values.length - 2];
      const delta = +(last - prev).toFixed(2);
      const upColor = invertColors ? '#ef4444' : '#22c55e';   // fat up = red, muscle up = green
      const downColor = invertColors ? '#22c55e' : '#ef4444'; // fat down = green, muscle down = red
      if (delta > 0.05) return { arrow: '↑', delta, color: upColor };
      if (delta < -0.05) return { arrow: '↓', delta, color: downColor };
      return { arrow: '→', delta: 0, color: '#64748b' };
    };

    const statCards = [
      bc.muscleMassKg ? { label: t.muscleMass, value: `${bc.muscleMassKg}`, unit: 'kg', color: '#8b5cf6' } : null,
      bc.fatMassKg ? { label: t.fatMass, value: `${bc.fatMassKg}`, unit: 'kg', color: '#f59e0b' } : null,
      bc.leanBodyMass ? { label: t.leanMassLabel, value: `${bc.leanBodyMass}`, unit: 'kg', color: '#22c55e' } : null,
      bc.boneMassKg ? { label: t.boneMass, value: `${bc.boneMassKg}`, unit: 'kg', color: '#94a3b8' } : null,
      bc.bmi ? { label: t.bmiLabel, value: `${bc.bmi}`, unit: '', color: '#6366f1' } : null,
      bc.bmr ? { label: t.bmr, value: `${bc.bmr}`, unit: 'kcal', color: '#f97316' } : null,
      bc.bodyAge ? { label: t.bodyAge, value: `${bc.bodyAge}`, unit: '', color: '#ec4899' } : null,
      bc.visceralFat ? { label: t.visceralFat, value: `${bc.visceralFat}`, unit: '', color: '#ef4444' } : null,
      bc.waistHipRatio ? { label: t.waistHip, value: `${bc.waistHipRatio}`, unit: '', color: '#14b8a6' } : null,
      bc.skeletalMuscleIndex ? { label: t.skelMuscleIdx, value: `${bc.skeletalMuscleIndex}`, unit: '', color: '#a78bfa' } : null,
    ].filter(Boolean) as { label: string; value: string; unit: string; color: string }[];

    // Which metric to show per region
    const isFatView = bodyCompView === 'fat';
    const isOverview = bodyCompView === 'overview';
    const viewColor = isFatView ? '#f59e0b' : '#22c55e';
    const viewData = isFatView ? segFat : segMuscle;

    // Body part positions for labels (centered body at x=130, bigger body)
    const bodyParts = [
      { key: 'leftArm' as const, label: t.leftArm, cx: 42, cy: 165, lx: -110, ly: 140 },
      { key: 'rightArm' as const, label: t.rightArm, cx: 218, cy: 165, lx: 275, ly: 140 },
      { key: 'trunk' as const, label: t.trunk, cx: 130, cy: 165, lx: 275, ly: 50 },
      { key: 'leftLeg' as const, label: t.leftLeg, cx: 106, cy: 340, lx: -110, ly: 330 },
      { key: 'rightLeg' as const, label: t.rightLeg, cx: 154, cy: 340, lx: 275, ly: 330 },
    ];

    // Status helper
    const getStatus = (val: number, region: string) => {
      if (!val) return null;
      if (isFatView) {
        const thresholds: Record<string, [number, number]> = {
          leftArm: [0.8, 2.0], rightArm: [0.8, 2.0], trunk: [6, 14], leftLeg: [2, 5], rightLeg: [2, 5]
        };
        const [low, high] = thresholds[region] || [1, 5];
        if (val < low) return { text: language === 'de' ? 'Niedrig' : 'Under', color: '#3b82f6', dot: '#3b82f6' };
        if (val > high) return { text: language === 'de' ? 'Hoch' : 'Over', color: '#f59e0b', dot: '#f59e0b' };
        return { text: 'Normal', color: '#22c55e', dot: '#22c55e' };
      } else {
        const thresholds: Record<string, [number, number]> = {
          leftArm: [2.5, 5], rightArm: [2.5, 5], trunk: [20, 35], leftLeg: [7, 14], rightLeg: [7, 14]
        };
        const [low, high] = thresholds[region] || [3, 10];
        if (val < low) return { text: language === 'de' ? 'Niedrig' : 'Under', color: '#3b82f6', dot: '#3b82f6' };
        if (val > high) return { text: language === 'de' ? 'Hoch' : 'Over', color: '#f59e0b', dot: '#f59e0b' };
        return { text: 'Normal', color: '#22c55e', dot: '#22c55e' };
      }
    };

    // Max value for circle sizing (fat view)
    const allVals = bodyParts.map(bp => viewData?.[bp.key] || 0);
    const maxVal = Math.max(...allVals, 1);

    return (
      <div className="space-y-8">

        {/* ── Overview / Fat / Muscle toggle + Health Score ── */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5 p-1 bg-white/5 rounded-2xl border border-white/5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setBodyCompView('overview')}
              className={`px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${
                isOverview ? 'bg-indigo-500/20 text-indigo-400 shadow-lg' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <i className="fas fa-eye text-[8px]"></i>
              Overview
            </button>
            <button
              onClick={() => setBodyCompView('fat')}
              className={`px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${
                isFatView ? 'bg-amber-500/20 text-amber-400 shadow-lg' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <i className="fas fa-droplet text-[8px]"></i>
              {language === 'de' ? 'Fett' : 'Fat'}
            </button>
            <button
              onClick={() => setBodyCompView('muscle')}
              className={`px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${
                bodyCompView === 'muscle' ? 'bg-emerald-500/20 text-emerald-400 shadow-lg' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <i className="fas fa-dumbbell text-[8px]"></i>
              {language === 'de' ? 'Muskel' : 'Muscle'}
            </button>
          </div>
          {score > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
              <div className="relative w-10 h-10">
                <svg viewBox="0 0 40 40" className="w-full h-full">
                  <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                  <circle cx="20" cy="20" r="16" fill="none" stroke={scoreColor} strokeWidth="3"
                    strokeDasharray={`${(score / 100) * 100} 100`}
                    strokeLinecap="round" transform="rotate(-90 20 20)" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black" style={{ color: scoreColor }}>{score}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── OVERVIEW: Body composition with mass breakdown ── */}
        {isOverview && (
          <>
            {/* Body figure with composition color zones */}
            <div className="relative mx-auto" style={{ maxWidth: 320 }}>
              <BodySilhouette size="full" fillColor="rgba(99,102,241,0.15)" strokeColor="rgba(255,255,255,0.12)" />
            </div>

            {/* 4 Mass cards — big tiles */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: language === 'de' ? 'Körperwasser' : 'Body Water', value: bc.waterPct, unit: '%', absKg: bc.weight && bc.waterPct ? Math.round((bc.weight * bc.waterPct / 100) * 10) / 10 : null, color: '#3b82f6', icon: 'fa-water' },
                { label: language === 'de' ? 'Fettmasse' : 'Fat Mass', value: bc.bodyFat, unit: '%', absKg: bc.fatMassKg || (bc.weight && bc.bodyFat ? Math.round((bc.weight * bc.bodyFat / 100) * 10) / 10 : null), color: '#f59e0b', icon: 'fa-droplet' },
                { label: language === 'de' ? 'Proteinmasse' : 'Protein Mass', value: bc.proteinPct, unit: '%', absKg: bc.weight && bc.proteinPct ? Math.round((bc.weight * bc.proteinPct / 100) * 10) / 10 : null, color: '#ec4899', icon: 'fa-dna' },
                { label: language === 'de' ? 'Knochenmasse' : 'Bone Mineral', value: bc.weight && bc.boneMassKg ? Math.round(bc.boneMassKg / bc.weight * 1000) / 10 : 0, unit: '%', absKg: bc.boneMassKg || null, color: '#94a3b8', icon: 'fa-bone' },
              ].filter(i => i.value || i.absKg).map(item => (
                <div key={item.label} className="bg-slate-800/30 rounded-[1.5rem] border border-white/5 p-5 relative overflow-hidden">
                  <div className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: item.color + '15' }}>
                    <i className={`fas ${item.icon} text-xs`} style={{ color: item.color }}></i>
                  </div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">{item.label}</p>
                  {item.absKg != null && (
                    <p className="text-2xl font-black text-white leading-none mb-1">
                      {item.absKg}<span className="text-[10px] text-slate-500 ml-1">kg</span>
                    </p>
                  )}
                  {item.value ? (
                    <p className="text-sm font-black" style={{ color: item.color }}>{item.value}%</p>
                  ) : null}
                  {/* Mini bar */}
                  {item.value ? (
                    <div className="mt-3 h-1.5 bg-slate-800/60 rounded-full overflow-hidden border border-white/5">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(item.value as number, 100)}%`, backgroundColor: item.color + 'AA' }} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Body figure with overlays + labels (Fat/Muscle views) ── */}
        {!isOverview && (
        <div className="relative mx-auto" style={{ maxWidth: 620 }}>
          <svg viewBox="-130 -15 520 440" className="w-full">
            <defs>
              <linearGradient id="bodyFillGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isFatView ? '#f59e0b' : '#22c55e'} stopOpacity="0.12" />
                <stop offset="100%" stopColor={isFatView ? '#f59e0b' : '#22c55e'} stopOpacity="0.04" />
              </linearGradient>
            </defs>

            {/* ── Clean body silhouette (matching reference outline) ── */}
            <g fill="url(#bodyFillGrad)" stroke={`${isFatView ? '#f59e0b' : '#22c55e'}44`} strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round">
              <ellipse cx="130" cy="18" rx="18" ry="22" />
              <rect x="122" y="38" width="16" height="14" rx="4" />
              <path d="M116 52 C108 56 90 62 68 68 C58 72 48 78 42 88 C36 96 34 108 36 118 C34 130 30 148 28 162 C26 174 26 184 30 192 C34 198 40 200 44 196 L46 192 C50 186 56 172 60 156 C64 140 68 122 72 108 L76 96 L74 120 C72 136 72 152 76 168 L82 186 C84 192 88 198 92 204 C96 212 104 220 118 224 L130 226 L142 224 C156 220 164 212 168 204 C172 198 176 192 178 186 L184 168 C188 152 188 136 186 120 L184 96 L188 108 C192 122 196 140 200 156 C204 172 210 186 214 192 L216 196 C220 200 226 198 230 192 C234 184 234 174 232 162 C230 148 226 130 224 118 C226 108 224 96 218 88 C212 78 202 72 192 68 C170 62 152 56 144 52 Z" />
              <path d="M96 224 C92 242 86 268 84 296 C82 320 80 340 82 356 C84 366 90 374 98 378 L120 378 C116 372 114 364 112 356 C110 340 110 320 112 296 C114 268 118 244 118 226 Z" />
              <path d="M164 224 C168 242 174 268 176 296 C178 320 180 340 178 356 C176 366 170 374 162 378 L140 378 C144 372 146 364 148 356 C150 340 150 320 148 296 C146 268 142 244 142 226 Z" />
              <path d="M84 368 C80 374 78 384 82 392 C86 398 96 400 108 400 C116 400 120 394 120 388 L120 378" />
              <path d="M176 368 C180 374 182 384 178 392 C174 398 164 400 152 400 C144 400 140 394 140 388 L140 378" />
            </g>

            {/* ── Segmental overlays ── */}
            {isFatView ? (
              <g>
                {bodyParts.map(bp => {
                  const val = segFat?.[bp.key] || 0;
                  if (!val) return null;
                  const r = 14 + (val / maxVal) * 26;
                  return (
                    <g key={bp.key}>
                      <circle cx={bp.cx} cy={bp.cy} r={r} fill="#f59e0b" fillOpacity="0.12" />
                      <circle cx={bp.cx} cy={bp.cy} r={r * 0.5} fill="#f59e0b" fillOpacity="0.25" />
                    </g>
                  );
                })}
              </g>
            ) : (
              <g>
                {bodyParts.map(bp => {
                  const val = segMuscle?.[bp.key] || 0;
                  if (!val) return null;
                  const r = 14 + (val / maxVal) * 26;
                  return (
                    <g key={bp.key}>
                      <circle cx={bp.cx} cy={bp.cy} r={r} fill="#22c55e" fillOpacity="0.12" />
                      <circle cx={bp.cx} cy={bp.cy} r={r * 0.5} fill="#22c55e" fillOpacity="0.25" />
                    </g>
                  );
                })}
              </g>
            )}

            {/* ── Labels with connecting lines ── */}
            {bodyParts.map(bp => {
              const val = viewData?.[bp.key] || 0;
              if (!val) return null;
              const status = getStatus(val, bp.key);
              const isLeft = bp.lx < 130;
              const lineEndX = isLeft ? bp.lx + 80 : bp.lx;
              const hist = segHistory[bp.key];
              const trendData = isFatView ? hist.fat : hist.muscle;
              const trend = getTrend(trendData, isFatView);
              return (
                <g key={`label-${bp.key}`}>
                  <line x1={bp.cx} y1={bp.cy} x2={lineEndX} y2={bp.ly + 16}
                    stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" strokeDasharray="3 2" />
                  <circle cx={bp.cx} cy={bp.cy} r="3" fill={viewColor} fillOpacity="0.7" />
                  <g transform={`translate(${bp.lx}, ${bp.ly})`}>
                    {status && (
                      <>
                        <circle cx={isLeft ? 76 : 4} cy="6" r="3" fill={status.dot} fillOpacity="0.9" />
                        <text x={isLeft ? 68 : 12} y="9" textAnchor={isLeft ? 'end' : 'start'} fill={status.color} fontSize="7" fontWeight="800" letterSpacing="0.5">{status.text}</text>
                      </>
                    )}
                    <text x={isLeft ? 76 : 4} y="28" textAnchor={isLeft ? 'end' : 'start'} fill="white" fontSize="18" fontWeight="900" letterSpacing="-0.5">
                      {val.toFixed(1)}<tspan fill="#475569" fontSize="9" fontWeight="700"> kg</tspan>
                    </text>
                    <text x={isLeft ? 76 : 4} y="40" textAnchor={isLeft ? 'end' : 'start'} fill="#475569" fontSize="8" fontWeight="700" letterSpacing="0.5">{bp.label}</text>
                    {trend.arrow !== '—' && (
                      <text x={isLeft ? 76 : 4} y="52" textAnchor={isLeft ? 'end' : 'start'} fill={trend.color} fontSize="8" fontWeight="800">
                        {trend.arrow} {trend.delta > 0 ? '+' : ''}{trend.delta.toFixed(2)} kg
                      </text>
                    )}
                  </g>
                </g>
              );
            })}
          </svg>
        </div>
        )}

        {/* ── Per-region trend sparklines with absolute values ── */}
        {!isOverview && hasSegmental && (
          <div className="bg-slate-800/20 rounded-[2rem] border border-white/5 p-6 sm:p-8">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-5">
              <i className="fas fa-chart-line text-violet-400 mr-2"></i>
              {language === 'de' ? 'Verläufe pro Körperteil' : 'Trends per Body Part'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(['leftArm', 'rightArm', 'trunk', 'leftLeg', 'rightLeg'] as const).map(region => {
                const hist = segHistory[region];
                const fat = segFat?.[region] || 0;
                const muscle = segMuscle?.[region] || 0;
                if (!fat && !muscle && hist.muscle.length === 0) return null;
                const label = t[region];
                const sparkData = hist.dates.map((d, i) => ({
                  d: new Date(d).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { day: '2-digit', month: '2-digit' }),
                  m: hist.muscle[i],
                  f: hist.fat[i],
                }));
                const muscleTrend = getTrend(hist.muscle, false);
                const fatTrend = getTrend(hist.fat, true);
                return (
                  <div key={region} className="bg-slate-900/40 rounded-2xl border border-white/5 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[9px] font-black text-white uppercase tracking-widest">{label}</p>
                    </div>
                    {/* Current absolute values */}
                    <div className="flex gap-3 mb-3">
                      {muscle > 0 && (
                        <div className="flex-1 bg-emerald-500/10 rounded-xl px-3 py-2 border border-emerald-500/10">
                          <p className="text-[7px] font-black text-emerald-500/60 uppercase tracking-widest">{t.segMuscle}</p>
                          <p className="text-sm font-black text-emerald-400">{muscle.toFixed(1)}<span className="text-[8px] text-emerald-600 ml-0.5">kg</span>
                            <span className="ml-1.5 text-[9px]" style={{ color: muscleTrend.color }}>{muscleTrend.arrow}</span>
                          </p>
                        </div>
                      )}
                      {fat > 0 && (
                        <div className="flex-1 bg-amber-500/10 rounded-xl px-3 py-2 border border-amber-500/10">
                          <p className="text-[7px] font-black text-amber-500/60 uppercase tracking-widest">{t.segFat}</p>
                          <p className="text-sm font-black text-amber-400">{fat.toFixed(1)}<span className="text-[8px] text-amber-600 ml-0.5">kg</span>
                            <span className="ml-1.5 text-[9px]" style={{ color: fatTrend.color }}>{fatTrend.arrow}</span>
                          </p>
                        </div>
                      )}
                    </div>
                    {sparkData.length >= 2 ? (
                      <div className="h-16">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={sparkData}>
                            <XAxis dataKey="d" hide />
                            <YAxis hide domain={['auto', 'auto']} />
                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.1)', fontSize: 9, fontWeight: 'bold' }} itemStyle={{ color: '#fff' }} />
                            <Line type="monotone" dataKey="m" name={t.segMuscle} stroke="#22c55e" strokeWidth={2} dot={{ r: 1.5 }} />
                            <Line type="monotone" dataKey="f" name={t.segFat} stroke="#f59e0b" strokeWidth={2} dot={{ r: 1.5 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-16 flex items-center justify-center text-slate-600 text-[8px] font-bold italic">
                        {language === 'de' ? 'Mehr Messungen nötig' : 'More data needed'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Composition breakdown (fat/muscle views only) ── */}
        {!isOverview && <div className="bg-slate-800/20 rounded-[2rem] border border-white/5 p-6 sm:p-8">
          {/* Stacked bar */}
          <div className="h-4 rounded-full overflow-hidden flex mb-5 border border-white/5">
            {compItems.map(item => (
              <div key={item.label} className="h-full transition-all"
                style={{ width: `${Math.max(item.value, 2)}%`, background: `linear-gradient(180deg, ${item.color}CC, ${item.color}55)` }}
                title={`${item.label}: ${item.value}%`} />
            ))}
          </div>
          {/* Individual bars — fat last */}
          <div className="space-y-2.5">
            {[...compItems].sort((a, b) => {
              const order = ['fa-dumbbell', 'fa-water', 'fa-dna', 'fa-bone', 'fa-droplet'];
              return order.indexOf(a.icon) - order.indexOf(b.icon);
            }).map(item => (
              <div key={item.label}>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: item.color + '15' }}>
                      <i className={`fas ${item.icon} text-[8px]`} style={{ color: item.color }}></i>
                    </div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{item.label}</span>
                  </div>
                  <span className="text-xs font-black text-white tabular-nums">{item.value}%</span>
                </div>
                <div className="h-2 bg-slate-800/60 rounded-full overflow-hidden border border-white/5">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(item.value, 100)}%`, background: `linear-gradient(90deg, ${item.color}BB, ${item.color}44)` }} />
                </div>
              </div>
            ))}
          </div>
        </div>}

        {/* ── Stat cards ── */}
        {statCards.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {statCards.map(card => (
              <div key={card.label} className="bg-slate-800/25 rounded-2xl border border-white/5 p-3.5 text-center">
                <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-0.5">{card.label}</p>
                <p className="text-base font-black text-white">{card.value}<span className="text-[9px] font-bold text-slate-500 ml-0.5">{card.unit}</span></p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
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
        <div className="max-w-5xl mx-auto w-full px-4 py-3 sm:px-10 sm:py-5 flex items-center gap-3 sm:gap-5 flex-wrap">
          {/* Back button */}
          <button
            onClick={() => { setSelectedCategory(null); setVitalSubType('heartRate'); }}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/5 flex items-center justify-center text-slate-400 hover:bg-indigo-600 hover:text-white transition-all border border-white/10 flex-shrink-0"
          >
            <i className="fas fa-arrow-left text-sm"></i>
          </button>
          {/* Title */}
          <div className={`w-9 h-9 sm:w-10 sm:h-10 ${catInfo.bg.replace('bg-', 'bg-').replace('-50', '-600/20')} ${catInfo.text.replace('text-', 'text-').replace('-500', '-400')} rounded-xl flex items-center justify-center text-base sm:text-lg shadow-lg border border-white/10 flex-shrink-0`}>
            <i className={`fas ${catInfo.icon}`}></i>
          </div>
          <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight uppercase min-w-0 truncate">{catInfo.title}</h2>
          {/* Spacer */}
          <div className="flex-1"></div>
          {/* Time range filter */}
          <div className="flex gap-1 p-0.5 bg-white/5 rounded-xl border border-white/5 flex-shrink-0">
            {[7, 30, 0].map(val => (
              <button
                key={val}
                onClick={() => setTimeRange(val)}
                className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-lg font-black text-[8px] sm:text-[9px] uppercase transition-all ${timeRange === val ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {val === 7 ? t.days7 : val === 30 ? t.days30 : t.daysAll}
              </button>
            ))}
          </div>
          {/* Reset sync */}
          <button
            onClick={onResetSync}
            className="w-9 h-9 sm:w-auto sm:px-4 sm:py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-1 flex-shrink-0"
          >
            <i className="fas fa-unlink text-xs"></i> <span className="hidden sm:inline">{t.resetSync}</span>
          </button>
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
        <div className="fixed inset-x-0 bottom-0 top-14 sm:top-16 z-[200] bg-[#0f172a] flex flex-col animate-fade-in">
          <StickyHeader />
          <div className="flex-grow overflow-y-auto no-scrollbar px-4 sm:px-12 py-4 sm:py-10">
            <div className="max-w-5xl mx-auto w-full space-y-6 sm:space-y-10 pb-32">
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
                <div className="bg-slate-800/30 p-3 sm:p-12 rounded-2xl sm:rounded-[3.5rem] border border-white/5 shadow-2xl backdrop-blur-sm">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: activeOpt.color }}></div>
                    <span className="text-sm font-black text-white uppercase tracking-widest">{activeOpt.label}</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2">{activeReadings.length} {t.readings}</span>
                  </div>
                  <div className="h-[250px] sm:h-[400px]">
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
              <div className="bg-slate-800/20 rounded-2xl sm:rounded-[3rem] border border-white/5 shadow-2xl overflow-hidden backdrop-blur-sm">
                <div className="p-5 sm:p-10 border-b border-white/5 bg-white/2 flex items-center justify-between">
                  <h3 className="text-base sm:text-xl font-black text-white uppercase tracking-tight">{t.history}</h3>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{activeReadings.length} {t.readings}</span>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto no-scrollbar">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-[#1e293b] z-10">
                      <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        <th className="px-4 sm:px-10 py-4 sm:py-6">{t.date}</th>
                        <th className="px-4 sm:px-10 py-4 sm:py-6">{t.value}</th>
                        <th className="px-4 sm:px-10 py-4 sm:py-6">{t.source}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {[...activeReadings].reverse().slice(0, 500).map((reading: any, idx: number) => (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 sm:px-10 py-3 sm:py-5 text-sm font-bold text-slate-300">{fmtTimeFull(reading.time)}</td>
                          <td className="px-4 sm:px-10 py-3 sm:py-5 text-sm font-black" style={{ color: activeOpt.color }}>
                            {isBP ? `${reading.systolic}/${reading.diastolic} ${activeOpt.unit}` : `${reading.value} ${activeOpt.unit}`}
                          </td>
                          <td className="px-4 sm:px-10 py-3 sm:py-5 text-sm font-bold text-slate-500">{formatSource(getReadingSource(vitalSubType as keyof HealthReadings))}</td>
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
        ...stepReadings.map((s: any) => ({ time: s.time, label: `${s.count.toLocaleString()} Schritte`, type: 'steps', source: getReadingSource('steps') })),
        ...calReadings.map((c: any) => ({ time: c.time, label: `${Math.round(c.kilocalories)} kcal`, type: 'cal', source: getReadingSource('calories') })),
        ...distReadings.map((d: any) => ({ time: d.time, label: `${(d.meters / 1000).toFixed(2)} km`, type: 'dist', source: getReadingSource('distance') })),
      ].sort((a, b) => b.time.localeCompare(a.time));

      return (
        <div className="fixed inset-x-0 bottom-0 top-14 sm:top-16 z-[200] bg-[#0f172a] flex flex-col animate-fade-in">
          <StickyHeader />
          <div className="flex-grow overflow-y-auto no-scrollbar px-4 sm:px-12 py-4 sm:py-10">
            <div className="max-w-5xl mx-auto w-full space-y-6 sm:space-y-10 pb-32">
              {/* Daily aggregated chart */}
              <div className="bg-slate-800/30 p-3 sm:p-12 rounded-2xl sm:rounded-[3.5rem] border border-white/5 shadow-2xl backdrop-blur-sm h-[280px] sm:h-[450px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={filteredMetrics}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="dateStr" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b', fontWeight: 'bold'}} />
                    <YAxis yAxisId="steps" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                    <YAxis yAxisId="energy" orientation="right" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#f97316'}} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 'bold', color: '#fff' }}
                      formatter={(value: number, name: string) => {
                        if (name === t.distance) return [`${value} m`, name];
                        return [value, name];
                      }}
                    />
                    <Bar yAxisId="steps" dataKey="steps" fill="#f97316" radius={[8, 8, 0, 0]} name="Schritte" />
                    <Line yAxisId="energy" type="monotone" dataKey="activeEnergy" stroke="#f59e0b" strokeWidth={3} dot={false} name="kcal" />
                    <Line yAxisId="steps" type="monotone" dataKey="distance" stroke="#3b82f6" strokeWidth={2} dot={false} name={t.distance} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Individual readings table */}
              <div className="bg-slate-800/20 rounded-2xl sm:rounded-[3rem] border border-white/5 shadow-2xl overflow-hidden backdrop-blur-sm">
                <div className="p-5 sm:p-10 border-b border-white/5 bg-white/2 flex items-center justify-between">
                  <h3 className="text-base sm:text-xl font-black text-white uppercase tracking-tight">{t.history}</h3>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{activityReadings.length} {t.readings}</span>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto no-scrollbar">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-[#1e293b] z-10">
                      <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        <th className="px-4 sm:px-10 py-4 sm:py-6">{t.date}</th>
                        <th className="px-4 sm:px-10 py-4 sm:py-6">{t.value}</th>
                        <th className="px-4 sm:px-10 py-4 sm:py-6">{t.source}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {activityReadings.slice(0, 500).map((reading, idx) => (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 sm:px-10 py-3 sm:py-5 text-sm font-bold text-slate-300">{fmtTimeFull(reading.time)}</td>
                          <td className="px-4 sm:px-10 py-3 sm:py-5 text-sm font-black text-orange-400">{reading.label}</td>
                          <td className="px-4 sm:px-10 py-3 sm:py-5 text-sm font-bold text-slate-500">{formatSource((reading as any).source)}</td>
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
        <div className="fixed inset-x-0 bottom-0 top-14 sm:top-16 z-[200] bg-[#0f172a] flex flex-col animate-fade-in">
          <StickyHeader />
          <div className="flex-grow overflow-y-auto no-scrollbar px-4 sm:px-12 py-4 sm:py-10">
            <div className="max-w-5xl mx-auto w-full space-y-6 sm:space-y-10 pb-32">
              {/* Weight chart */}
              <div className="bg-slate-800/30 p-3 sm:p-12 rounded-2xl sm:rounded-[3.5rem] border border-white/5 shadow-2xl backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-8">
                  <span className="text-sm font-black text-white uppercase tracking-widest">{t.weight}</span>
                  {hasReadings && <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2">{weightReadings.length} {t.readings}</span>}
                </div>
                <div className="h-[250px] sm:h-[400px]">
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
              <div className="bg-slate-800/20 rounded-2xl sm:rounded-[3rem] border border-white/5 shadow-2xl overflow-hidden backdrop-blur-sm">
                <div className="p-5 sm:p-10 border-b border-white/5 bg-white/2 flex items-center justify-between">
                  <h3 className="text-base sm:text-xl font-black text-white uppercase tracking-tight">{t.history}</h3>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{hasReadings ? weightReadings.length : filteredMetrics.filter(m => m.weight).length} {t.readings}</span>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto no-scrollbar">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-[#1e293b] z-10">
                      <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        <th className="px-4 sm:px-10 py-4 sm:py-6">{t.date}</th>
                        <th className="px-4 sm:px-10 py-4 sm:py-6">{t.value}</th>
                        <th className="px-4 sm:px-10 py-4 sm:py-6">{t.source}</th>
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
                                <td className="px-4 sm:px-10 py-3 sm:py-5 text-sm font-bold text-slate-300">{fmtTimeFull(w.time)}</td>
                                <td className="px-4 sm:px-10 py-3 sm:py-5 text-sm font-black text-slate-400">{parts.join(' / ')}</td>
                                <td className="px-4 sm:px-10 py-3 sm:py-5 text-sm font-bold text-slate-500">{formatSource(getReadingSource('weight'))}</td>
                              </tr>
                            );
                          })
                        : [...filteredMetrics].reverse().filter(m => m.weight).map((m, idx) => (
                            <tr key={idx} className="hover:bg-white/5 transition-colors">
                              <td className="px-4 sm:px-10 py-3 sm:py-5 text-sm font-bold text-slate-300">{(m as any).fullDateStr}</td>
                              <td className="px-4 sm:px-10 py-3 sm:py-5 text-sm font-black text-slate-400">
                                {[m.weight && `${m.weight} kg`, m.bodyFat && `${m.bodyFat}% Fett`, m.bmi && `BMI ${m.bmi}`].filter(Boolean).join(' / ')}
                              </td>
                              <td className="px-4 sm:px-10 py-3 sm:py-5 text-sm font-bold text-slate-500">{formatSource(getMetricSource(m, 'weight') || getMetricSource(m, 'bodyFat'))}</td>
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

    // ── Body Comp detail (scale measurements + body silhouette) ──
    if (selectedCategory === 'bodycomp') {
      return (
        <div className="fixed inset-x-0 bottom-0 top-14 sm:top-16 z-[200] bg-[#0f172a] flex flex-col animate-fade-in">
          <StickyHeader />
          <div className="flex-grow overflow-y-auto no-scrollbar px-4 sm:px-12 py-4 sm:py-10">
            <div className="max-w-5xl mx-auto w-full space-y-6 sm:space-y-10 pb-32">

              {/* Body silhouette + composition breakdown */}
              <div className="bg-slate-800/30 p-4 sm:p-12 rounded-2xl sm:rounded-[3.5rem] border border-white/5 shadow-2xl backdrop-blur-sm">
                <BodyCompositionVisual />
              </div>

              {/* Trend chart */}
              <div className="bg-slate-800/30 p-3 sm:p-12 rounded-2xl sm:rounded-[3.5rem] border border-white/5 shadow-2xl backdrop-blur-sm h-[250px] sm:h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={filteredMetrics.filter(m => m.musclePct || m.bodyFat || m.waterPct)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="dateStr" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b', fontWeight: 'bold'}} />
                    <YAxis yAxisId="pct" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#8b5cf6'}} domain={[0, 80]} />
                    <YAxis yAxisId="score" orientation="right" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#10b981'}} domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 'bold', color: '#fff' }} />
                    <Line yAxisId="pct" type="monotone" dataKey="musclePct" name={t.musclePct} stroke="#8b5cf6" strokeWidth={3} dot={{r: 3}} />
                    <Line yAxisId="pct" type="monotone" dataKey="bodyFat" name={t.fatMass} stroke="#f59e0b" strokeWidth={3} dot={{r: 3}} />
                    <Line yAxisId="pct" type="monotone" dataKey="waterPct" name={t.waterPct} stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line yAxisId="score" type="monotone" dataKey="healthScore" name={t.healthScore} stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* History table */}
              <div className="bg-slate-800/20 rounded-2xl sm:rounded-[3rem] border border-white/5 shadow-2xl overflow-hidden backdrop-blur-sm">
                <div className="p-5 sm:p-10 border-b border-white/5 bg-white/2">
                  <h3 className="text-base sm:text-xl font-black text-white uppercase tracking-tight">{t.history}</h3>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto no-scrollbar">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-[#1e293b] z-10">
                      <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        <th className="px-4 sm:px-10 py-4 sm:py-6">{t.date}</th>
                        <th className="px-4 sm:px-10 py-4 sm:py-6">{t.value}</th>
                        <th className="px-4 sm:px-10 py-4 sm:py-6">{t.source}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {[...filteredMetrics].reverse().filter(m => m.musclePct || m.bodyFat || m.waterPct).map((m, idx) => {
                        const parts = [
                          m.musclePct ? `${m.musclePct}% ${t.musclePct}` : null,
                          m.waterPct ? `${m.waterPct}% ${t.waterPct}` : null,
                          m.visceralFat ? `${t.visceralFat} ${m.visceralFat}` : null,
                          m.bmr ? `${m.bmr} kcal ${t.bmr}` : null,
                          m.bodyAge ? `${t.bodyAge} ${m.bodyAge}` : null,
                          m.healthScore ? `${t.healthScore} ${m.healthScore}` : null,
                        ].filter(Boolean);
                        return (
                          <tr key={idx} className="hover:bg-white/5 transition-colors">
                            <td className="px-4 sm:px-10 py-3 sm:py-5 text-sm font-bold text-slate-300">{(m as any).fullDateStr}</td>
                            <td className="px-4 sm:px-10 py-3 sm:py-5 text-sm font-black text-slate-400">{parts.join(' / ')}</td>
                            <td className="px-4 sm:px-10 py-3 sm:py-5 text-sm font-bold text-slate-500">{formatSource(getMetricSource(m, 'bodyFat'))}</td>
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
        <div className="fixed inset-x-0 bottom-0 top-14 sm:top-16 z-[200] bg-[#0f172a] flex flex-col animate-fade-in">
          <StickyHeader />
          <div className="flex-grow overflow-y-auto no-scrollbar px-4 sm:px-12 py-4 sm:py-10">
            <div className="max-w-5xl mx-auto w-full space-y-6 sm:space-y-10 pb-32">
              <div className="bg-slate-800/30 p-3 sm:p-12 rounded-2xl sm:rounded-[3.5rem] border border-white/5 shadow-2xl backdrop-blur-sm h-[280px] sm:h-[450px]">
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

              <div className="bg-slate-800/20 rounded-2xl sm:rounded-[3rem] border border-white/5 shadow-2xl overflow-hidden backdrop-blur-sm">
                <div className="p-5 sm:p-10 border-b border-white/5 bg-white/2">
                  <h3 className="text-base sm:text-xl font-black text-white uppercase tracking-tight">{t.history}</h3>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto no-scrollbar">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-[#1e293b] z-10">
                      <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        <th className="px-4 sm:px-10 py-4 sm:py-6">{t.date}</th>
                        <th className="px-4 sm:px-10 py-4 sm:py-6">{t.value}</th>
                        <th className="px-4 sm:px-10 py-4 sm:py-6">{t.source}</th>
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
                            <td className="px-4 sm:px-10 py-3 sm:py-5 text-sm font-bold text-slate-300">{(m as any).fullDateStr}</td>
                            <td className="px-4 sm:px-10 py-3 sm:py-5 text-sm font-black text-slate-400">{parts.join(' / ')}</td>
                            <td className="px-4 sm:px-10 py-3 sm:py-5 text-sm font-bold text-slate-500">{formatSource(getMetricSource(m, 'sleepHours'))}</td>
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
    <div className="bg-[#1a1f26] rounded-2xl sm:rounded-[2.5rem] p-6 sm:p-12 text-center border border-white/5 shadow-2xl space-y-8 animate-fade-in">
      <div className="w-16 h-16 sm:w-24 sm:h-24 bg-indigo-600/10 text-indigo-400 rounded-3xl flex items-center justify-center text-2xl sm:text-4xl mx-auto border border-indigo-500/20 shadow-xl shadow-indigo-600/10"><i className="fas fa-file-medical"></i></div>
      <div className="max-w-md mx-auto space-y-4">
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">{t.noSync}</h2>
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
        <div className="fixed inset-0 z-[150] bg-[#0f172a]/80 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 animate-fade-in transition-all">
          <div className="bg-[#1a1f26] rounded-2xl sm:rounded-[3rem] p-5 sm:p-10 max-w-xl w-full shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10 animate-scale-in relative text-white">
            <button 
              onClick={() => setSelectedInsight(null)} 
              className="absolute top-8 right-8 w-12 h-12 rounded-2xl bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all border border-white/5"
            >
              <i className="fas fa-times text-xl"></i>
            </button>
            <div className={`w-16 h-16 ${getInsightStyle(selectedInsight).bg.replace('bg-', 'bg-').replace('-50', '-600/20')} ${getInsightStyle(selectedInsight).text.replace('text-', 'text-').replace('-600', '-400')} rounded-[1.25rem] border border-white/5 flex items-center justify-center text-3xl mb-8 shadow-xl`}>
              <i className={`fas ${getInsightStyle(selectedInsight).icon}`}></i>
            </div>
            <h3 className="text-xl sm:text-3xl font-black text-white mb-6 tracking-tighter uppercase">{selectedInsight.title}</h3>
            <div className="p-4 sm:p-8 bg-slate-800/50 rounded-xl sm:rounded-[2rem] border border-white/5 mb-8 italic">
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
      <div className="bg-[#1a1f26] p-5 sm:p-10 rounded-2xl sm:rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 p-10 opacity-5 text-9xl pointer-events-none translate-x-4 transition-transform hover:-rotate-12 duration-1000"><i className="fas fa-wand-magic-sparkles text-white"></i></div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-6 sm:mb-10 relative z-10">
          <div>
            <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Health Intelligence</p>
            <h3 className="text-xl sm:text-3xl font-black flex items-center gap-4 tracking-tighter text-white uppercase">{t.checkup}</h3>
          </div>
          <div className="flex flex-wrap gap-3">
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
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-48 min-w-[240px] sm:min-w-[280px] bg-slate-800/50 rounded-[2rem] flex-shrink-0 border border-white/5"></div>)}
          </div>
        ) : (
          <div className="relative">
            {/* Carousel Container — mouse-drag enabled for desktop */}
            <div
              className="flex overflow-x-auto gap-5 pb-10 px-2 snap-x snap-mandatory no-scrollbar mask-fade-edges-x cursor-grab active:cursor-grabbing select-none"
              onMouseDown={(e) => {
                const el = e.currentTarget;
                const startX = e.pageX - el.offsetLeft;
                const scrollLeft = el.scrollLeft;
                el.style.scrollSnapType = 'none';
                const onMove = (ev: MouseEvent) => { ev.preventDefault(); el.scrollLeft = scrollLeft - (ev.pageX - el.offsetLeft - startX); };
                const onUp = () => { el.style.scrollSnapType = 'x mandatory'; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              }}
            >
              {insights.length > 0 ? insights.map((insight, idx) => {
                const style = getInsightStyle(insight);
                const impactColor = insight.impact === 'positive' ? 'emerald' : insight.impact === 'negative' ? 'amber' : 'blue';
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedInsight(insight)}
                    className={`flex-shrink-0 snap-start flex flex-col gap-5 p-8 w-[260px] sm:w-[340px] lg:w-[380px] bg-slate-800/30 border border-white/5 rounded-[3rem] transition-all hover:bg-slate-800/50 hover:border-white/10 hover:shadow-2xl active:scale-[0.98] group relative overflow-hidden`}
                  >
                    <div className={`absolute top-0 right-0 p-5 bg-${impactColor}-500/10 text-${impactColor}-400 rounded-bl-[2rem] border-l border-b border-white/5 transition-colors group-hover:bg-${impactColor}-500/20`}>
                       <i className={`fas ${style.impactInfo.icon} text-xl`}></i>
                    </div>

                    <div className="flex items-center gap-5">
                      <div className={`w-14 h-14 bg-indigo-600/10 text-indigo-400 rounded-2xl flex items-center justify-center text-2xl border border-indigo-500/20 shadow-xl group-hover:scale-110 transition-transform`}>
                        <i className={`fas ${style.icon}`}></i>
                      </div>
                      <div className="text-left pr-12">
                        <p className={`text-lg font-black tracking-tight leading-tight text-white group-hover:text-indigo-400 transition-colors line-clamp-2`}>{insight.title}</p>
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
                  <p className="text-sm font-bold italic text-center max-w-sm tracking-wide leading-relaxed">{language === 'de' ? `Klicke oben auf "${t.update}", um personalisierte Insights zu generieren.` : `Click "${t.update}" above to generate personalized insights.`}</p>
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

      {/* Correlation Insights — collapsible */}
      <div className="bg-[#1a1f26] p-5 sm:p-10 rounded-2xl sm:rounded-[2.5rem] border border-white/5 shadow-2xl">
        <div
          onClick={() => setCorrelationExpanded(!correlationExpanded)}
          className="flex items-center justify-between cursor-pointer group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600/10 text-indigo-400 rounded-2xl flex items-center justify-center text-xl border border-indigo-500/20 shadow-xl">
              <i className="fas fa-diagram-project"></i>
            </div>
            <div>
              <h4 className="text-lg sm:text-2xl font-black text-white tracking-tight uppercase group-hover:text-indigo-400 transition-colors">{t.correlationTitle}</h4>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">
                {correlationInsights && correlationInsights.length > 0
                  ? `${correlationInsights.length} ${language === 'de' ? 'Zusammenhänge' : 'correlations'}`
                  : language === 'de' ? 'Metrik-Zusammenhänge' : 'Metric relationships'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!correlationExpanded && onAnalyzeCorrelations && (
              <button
                onClick={(e) => { e.stopPropagation(); onAnalyzeCorrelations(); setCorrelationExpanded(true); }}
                disabled={isAnalyzingCorrelations}
                className="px-4 sm:px-6 py-2.5 sm:py-3 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/20 rounded-2xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed hidden sm:block"
              >
                {isAnalyzingCorrelations ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-magnifying-glass-chart"></i>}
              </button>
            )}
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-slate-800 border border-white/5 text-slate-500 group-hover:text-white flex items-center justify-center transition-all">
              <i className={`fas fa-chevron-${correlationExpanded ? 'up' : 'down'} text-xs sm:text-sm`}></i>
            </div>
          </div>
        </div>

        {correlationExpanded && (
        <div className="mt-6 sm:mt-8 space-y-6">
          {onAnalyzeCorrelations && (
            <button
              onClick={onAnalyzeCorrelations}
              disabled={isAnalyzingCorrelations}
              className="px-6 py-3 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/20 rounded-2xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isAnalyzingCorrelations ? (
                <span className="flex items-center gap-2">
                  <i className="fas fa-spinner fa-spin"></i>
                  {t.analyzingCorrelations}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <i className="fas fa-magnifying-glass-chart"></i>
                  {t.analyzeCorrelations}
                </span>
              )}
            </button>
          )}

        {correlationInsights && correlationInsights.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {correlationInsights.map((ci, idx) => {
              const barColor = ci.impact === 'positive' ? 'bg-emerald-500' : ci.impact === 'negative' ? 'bg-red-500' : 'bg-amber-500';
              const barBgColor = ci.impact === 'positive' ? 'bg-emerald-500/10' : ci.impact === 'negative' ? 'bg-red-500/10' : 'bg-amber-500/10';
              const strengthLabel = ci.strength === 'strong' ? t.strong : ci.strength === 'moderate' ? t.moderate : t.weak;
              const directionLabel = ci.direction === 'positive' ? t.positive : t.negative;
              const strengthColor = ci.strength === 'strong' ? 'bg-white/10 text-white' : ci.strength === 'moderate' ? 'bg-white/5 text-slate-300' : 'bg-white/5 text-slate-500';
              const barWidth = Math.round(Math.abs(ci.correlation) * 100);

              return (
                <div key={idx} className="bg-white/5 rounded-xl sm:rounded-[2rem] p-4 sm:p-6 border border-white/10 flex flex-col gap-4 transition-transform hover:scale-[1.01]">
                  <h5 className="text-lg font-black text-white tracking-tight leading-tight">{ci.title}</h5>

                  {/* Correlation bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{directionLabel} &middot; r={ci.correlation.toFixed(2)}</span>
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${strengthColor}`}>{strengthLabel}</span>
                    </div>
                    <div className={`w-full h-2 rounded-full ${barBgColor}`}>
                      <div className={`h-2 rounded-full ${barColor} transition-all duration-500`} style={{ width: `${barWidth}%` }}></div>
                    </div>
                  </div>

                  {/* Metric pair */}
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                    <span className="px-3 py-1.5 bg-white/5 rounded-xl border border-white/5">{ci.metricA}</span>
                    <span className="text-indigo-400">&harr;</span>
                    <span className="px-3 py-1.5 bg-white/5 rounded-xl border border-white/5">{ci.metricB}</span>
                  </div>

                  {/* Explanation */}
                  <p className="text-sm text-slate-400 leading-relaxed">{ci.explanation}</p>

                  {/* Recommendation */}
                  <div className="bg-indigo-600/10 border border-indigo-500/10 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <i className="fas fa-lightbulb text-indigo-400 text-xs"></i>
                      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{t.recommendation}</span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">{ci.actionable}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 sm:py-16 px-6 sm:px-10 bg-slate-800/20 border-2 border-dashed border-white/5 rounded-2xl sm:rounded-[3.5rem] w-full flex flex-col items-center justify-center gap-6 text-slate-500">
            <i className="fas fa-diagram-project text-5xl opacity-10 text-indigo-500"></i>
            <p className="text-sm font-bold italic text-center max-w-sm tracking-wide leading-relaxed">{t.noCorrelations}</p>
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
          <div className="bg-[#1a1f26] p-5 sm:p-10 rounded-2xl sm:rounded-[2.5rem] border border-white/5 shadow-2xl">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-violet-600/10 text-violet-400 rounded-2xl flex items-center justify-center text-xl border border-violet-500/20 shadow-xl"><i className="fas fa-person-rays"></i></div>
              <div>
                <h4 className="text-lg sm:text-2xl font-black text-white tracking-tight uppercase">{t.bodyComp}</h4>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">{language === 'de' ? 'Aktuelle Messwerte' : 'Latest Readings'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {items.map(item => (
                <div key={item.label} className={`${item.bg} rounded-xl sm:rounded-[2rem] p-4 sm:p-6 text-center border border-white/5 transition-transform hover:scale-[1.03]`}>
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
        {(() => {
          // Build vitals sparkline from actual readings (matching detail view)
          const hrReadings = healthData?.readings?.heartRate || [];
          const cutoff14 = new Date(); cutoff14.setDate(cutoff14.getDate() - 14);
          const recentHr = hrReadings.filter(r => new Date(r.time) >= cutoff14);
          const vitalSparkline = downsample(recentHr.map(r => ({ value: r.value })), 50);
          // Fallback to daily metrics if no readings available
          const vitalData = vitalSparkline.length > 0
            ? vitalSparkline
            : formattedMetrics.filter(m => m.restingHeartRate).slice(-14).map(m => ({ value: m.restingHeartRate }));

          return [
            { cat: 'steps', title: t.steps, icon: 'fa-shoe-prints', color: '#f97316', bg: 'bg-orange-600/10', text: 'text-orange-400', data: formattedMetrics.slice(-14), key: 'steps', chartType: 'bar' as const, hasData: formattedMetrics.some(m => m.steps) },
            { cat: 'vitals', title: t.vitals, icon: 'fa-heart-pulse', color: '#ef4444', bg: 'bg-red-600/10', text: 'text-red-400', data: vitalData, key: 'value', chartType: 'line' as const, hasData: vitalData.length > 0 },
            { cat: 'weight', title: t.weightTrend, icon: 'fa-weight-scale', color: '#4f46e5', bg: 'bg-indigo-600/10', text: 'text-indigo-400', data: formattedMetrics.filter(m => m.weight).slice(-14), key: 'weight', chartType: 'area' as const, hasData: formattedMetrics.some(m => m.weight) },
            { cat: 'bodycomp', title: t.bodyComp, icon: 'fa-person-rays', color: '#8b5cf6', bg: 'bg-violet-600/10', text: 'text-violet-400', data: formattedMetrics.filter(m => m.bodyFat || m.musclePct).slice(-14), key: 'bodyFat', chartType: 'body' as const, hasData: formattedMetrics.some(m => m.bodyFat || m.musclePct) },
            { cat: 'regeneration', title: t.regeneration, icon: 'fa-bed', color: '#6366f1', bg: 'bg-indigo-600/10', text: 'text-indigo-400', data: formattedMetrics.slice(-14), key: 'sleepHours', chartType: 'bar' as const, hasData: formattedMetrics.some(m => m.sleepHours) },
          ];
        })().filter(item => item.hasData).map(item => (
          <div key={item.cat} onClick={() => setSelectedCategory(item.cat as any)} className="bg-[#1a1f26] p-5 sm:p-8 rounded-2xl sm:rounded-[2.5rem] border border-white/5 shadow-2xl hover:bg-slate-800/50 transition-all cursor-pointer group hover:scale-[1.02] active:scale-[0.98]">
            <div className="flex justify-between items-start mb-8">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">{t.activity}</p>
                <h4 className="text-xl font-black text-white tracking-tighter uppercase">{item.title}</h4>
              </div>
              <div className={`w-11 h-11 ${item.bg} ${item.text} rounded-2xl flex items-center justify-center text-xl border border-white/5 group-hover:scale-110 group-hover:bg-opacity-20 transition-all`}><i className={`fas ${item.icon}`}></i></div>
            </div>
            <div className="h-44 w-full pointer-events-none mb-2">
              {item.chartType === 'body' ? (
                <BodyCompositionVisual compact />
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                {item.chartType === 'bar' ? (
                  <BarChart data={item.data}>
                    <YAxis domain={[0, 'auto']} hide />
                    <Bar dataKey={item.key} fill={item.color} radius={[6, 6, 0, 0]} opacity={0.8} />
                  </BarChart>
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
                    <YAxis domain={['dataMin - 5', 'dataMax + 5']} hide />
                    <Line type="monotone" dataKey={item.key} stroke={item.color} strokeWidth={3} dot={false} strokeLinecap="round" />
                  </LineChart>
                )}
              </ResponsiveContainer>
              )}
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
