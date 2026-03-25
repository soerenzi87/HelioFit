
export type Language = 'de' | 'en';

export enum FitnessGoal {
  WEIGHT_LOSS = 'WEIGHT_LOSS',
  MUSCLE_GAIN = 'MUSCLE_GAIN',
  MAINTENANCE = 'MAINTENANCE',
  ATHLETIC_PERFORMANCE = 'ATHLETIC_PERFORMANCE',
  FLEXIBILITY = 'FLEXIBILITY',
  ENDURANCE = 'ENDURANCE'
}

export enum ActivityLevel {
  SEDENTARY = 'SEDENTARY',
  MODERATE = 'MODERATE',
  ACTIVE = 'ACTIVE',
  VERY_ACTIVE = 'VERY_ACTIVE'
}

export interface WeightEntry {
  date: string;
  weight: number;
}

export interface SegmentalData {
  leftArm?: number;
  rightArm?: number;
  trunk?: number;
  leftLeg?: number;
  rightLeg?: number;
}

export interface HealthMetricEntry {
  date: string;
  // Activity
  steps?: number;
  activeEnergy?: number;
  activityMinutes?: number;
  distance?: number;
  // Vitals (daily aggregates – avg, min, max, count)
  restingHeartRate?: number;
  heartRateMin?: number;
  heartRateMax?: number;
  heartRateCount?: number;
  hrv?: number;
  hrvMin?: number;
  hrvMax?: number;
  hrvCount?: number;
  bloodPressureSys?: number;
  bloodPressureDia?: number;
  oxygenSaturation?: number;
  spo2Min?: number;
  spo2Max?: number;
  spo2Count?: number;
  respiratoryRate?: number;
  bodyTemperature?: number;
  vo2Max?: number;
  bloodGlucose?: number;
  // Body composition (ScaleBridge + Health Connect)
  weight?: number;
  bmi?: number;
  bodyFat?: number;
  leanBodyMass?: number;
  musclePct?: number;
  muscleMassKg?: number;
  waterPct?: number;
  proteinPct?: number;
  boneMassKg?: number;
  fatMassKg?: number;
  visceralFat?: number;
  bmr?: number;
  bodyAge?: number;
  healthScore?: number;
  waistHipRatio?: number;
  skeletalMuscleIndex?: number;
  // Segmental body composition (per-limb from Xiaomi Scale)
  segmentalFatKg?: SegmentalData;
  segmentalMuscleKg?: SegmentalData;
  // Sleep
  sleepHours?: number;
  deepSleepMinutes?: number;
  remSleepMinutes?: number;
  lightSleepMinutes?: number;
}

export interface HealthInsight {
  title: string;
  detail: string;
  category: 'steps' | 'vitals' | 'weight' | 'regeneration';
  impact: 'positive' | 'neutral' | 'negative';
}

export interface HealthReading {
  time: string;
  value: number;
}

export interface HealthReadings {
  heartRate: HealthReading[];
  hrv: HealthReading[];
  spo2: HealthReading[];
  respiratoryRate: HealthReading[];
  bodyTemperature: HealthReading[];
  weight: (HealthReading & { bodyFat?: number; bmi?: number })[];
  bloodPressure: { time: string; systolic: number; diastolic: number }[];
  steps: { time: string; count: number }[];
  calories: { time: string; kilocalories: number }[];
  distance: { time: string; meters: number }[];
}

export type HealthDataSource = 'apple' | 'google' | 'xiaomiScale' | 'healthSync';

export type HealthMetricPreferenceKey =
  | 'steps'
  | 'activeEnergy'
  | 'distance'
  | 'activityMinutes'
  | 'restingHeartRate'
  | 'hrv'
  | 'bloodPressureSys'
  | 'oxygenSaturation'
  | 'respiratoryRate'
  | 'bodyTemperature'
  | 'weight'
  | 'bodyFat'
  | 'sleepHours';

export type HealthSourcePreferences = Partial<Record<HealthMetricPreferenceKey, HealthDataSource>>;

export const DEFAULT_HEALTH_SOURCE_PREFERENCES: Record<HealthMetricPreferenceKey, HealthDataSource> = {
  steps: 'google',
  activeEnergy: 'google',
  distance: 'google',
  activityMinutes: 'google',
  restingHeartRate: 'healthSync',
  hrv: 'healthSync',
  bloodPressureSys: 'healthSync',
  oxygenSaturation: 'healthSync',
  respiratoryRate: 'healthSync',
  bodyTemperature: 'healthSync',
  weight: 'xiaomiScale',
  bodyFat: 'xiaomiScale',
  sleepHours: 'google',
};

export interface HealthData {
  metrics: HealthMetricEntry[];
  readings?: HealthReadings;
  /** Per-source raw metric values keyed by date then source. For live source switching. */
  rawMetrics?: Record<string, Partial<Record<HealthDataSource, Partial<HealthMetricEntry>>>>;
  /** Per-source raw readings. For live source switching. */
  rawReadings?: Partial<Record<HealthDataSource, HealthReadings>>;
  sources?: {
    appleFiles: string[];
    googleSynced: boolean;
    xiaomiScaleSynced?: boolean;
    healthSyncSynced?: boolean;
    lastSync?: string;
    metricCoverage?: Partial<Record<HealthDataSource, HealthMetricPreferenceKey[]>>;
    metricSources?: Record<string, Partial<Record<HealthMetricPreferenceKey, HealthDataSource>>>;
    readingSources?: Partial<Record<keyof HealthReadings, HealthDataSource>>;
  };
}

export interface NutritionPreferences {
  preferredIngredients: string[];
  excludedIngredients: string[];
  appliances: string[];
  days?: string[];
  planVariety?: 'SAME_EVERY_DAY' | 'TWO_DAY_ROTATION' | 'DAILY_VARIETY';
}

export interface WorkoutPreferences {
  availableDays: string[];
  existingWorkouts: ExistingWorkout[];
}

export interface ExistingWorkout {
  day: string;
  activity: string;
}

export interface Exercise {
  name: string;
  sets: number;
  reps: string;
  rest: number;
  notes: string;
  suggestedWeight?: string;
  equipment?: string;
  instructions?: string[];
}

export interface ExerciseLog {
  exerciseName: string;
  sets: {
    weight: number;
    reps: number;
    skipped?: boolean;
    done?: boolean;
    weightText?: string;
    repsText?: string;
  }[];
}

export interface WorkoutLog {
  date: string;
  sessionTitle: string;
  exercises: ExerciseLog[];
  durationMinutes?: number;
  notes?: string;
}

export interface WorkoutSession {
  dayTitle: string;
  focus: string;
  duration: string;
  warmup?: string[];
  exercises: Exercise[];
}

export interface WorkoutProgram {
  id: string;
  dateGenerated: string;
  title: string;
  description: string;
  sessions: WorkoutSession[];
  recoveryTips: string[];
  cardioRecommendations?: string[];
}

export interface ManualWorkoutHistorySession {
  approximateDate?: string;
  title: string;
  exercises: string[];
  notes?: string;
}

export interface ManualWorkoutHistoryEntry {
  date?: string;
  sessionTitle?: string;
  exercise: string;
  weight?: string;
  reps?: string;
  sets?: string;
  notes?: string;
}

export interface ManualWorkoutHistoryInterpretation {
  summary: string;
  inferredExperienceLevel: string;
  estimatedWeeklyFrequency: string;
  goalsDetected: string[];
  focusAreas: string[];
  limitations: string[];
  parsedSessions: ManualWorkoutHistorySession[];
  parsedEntries: ManualWorkoutHistoryEntry[];
  recommendations: string[];
}

export type AIContextSize = 'small' | 'medium' | 'large';

export const AI_CONTEXT_PRESETS: Record<AIContextSize, { healthDays: number; workoutWeeks: number; logLimit: number; topExercises: number }> = {
  small:  { healthDays: 7,  workoutWeeks: 3,  logLimit: 6,  topExercises: 5  },
  medium: { healthDays: 14, workoutWeeks: 6,  logLimit: 12, topExercises: 8  },
  large:  { healthDays: 30, workoutWeeks: 10, logLimit: 20, topExercises: 12 },
};

export interface AIConfig {
  geminiKey?: string;
  openaiKey?: string;
  claudeKey?: string;
  preferredProvider?: 'gemini' | 'openai' | 'claude';
  contextSize?: AIContextSize;
}

// ── Aggregated data types for compact AI prompts ──────────────────────

export interface AggregatedHealthSummary {
  avgSteps: number;
  avgSleep: number;
  avgRestingHR: number;
  avgHRV: number;
  weightStart: number | null;
  weightCurrent: number | null;
  weightDelta: number | null;
  avgBodyFat: number | null;
  avgBloodGlucose: number | null;
  avgBodyTemp: number | null;
  avgSpo2: number | null;
  avgBloodPressureSys: number | null;
  avgBloodPressureDia: number | null;
  periodDays: number;
}

export interface ExerciseProgressEntry {
  name: string;
  bestWeight: number;
  lastWeight: number;
  lastReps: string;
  sessionCount: number;
  trend: '↑' | '→' | '↓';
}

export interface AggregatedWorkoutSummary {
  totalSessions: number;
  periodWeeks: number;
  avgVolumePerSession: number;
  consistencyPct: number;
  topExercises: ExerciseProgressEntry[];
}

export interface AggregatedProfileSummary {
  name: string;
  age: number;
  weight: number;
  height: number;
  gender: string;
  bodyFat?: number;
  goals: string[];
  activityLevel: string;
}

export interface HealthBridgeConfig {
  baseUrl: string;
  username?: string;
  password?: string;
  apiKey?: string;
}

export interface UserProfile {
  name: string;
  email?: string;
  password?: string;
  isApproved?: boolean;
  isAdmin?: boolean;
  age: number;
  weight: number;
  height: number;
  bodyFat?: number;
  gender: 'male' | 'female' | 'other';
  goals: FitnessGoal[];
  activityLevel: ActivityLevel;
  weightHistory?: WeightEntry[];
  healthData?: HealthData;
  profilePicture?: string;
  nutritionPreferences?: NutritionPreferences;
  workoutPreferences?: WorkoutPreferences;
  workoutHistory?: WorkoutProgram[];
  manualWorkoutHistoryText?: string;
  manualWorkoutHistoryInterpretation?: ManualWorkoutHistoryInterpretation;
  likedRecipes?: Recipe[];
  calorieAdjustment?: number;
  healthBridgeConfig?: HealthBridgeConfig;
  healthBridgeTokens?: {
    access_token: string;
    last_sync?: string;
    scale_last_sync?: string;
    health_sync_last_sync?: string;
  };
  aiConfig?: AIConfig;
  mockMode?: boolean;
  healthSourcePreferences?: HealthSourcePreferences;
  eatenMeals?: Record<string, string>; // key: "day|mealType", value: ISO timestamp
  additionalFood?: Record<string, string>; // key: day name, value: free text of extra food eaten
  nutritionHistory?: { plan: WeeklyMealPlan; completedAt: string; eatenMeals: Record<string, string>; additionalFood?: Record<string, any> }[];
}

export interface NutritionTargets {
  maintenanceCalories: number;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  water: number;
}

export interface Recipe {
  name: string;
  ingredients: string[];
  instructions: string[];
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  prepTime: string;
  requiredAppliances: string[];
  usageCount?: number;
  isPlannedForWeek?: boolean;
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

export interface DailyMealPlan {
  breakfast: Recipe;
  lunch: Recipe;
  dinner: Recipe;
  snack: Recipe;
}

export type WeeklyMealPlan = Record<string, DailyMealPlan>;

export interface ProgressInsight {
  title: string;
  summary: string;
  detail: string;
  impact: 'positive' | 'neutral' | 'negative';
  category: string;
}

export interface AIAnalysis {
  summary: string;
  recommendations: string[];
  targets: NutritionTargets;
}
