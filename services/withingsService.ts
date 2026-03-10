
import { HealthData, HealthMetricEntry } from "../types";

export const getWithingsAuthUrl = async (clientId?: string, clientSecret?: string) => {
  const params = new URLSearchParams();
  if (clientId) params.append('clientId', clientId);
  if (clientSecret) params.append('clientSecret', clientSecret);
  
  const response = await fetch(`/api/auth/withings/url?${params.toString()}`);
  const data = await response.json();
  return data.url;
};

export const refreshWithingsToken = async (refreshToken: string, clientId?: string, clientSecret?: string) => {
  const response = await fetch('/api/auth/withings/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken, clientId, clientSecret })
  });
  if (!response.ok) throw new Error("Refresh failed");
  return await response.json();
};

export const fetchWithingsData = async (
  accessToken: string, 
  refreshToken?: string, 
  onTokenRefresh?: (tokens: any) => void,
  clientId?: string,
  clientSecret?: string
): Promise<HealthData> => {
  const endTime = Math.floor(Date.now() / 1000);
  const startTime = endTime - (14 * 24 * 60 * 60);

  const doFetch = async (token: string) => {
    const response = await fetch('/api/withings/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getmeas',
        accessToken: token,
        params: {
          startdate: startTime,
          enddate: endTime,
          category: 1 // Real measures
        }
      })
    });
    return await response.json();
  };

  try {
    let data = await doFetch(accessToken);

    // Handle expired token (Withings status 401)
    if (data.status === 401 && refreshToken && onTokenRefresh) {
      console.log("Withings token expired, refreshing...");
      const newTokens = await refreshWithingsToken(refreshToken, clientId, clientSecret);
      onTokenRefresh(newTokens);
      data = await doFetch(newTokens.access_token);
    }

    if (data.status !== 0 || !data.body || !data.body.measuregrps) {
      console.error("Withings API Error:", data);
      return { metrics: [] };
    }

    const metricsMap: Record<string, HealthMetricEntry> = {};

    data.body.measuregrps.forEach((group: any) => {
      const date = new Date(group.date * 1000).toISOString().split('T')[0];
      if (!metricsMap[date]) {
        metricsMap[date] = { date: new Date(group.date * 1000).toISOString() };
      }

      group.measures.forEach((m: any) => {
        const val = m.value * Math.pow(10, m.unit);
        switch (m.type) {
          case 1: // Weight
            metricsMap[date].weight = parseFloat(val.toFixed(2));
            break;
          case 6: // Fat ratio
            metricsMap[date].bodyFat = parseFloat(val.toFixed(2));
            break;
          case 11: // Heart rate
            metricsMap[date].restingHeartRate = Math.round(val);
            break;
          case 54: // SpO2
            metricsMap[date].oxygenSaturation = parseFloat(val.toFixed(2));
            break;
          case 71: // Body temp
            metricsMap[date].bodyTemperature = parseFloat(val.toFixed(2));
            break;
          case 91: // Systolic BP
            metricsMap[date].bloodPressureSys = Math.round(val);
            break;
          case 92: // Diastolic BP
            metricsMap[date].bloodPressureDia = Math.round(val);
            break;
        }
      });
    });

    return { metrics: Object.values(metricsMap) };
  } catch (error) {
    console.error("Withings Fetch Error:", error);
    return { metrics: [] };
  }
};
