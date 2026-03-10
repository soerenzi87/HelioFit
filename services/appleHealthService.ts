
import { HealthData, HealthMetricEntry } from "../types";
import JSZip from "jszip";

/**
 * Parsed Apple Health Datumsformate (Standard & CDA).
 */
const parseAppleDate = (dateStr: string | undefined | null): Date | null => {
  if (!dateStr) return null;
  const clean = dateStr.trim();

  // CDA Format: 20260218080400+0100
  const cdaMatch = clean.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?/);
  if (cdaMatch && clean.length >= 8) {
    const [, y, m, d, hh, mm, ss] = cdaMatch;
    const date = new Date(`${y}-${m}-${d}T${hh || "00"}:${mm || "00"}:${ss || "00"}`);
    return isNaN(date.getTime()) ? null : date;
  }

  // Standard Export Format: 2025-09-12 09:57:35 +0100
  let normalized = clean;
  if (normalized.includes(' ') && normalized.indexOf('-') === 4) {
    normalized = normalized.replace(' ', 'T');
  }
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
};

interface TimedValue {
  t: number; // Timestamp
  v: number; // Value
}

interface DailyAggregator {
  steps: number;
  heartRates: number[];
  hrvs: number[];
  sleepMs: number;
  weights: TimedValue[];
  bodyFats: TimedValue[];
  leanBodyMass: TimedValue[];
  oxygenSats: number[];
  respRates: number[];
  vo2Maxes: number[];
  activeEnergy: number;
}

/**
 * Extrem robuster Attribut-Extraktor
 */
function getAttr(tagStr: string, name: string): string | null {
  const pattern = new RegExp(`${name}\\s*=\\s*["']?([^"'>\\s/]+)["']?`, 'i');
  const match = tagStr.match(pattern);
  return match ? match[1] : null;
}

export const parseAppleHealthXML = async (
  xmlString: string, 
  fileName: string
): Promise<Record<string, DailyAggregator>> => {
  console.log(`[HealthParser] Starte Analyse: ${fileName}...`);
  
  const dailyData: Record<string, DailyAggregator> = {};
  const historyLimit = new Date();
  historyLimit.setFullYear(historyLimit.getFullYear() - 15);

  const addMetric = (type: string | null, date: Date | null, value: number | null, unit: string | null = null, durationMs: number = 0) => {
    if (!type || !date || date < historyLimit) return;
    
    // Automatische Einheiten-Korrektur (lb -> kg)
    let finalValue = value ?? 0;
    if (unit?.toLowerCase() === 'lb') {
      finalValue = finalValue / 2.20462;
    }

    const dateKey = date.toISOString().split('T')[0];
    if (!dailyData[dateKey]) {
      dailyData[dateKey] = { 
        steps: 0, heartRates: [], hrvs: [], sleepMs: 0, weights: [], 
        bodyFats: [], leanBodyMass: [], oxygenSats: [], respRates: [], 
        vo2Maxes: [], activeEnergy: 0 
      };
    }

    const lowType = type.toLowerCase();
    const timestamp = date.getTime();

    // Mapping Logik
    if (lowType.includes("stepcount")) {
      dailyData[dateKey].steps += Math.round(finalValue);
    } else if (lowType.includes("heartratevariability") || lowType.includes("sdnn") || lowType.includes("hrv")) {
      dailyData[dateKey].hrvs.push(finalValue);
    } else if (lowType.includes("heartrate") || lowType.includes("herzfrequenz")) {
      dailyData[dateKey].heartRates.push(finalValue);
    } else if ((lowType.includes("bodymass") || lowType.includes("weight") || lowType.includes("gewicht")) && 
               !lowType.includes("percentage") && !lowType.includes("index")) {
      dailyData[dateKey].weights.push({ t: timestamp, v: finalValue });
    } else if (lowType.includes("bodyfat") || lowType.includes("body_fat") || (lowType.includes("bodymass") && lowType.includes("percentage"))) {
      dailyData[dateKey].bodyFats.push({ t: timestamp, v: finalValue <= 1 ? finalValue * 100 : finalValue });
    } else if (lowType.includes("leanbodymass")) {
      dailyData[dateKey].leanBodyMass.push({ t: timestamp, v: finalValue });
    } else if (lowType.includes("sleep") || lowType.includes("schlaf")) {
      // Schlaf ist oft ein Zeitfenster. Wenn durationMs vorhanden ist, nutzen wir diese.
      // Apple Health Schlaf-Export nutzt oft endDate - startDate
      dailyData[dateKey].sleepMs += durationMs > 0 ? durationMs : (finalValue * 3600000);
    } else if (lowType.includes("activeenergy") || lowType.includes("aktivenergie")) {
      dailyData[dateKey].activeEnergy += finalValue;
    } else if (lowType.includes("oxygensaturation") || lowType.includes("sauerstoff")) {
      dailyData[dateKey].oxygenSats.push(finalValue <= 1 ? finalValue * 100 : finalValue);
    } else if (lowType.includes("respiratoryrate") || lowType.includes("atemfrequenz")) {
      dailyData[dateKey].respRates.push(finalValue);
    } else if (lowType.includes("vo2max")) {
      dailyData[dateKey].vo2Maxes.push(finalValue);
    }
  };

  // Wir nutzen einen etwas performanteren Split-Ansatz für riesige Dateien
  const tags = xmlString.split(/<(?=[a-zA-Z])/);
  let recordCount = 0;

  tags.forEach(tagContent => {
    const tagNameMatch = tagContent.match(/^([a-zA-Z0-9:.-]+)/);
    if (!tagNameMatch) return;
    
    const tagName = tagNameMatch[1].toLowerCase();
    if (tagName === 'record' || tagName === 'workout') {
      const type = getAttr(tagContent, 'type');
      const startStr = getAttr(tagContent, 'startDate');
      const endStr = getAttr(tagContent, 'endDate');
      const valStr = getAttr(tagContent, 'value');
      const unit = getAttr(tagContent, 'unit');
      
      if (type && startStr) {
        const date = parseAppleDate(startStr);
        const endDate = parseAppleDate(endStr);
        const val = valStr ? parseFloat(valStr.replace(',', '.')) : null;
        const duration = (date && endDate) ? (endDate.getTime() - date.getTime()) : 0;
        
        addMetric(type, date, val, unit, duration);
        recordCount++;
      }
    }
  });

  console.log(`[HealthParser] Analyse abgeschlossen: ${recordCount} Datensätze.`);
  return dailyData;
};

export const processAppleHealthFile = async (file: File): Promise<HealthData> => {
  const combinedDailyData: Record<string, DailyAggregator> = {};

  const mergeData = (fileData: Record<string, DailyAggregator>) => {
    Object.entries(fileData).forEach(([date, data]) => {
      if (!combinedDailyData[date]) combinedDailyData[date] = data;
      else {
        combinedDailyData[date].steps += data.steps;
        combinedDailyData[date].heartRates.push(...data.heartRates);
        combinedDailyData[date].hrvs.push(...data.hrvs);
        combinedDailyData[date].sleepMs += data.sleepMs;
        combinedDailyData[date].weights.push(...data.weights);
        combinedDailyData[date].bodyFats.push(...data.bodyFats);
        combinedDailyData[date].leanBodyMass.push(...data.leanBodyMass);
        combinedDailyData[date].oxygenSats.push(...data.oxygenSats);
        combinedDailyData[date].respRates.push(...data.respRates);
        combinedDailyData[date].vo2Maxes.push(...data.vo2Maxes);
        combinedDailyData[date].activeEnergy += data.activeEnergy;
      }
    });
  };

  if (file.name.toLowerCase().endsWith('.zip')) {
    const zip = new JSZip();
    const contents = await zip.loadAsync(file);
    const xmlFiles = Object.keys(contents.files).filter(n => n.toLowerCase().endsWith('.xml'));
    for (const xmlFileName of xmlFiles) {
      const xmlFile = contents.file(xmlFileName);
      if (xmlFile) {
        const xmlString = await xmlFile.async("string");
        const fileData = await parseAppleHealthXML(xmlString, xmlFileName);
        mergeData(fileData);
      }
    }
  } else {
    const xmlString = await file.text();
    const fileData = await parseAppleHealthXML(xmlString, file.name);
    mergeData(fileData);
  }

  const metrics: HealthMetricEntry[] = Object.entries(combinedDailyData).map(([date, data]) => {
    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : undefined;
    
    const getLatest = (arr: TimedValue[]) => {
      if (arr.length === 0) return undefined;
      return arr.reduce((prev, curr) => (curr.t > prev.t ? curr : prev)).v;
    };
    
    return {
      date: new Date(date).toISOString(),
      steps: data.steps > 0 ? data.steps : undefined,
      restingHeartRate: avg(data.heartRates),
      hrv: avg(data.hrvs),
      sleepHours: data.sleepMs > 0 ? parseFloat((data.sleepMs / 3600000).toFixed(1)) : undefined,
      weight: getLatest(data.weights),
      bodyFat: getLatest(data.bodyFats),
      leanBodyMass: getLatest(data.leanBodyMass),
      oxygenSaturation: avg(data.oxygenSats),
      respiratoryRate: avg(data.respRates),
      vo2Max: avg(data.vo2Maxes),
      activeEnergy: data.activeEnergy > 0 ? Math.round(data.activeEnergy) : undefined,
    };
  })
  .filter(m => Object.values(m).some(v => typeof v === 'number' && v > 0))
  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return { metrics };
};
