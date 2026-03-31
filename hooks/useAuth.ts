import React, { useEffect } from 'react';
import { UserProfile, AIAnalysis, WeeklyMealPlan, WorkoutProgram, WorkoutLog, HealthData, HealthInsight, ProgressInsight, CorrelationInsight, RecoveryBubble, Language, DEFAULT_HEALTH_SOURCE_PREFERENCES } from '../types';
import { apiFetch } from '../services/apiFetch';
import { generateMockHealthData } from '../services/mockHealthData';
import { cleanupHealthData } from '../services/healthDataMerge';
import { registerServiceWorker } from '../services/pushNotificationService';

export interface AuthSetters {
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  setActiveTab: (tab: string) => void;
  setWorkoutLogs: (logs: WorkoutLog[]) => void;
  setHealthData: (d: HealthData | null) => void;
  setDb: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  setAnalysis: (a: AIAnalysis | null) => void;
  setProgressAnalysis: (p: ProgressInsight[] | null) => void;
  setWeeklyPlan: (p: WeeklyMealPlan | null) => void;
  setWorkoutPlan: (p: WorkoutProgram | null) => void;
  setHealthInsights: (i: HealthInsight[]) => void;
  setCorrelationInsights: (i: CorrelationInsight[] | null) => void;
  setRecoveryInsight: (i: RecoveryBubble[] | null) => void;
  setIsSuperLoggedIn: (v: boolean) => void;
  setIsDbLoaded: (v: boolean) => void;
}

function restoreUserState(serverProfile: UserProfile, userData: any, s: AuthSetters) {
  const key = serverProfile.email || serverProfile.name;
  s.setProfile(serverProfile);
  if (serverProfile.isAdmin) s.setActiveTab('admin');
  s.setWorkoutLogs(userData.workoutLogs || []);

  if (serverProfile.mockMode && !userData.health) {
    const mockHealth = generateMockHealthData();
    s.setHealthData(mockHealth);
    s.setDb({ [key]: { ...userData, health: mockHealth } });
  } else {
    const cleaned = userData.health ? cleanupHealthData(userData.health) : null;
    s.setHealthData(cleaned);
    s.setDb({ [key]: userData });
  }

  s.setAnalysis(userData.analysis || null);
  s.setProgressAnalysis(Array.isArray(userData.progressAnalysis) ? userData.progressAnalysis : null);
  s.setWeeklyPlan(userData.weeklyPlan || null);
  s.setWorkoutPlan(userData.workoutPlan || null);
  s.setHealthInsights(userData.healthInsights || []);
  if (userData.correlationInsights) s.setCorrelationInsights(userData.correlationInsights);
  if (userData.recoveryInsight) s.setRecoveryInsight(userData.recoveryInsight);
}

export function useSessionRestore(s: AuthSetters) {
  useEffect(() => {
    const restore = async () => {
      try {
        const meRes = await apiFetch('/api/auth/me');
        if (meRes.ok) {
          const { profile: serverProfile, userData } = await meRes.json();
          restoreUserState(serverProfile, userData, s);
          s.setIsSuperLoggedIn(true);
          localStorage.setItem('heliofit_user_email', serverProfile.email || serverProfile.name);
        }
      } catch (e) {
        console.error("Session restore failed", e);
      }
      s.setIsDbLoaded(true);
    };
    restore();
  }, []);
}

export async function performLogin(
  user: { email: string; password: string; isGoogle?: boolean },
  language: Language,
  s: AuthSetters & { setIsApprovalPending: (v: boolean) => void }
) {
  try {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: user.password, isGoogle: user.isGoogle }),
    });

    if (res.status === 403) {
      const data = await res.json();
      if (data.error === 'pending_approval') { s.setIsApprovalPending(true); return; }
    }
    if (res.status === 401) {
      const data = await res.json();
      alert(language === 'de'
        ? (data.error === 'User not found' ? 'Benutzer nicht gefunden' : 'Falsches Passwort')
        : (data.error || 'Invalid credentials'));
      return;
    }
    if (!res.ok) {
      alert(language === 'de' ? 'Login fehlgeschlagen' : 'Login failed');
      return;
    }

    const { profile: serverProfile, userData } = await res.json();
    restoreUserState(serverProfile, userData, s);
    s.setIsSuperLoggedIn(true);
    localStorage.setItem('heliofit_user_email', serverProfile.email || serverProfile.name);
    registerServiceWorker();
  } catch (e) {
    console.error("Login error:", e);
    alert(language === 'de' ? 'Verbindungsfehler' : 'Connection error');
  }
}

export async function performRegister(newProfile: UserProfile, language: Language) {
  const p: UserProfile = {
    ...newProfile,
    weightHistory: [{ date: new Date().toISOString(), weight: newProfile.weight }],
    nutritionPreferences: {
      preferredIngredients: [],
      excludedIngredients: [],
      appliances: ['stove', 'oven'],
      days: ['Montag', 'Mittwoch', 'Freitag'],
      planVariety: 'DAILY_VARIETY' as const
    },
    workoutPreferences: { availableDays: ['Montag', 'Mittwoch', 'Freitag'], existingWorkouts: [] },
    workoutHistory: [],
    calorieAdjustment: 0,
    healthSourcePreferences: DEFAULT_HEALTH_SOURCE_PREFERENCES,
  };
  try {
    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: p }),
    });
    if (res.status === 409) { alert(language === 'de' ? 'Benutzer existiert bereits' : 'User already exists'); return; }
    if (!res.ok) { alert(language === 'de' ? 'Registrierung fehlgeschlagen' : 'Registration failed'); return; }
  } catch (e) {
    console.error("Register error:", e);
    alert(language === 'de' ? 'Verbindungsfehler' : 'Connection error');
  }
}

export async function performLogout(s: Pick<AuthSetters, 'setProfile' | 'setDb' | 'setHealthData' | 'setWorkoutLogs' | 'setAnalysis' | 'setProgressAnalysis' | 'setWeeklyPlan' | 'setWorkoutPlan' | 'setHealthInsights' | 'setIsSuperLoggedIn'>) {
  try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch {}
  localStorage.removeItem('heliofit_user_email');
  s.setIsSuperLoggedIn(false);
  s.setProfile(null);
  s.setDb({});
  s.setHealthData(null);
  s.setWorkoutLogs([]);
  s.setAnalysis(null);
  s.setProgressAnalysis(null);
  s.setWeeklyPlan(null);
  s.setWorkoutPlan(null);
  s.setHealthInsights([]);
}
