import { HealthData, HealthMetricEntry, HealthBridgeConfig } from "../types";

export async function loginHealthBridge(config: HealthBridgeConfig): Promise<string> {
  if (config.apiKey) {
    return config.apiKey;
  }

  const response = await fetch("/api/healthbridge/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail?.[0]?.msg || error.error || "Login failed");
  }

  const data = await response.json();
  return data.access_token;
}

export async function fetchHealthBridgeData(config: HealthBridgeConfig, token: string): Promise<HealthData> {
  const baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
  const days = 365;

  const endpoints = [
    { key: 'weight', path: '/api/v1/weight', params: { days } },
    { key: 'heart_rate', path: '/api/v1/heart-rate', params: { days } },
    { key: 'hrv', path: '/api/v1/hrv', params: { days } },
    { key: 'blood_pressure', path: '/api/v1/blood-pressure', params: { days } },
    { key: 'spo2', path: '/api/v1/spo2', params: { days } },
    { key: 'steps', path: '/api/v1/steps', params: { days } },
    { key: 'calories', path: '/api/v1/calories', params: { days } },
    { key: 'distance', path: '/api/v1/distance', params: { days } },
    { key: 'sleep', path: '/api/v1/sleep', params: { days } },
    { key: 'respiratory_rate', path: '/api/v1/respiratory-rate', params: { days } },
    { key: 'body_temperature', path: '/api/v1/body-temperature', params: { days } },
    { key: 'latest', path: '/api/v1/latest', params: {} },
  ];

  console.log(`Starting HealthBridge fetch for ${endpoints.length} endpoints...`);

  const results = await Promise.allSettled(
    endpoints.map(async (e) => {
      const resp = await fetch("/api/healthbridge/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, token, endpoint: e.path, params: e.params }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`Failed to fetch ${e.key}: ${resp.status} ${errText}`);
        throw new Error(`Failed to fetch ${e.key}`);
      }
      const data = await resp.json();
      console.log(`Fetched ${e.key}: ${data.records?.length || 0} records`);
      return { key: e.key, data };
    })
  );

  const metricsMap: Record<string, HealthMetricEntry> = {};

  const getDayKey = (dateStr: any) => {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    try {
      if (typeof dateStr === 'number') return new Date(dateStr * 1000).toISOString().split('T')[0];
      if (typeof dateStr === 'string') return dateStr.split('T')[0];
      return new Date(dateStr).toISOString().split('T')[0];
    } catch (e) {
      return new Date().toISOString().split('T')[0];
    }
  };

  const ensureEntry = (date: any) => {
    const key = getDayKey(date);
    if (!metricsMap[key]) {
      metricsMap[key] = { date: key + 'T12:00:00Z' };
    }
    return metricsMap[key];
  };

  results.forEach((res) => {
    if (res.status === 'fulfilled') {
      const { key, data } = res.value;
      
      if (key === 'latest') {
        // Handle latest metrics separately
        const latest = data;
        const now = new Date().toISOString();
        
        if (latest && typeof latest === 'object') {
          if (latest.weight) {
            const entry = ensureEntry(latest.weight.timestamp || now);
            entry.weight = latest.weight.weight;
            if (latest.weight.body_fat_percent) entry.bodyFat = latest.weight.body_fat_percent;
          }
          if (latest.heart_rate) {
            const entry = ensureEntry(latest.heart_rate.timestamp || now);
            entry.restingHeartRate = latest.heart_rate.bpm;
          }
          if (latest.hrv) {
            const entry = ensureEntry(latest.hrv.timestamp || now);
            entry.hrv = latest.hrv.rmssd;
          }
          if (latest.blood_pressure) {
            const entry = ensureEntry(latest.blood_pressure.timestamp || now);
            entry.bloodPressureSys = latest.blood_pressure.systolic;
            entry.bloodPressureDia = latest.blood_pressure.diastolic;
          }
          if (latest.spo2) {
            const entry = ensureEntry(latest.spo2.timestamp || now);
            entry.oxygenSaturation = latest.spo2.percentage;
          }
          if (latest.respiratory_rate) {
            const entry = ensureEntry(latest.respiratory_rate.timestamp || now);
            entry.respiratoryRate = latest.respiratory_rate.breaths_per_minute;
          }
          if (latest.body_temperature) {
            const entry = ensureEntry(latest.body_temperature.timestamp || now);
            entry.bodyTemperature = latest.body_temperature.celsius;
          }
          
          // Today's aggregates
          const todayEntry = ensureEntry(now);
          if (latest.today_steps) todayEntry.steps = latest.today_steps;
          if (latest.today_calories) todayEntry.activeEnergy = latest.today_calories;
        }
        
        return;
      }

      const records = data.records || (Array.isArray(data) ? data : []);
      records.forEach((rec: any) => {
        const timestamp = rec.timestamp || rec.start_time || rec.end_time;
        if (!timestamp) return;

        const entry = ensureEntry(timestamp);

        switch (key) {
          case 'weight':
            entry.weight = rec.weight;
            if (rec.body_fat_percent) entry.bodyFat = rec.body_fat_percent;
            break;
          case 'heart_rate':
            entry.restingHeartRate = rec.bpm;
            break;
          case 'hrv':
            entry.hrv = rec.rmssd;
            break;
          case 'blood_pressure':
            entry.bloodPressureSys = rec.systolic;
            entry.bloodPressureDia = rec.diastolic;
            break;
          case 'spo2':
            entry.oxygenSaturation = rec.percentage;
            break;
          case 'steps':
            entry.steps = (entry.steps || 0) + rec.count;
            break;
          case 'calories':
            entry.activeEnergy = (entry.activeEnergy || 0) + rec.kilocalories;
            break;
          case 'distance':
            // Distance is in meters, we might want to store it or convert it
            // For now, we don't have a dedicated field in HealthMetricEntry for daily distance
            break;
          case 'sleep':
            entry.sleepHours = (entry.sleepHours || 0) + (rec.duration_minutes / 60);
            break;
          case 'respiratory_rate':
            entry.respiratoryRate = rec.breaths_per_minute;
            break;
          case 'body_temperature':
            entry.bodyTemperature = rec.celsius;
            break;
        }
      });
    }
  });

  const metrics = Object.values(metricsMap).sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return { metrics };
}
