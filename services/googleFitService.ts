
import { HealthData, HealthMetricEntry } from "../types";

const CLIENT_ID = '880135225392-efpcpov8t7jc4oktmqhbcctujslj438s.apps.googleusercontent.com';

const SCOPES = [
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.body.read',
  'https://www.googleapis.com/auth/fitness.sleep.read',
  'https://www.googleapis.com/auth/fitness.heart_rate.read',
  'https://www.googleapis.com/auth/fitness.oxygen_saturation.read',
  'https://www.googleapis.com/auth/fitness.blood_pressure.read',
  'https://www.googleapis.com/auth/fitness.blood_glucose.read',
  'https://www.googleapis.com/auth/fitness.body_temperature.read',
  'https://www.googleapis.com/auth/fitness.nutrition.read'
].join(' ');

let tokenClient: any = null;

export const initGoogleFitAuth = (onSuccess: (token: string) => void, onError?: (err: any) => void) => {
  if (!(window as any).google) return;
  
  try {
    tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      ux_mode: 'popup',
      callback: (response: any) => {
        if (response.error) {
          console.error("Auth Error:", response.error);
          if (onError) onError(response);
          return;
        }
        if (response.access_token) {
          sessionStorage.setItem('google_fit_token', response.access_token);
          onSuccess(response.access_token);
        }
      },
      error_callback: (err: any) => {
        console.error("GIS Error:", err);
        let msg = err.message || "Unbekannter Fehler";
        if (err.type === 'popup_closed' || (typeof err === 'object' && err.message?.includes('closed'))) {
          msg = "Das Anmeldefenster wurde geschlossen. Bitte versuche es erneut und schließe das Fenster nicht vorzeitig.";
        }
        if (onError) onError({ ...err, message: msg });
      }
    });
  } catch (err) {
    console.error("Init Failed:", err);
  }
};

export const requestGoogleFitAccess = () => {
  if (tokenClient) {
    tokenClient.requestAccessToken({ prompt: 'consent' });
  }
};

export const revokeGoogleFitAccess = (token: string, onComplete?: () => void) => {
  if ((window as any).google) {
    try {
      (window as any).google.accounts.oauth2.revoke(token, () => {
        console.log('Token revoked');
        sessionStorage.removeItem('google_fit_token');
        if (onComplete) onComplete();
      });
    } catch (e) {
      console.error("Revoke failed", e);
      sessionStorage.removeItem('google_fit_token');
      if (onComplete) onComplete();
    }
  } else {
    sessionStorage.removeItem('google_fit_token');
    if (onComplete) onComplete();
  }
};

export const fetchGoogleFitData = async (accessToken: string): Promise<HealthData> => {
  const endTime = new Date();
  const startTime = new Date();
  startTime.setDate(endTime.getDate() - 14);

  // Nutze datatypenames statt fixer datasource-ids für maximale kompatibilität
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 Sek Timeout

  try {
    // 1. Entdecke verfügbare Datenquellen, um 400-Fehler bei fehlenden Datentypen zu vermeiden
    const sourcesResponse = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataSources', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    let availableTypes: string[] = [];
    if (sourcesResponse.ok) {
      const sourcesData = await sourcesResponse.json();
      availableTypes = sourcesData.dataSource.map((s: any) => s.dataType.name);
    }

    const requestedTypes = [
      "com.google.step_count.delta",
      "com.google.heart_rate.bpm",
      "com.google.sleep.segment",
      "com.google.weight",
      "com.google.body.fat.percentage",
      "com.google.calories.expended",
      "com.google.activity.segment",
      "com.google.heart_rate.variability.rmssd",
      "com.google.heart_rate.variability",
      "com.google.oxygen_saturation",
      "com.google.blood_pressure",
      "com.google.blood_glucose",
      "com.google.body.temperature",
      "com.google.nutrition"
    ];

    // Nur Typen anfragen, für die mindestens eine Quelle existiert
    const aggregateBy = requestedTypes
      .filter(type => availableTypes.includes(type))
      .map(type => ({ dataTypeName: type }));

    // Schlaf und Aktivität immer anfragen, da sie oft virtuelle Typen sind 
    // und nicht immer in der dataSources-Liste auftauchen
    if (!aggregateBy.find(a => a.dataTypeName === "com.google.sleep.segment")) {
       aggregateBy.push({ dataTypeName: "com.google.sleep.segment" });
    }
    if (!aggregateBy.find(a => a.dataTypeName === "com.google.activity.segment")) {
       aggregateBy.push({ dataTypeName: "com.google.activity.segment" });
    }

    // Fallback falls gar nichts gefunden wurde (sollte nicht passieren)
    if (aggregateBy.length === 0) {
      aggregateBy.push({ dataTypeName: "com.google.step_count.delta" });
      aggregateBy.push({ dataTypeName: "com.google.heart_rate.bpm" });
    }

    const aggregateBody = {
      aggregateBy,
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: startTime.getTime(),
      endTimeMillis: endTime.getTime()
    };

    const response = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(aggregateBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Google Fit API Error: ${response.status} ${response.statusText}`, errorBody);
      
      let parsedError;
      try {
        parsedError = JSON.parse(errorBody);
      } catch (e) {}

      if (response.status === 401 || response.status === 403) {
        sessionStorage.removeItem('google_fit_token');
      }
      
      let errorMessage = `Google Fit Sync fehlgeschlagen (Status ${response.status}): ${response.statusText}`;
      if (parsedError?.error?.message) {
        errorMessage += ` - ${parsedError.error.message}`;
      }
      if (response.status === 403) {
        errorMessage = "Zugriff verweigert (403): Bitte stelle sicher, dass du im Google-Login ALLE Berechtigungen (Schritte, Herzfrequenz, Schlaf) angekreuzt hast. Nutze den Button 'Verbindung zurücksetzen' im Health-Tab, um es erneut zu versuchen.";
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (!data.bucket) {
      console.warn("Google Fit returned no buckets:", data);
      return { metrics: [] };
    }
    
    // Mapping der Ergebnisse
    const metrics: HealthMetricEntry[] = data.bucket.map((bucket: any) => {
      const date = new Date(parseInt(bucket.startTimeMillis)).toISOString();
      let steps = 0;
      let heartRate = 0;
      let sleepMillis = 0;
      let weight = 0;
      let bodyFat = 0;
      let hrv = 0;
      let oxygen = 0;
      let respiration = 0;
      let activityMinutes = 0;
      let activeEnergy = 0;
      let bpSys = 0;
      let bpDia = 0;
      let glucose = 0;
      let temp = 0;

      bucket.dataset.forEach((ds: any) => {
        const streamName = (ds.dataSourceId || "").toLowerCase();
        // Manchmal ist der Typ auch direkt im Dataset-Objekt (je nach API-Version/Proxy)
        const dataTypeName = (ds.dataTypeName || "").toLowerCase();
        
        if (ds.point && ds.point.length > 0) {
          const isStep = streamName.includes('step') || dataTypeName.includes('step');
          const isHeart = (streamName.includes('heart_rate') || dataTypeName.includes('heart_rate')) && !streamName.includes('variability');
          const isSleep = streamName.includes('sleep') || dataTypeName.includes('sleep');
          const isWeight = streamName.includes('weight') || dataTypeName.includes('weight');
          const isFat = streamName.includes('body.fat') || dataTypeName.includes('body.fat');
          const isHRV = streamName.includes('heart_rate.variability') || dataTypeName.includes('heart_rate.variability');
          const isOxygen = streamName.includes('oxygen_saturation') || dataTypeName.includes('oxygen_saturation');
          const isCalories = streamName.includes('calories.expended') || dataTypeName.includes('calories.expended');
          const isRespiration = streamName.includes('respiratory_rate') || dataTypeName.includes('respiratory_rate');
          const isActivity = streamName.includes('activity.segment') || dataTypeName.includes('activity.segment');
          const isBP = streamName.includes('blood_pressure') || dataTypeName.includes('blood_pressure');
          const isGlucose = streamName.includes('blood_glucose') || dataTypeName.includes('blood_glucose');
          const isTemp = streamName.includes('body.temperature') || dataTypeName.includes('body.temperature');

          if (isStep) {
            steps = ds.point.reduce((acc: number, p: any) => acc + (p.value[0].intVal || 0), 0);
          } else if (isHeart) {
            const avg = ds.point.reduce((acc: number, p: any) => acc + (p.value[0].fpVal || 0), 0) / ds.point.length;
            const min = ds.point.reduce((acc: number, p: any) => Math.min(acc, p.value[0].fpVal || 999), 999);
            heartRate = Math.round(min !== 999 ? min : avg);
          } else if (isSleep) {
            const dsSleepMillis = ds.point.reduce((acc: number, p: any) => {
               if (p.startTimeNanos && p.endTimeNanos) {
                 const start = p.startTimeNanos / 1000000;
                 const end = p.endTimeNanos / 1000000;
                 const duration = end - start;
                 // Ignoriere "Awake" Phasen (112) in der Gesamtdauer
                 if (p.value && p.value[0] && p.value[0].intVal === 112) return acc;
                 return acc + duration;
               }
               return acc;
            }, 0);
            sleepMillis = Math.max(sleepMillis, dsSleepMillis);
          } else if (isWeight) {
            weight = ds.point[ds.point.length - 1].value[0].fpVal || 0;
          } else if (isFat) {
            bodyFat = ds.point[ds.point.length - 1].value[0].fpVal || 0;
          } else if (isHRV) {
            hrv = Math.round(ds.point.reduce((acc: number, p: any) => acc + (p.value[0].fpVal || 0), 0) / ds.point.length);
          } else if (isOxygen) {
            oxygen = ds.point.reduce((acc: number, p: any) => acc + (p.value[0].fpVal || 0), 0) / ds.point.length;
          } else if (isCalories) {
            activeEnergy = Math.round(ds.point.reduce((acc: number, p: any) => acc + (p.value[0].fpVal || 0), 0));
          } else if (isRespiration) {
            respiration = ds.point.reduce((acc: number, p: any) => acc + (p.value[0].fpVal || 0), 0) / ds.point.length;
          } else if (isActivity) {
            let activityMillis = 0;
            let sleepMillisFromActivity = 0;
            ds.point.forEach((p: any) => {
              const type = p.value[0].intVal;
              const start = p.startTimeNanos / 1000000;
              const end = p.endTimeNanos / 1000000;
              const duration = end - start;
              // 72 = Sleep, 109-111 are specific sleep stages
              if (type === 72 || (type >= 109 && type <= 111)) {
                sleepMillisFromActivity += duration;
              } else if (type !== 3 && type !== 0) {
                activityMillis += duration;
              }
            });
            activityMinutes = Math.round(activityMillis / 60000);
            sleepMillis = Math.max(sleepMillis, sleepMillisFromActivity);
          } else if (isBP) {
            bpSys = ds.point[ds.point.length - 1].value[0].fpVal || 0;
            bpDia = ds.point[ds.point.length - 1].value[1].fpVal || 0;
          } else if (isGlucose) {
            glucose = ds.point[ds.point.length - 1].value[0].fpVal || 0;
          } else if (isTemp) {
            temp = ds.point[ds.point.length - 1].value[0].fpVal || 0;
          }
        }
      });

      return {
        date,
        steps: steps || undefined,
        restingHeartRate: heartRate || undefined,
        hrv: hrv || undefined,
        sleepHours: sleepMillis > 0 ? parseFloat((sleepMillis / 3600000).toFixed(1)) : undefined,
        weight: weight || undefined,
        bodyFat: bodyFat || undefined,
        oxygenSaturation: oxygen || undefined,
        respiratoryRate: respiration || undefined,
        activityMinutes: activityMinutes || undefined,
        activeEnergy: activeEnergy || undefined,
        bloodPressureSys: bpSys || 120,
        bloodPressureDia: bpDia || 80,
        bloodGlucose: glucose || undefined,
        bodyTemperature: temp || undefined
      };
    });

    return { metrics };
  } catch (err: any) {
    if (err.name === 'AbortError') throw new Error("Timeout: Google antwortet nicht.");
    throw err;
  }
};
