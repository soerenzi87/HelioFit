
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

export interface HealthData {
  metrics: HealthMetricEntry[];
  readings?: HealthReadings;
  sources?: {
    appleFiles: string[];
    googleSynced: boolean;
    lastSync?: string;
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
  }[];
}

export interface WorkoutLog {
  date: string;
  sessionTitle: string;
  exercises: ExerciseLog[];
}

export interface WorkoutSession {
  dayTitle: string;
  focus: string;
  duration: string;
  exercises: Exercise[];
}

export interface WorkoutProgram {
  id: string;
  dateGenerated: string;
  title: string;
  description: string;
  sessions: WorkoutSession[];
  recoveryTips: string[];
}

export interface AIConfig {
  geminiKey?: string;
  openaiKey?: string;
  claudeKey?: string;
  preferredProvider?: 'gemini' | 'openai' | 'claude';
}

export interface WithingsConfig {
  clientId: string;
  clientSecret: string;
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
  likedRecipes?: Recipe[];
  calorieAdjustment?: number;
  withingsConfig?: WithingsConfig;
  withingsTokens?: {
    access_token: string;
    refresh_token: string;
    userid: string;
    expires_in: number;
    last_sync?: string;
  };
  healthBridgeConfig?: HealthBridgeConfig;
  healthBridgeTokens?: {
    access_token: string;
    last_sync?: string;
  };
  aiConfig?: AIConfig;
  mockMode?: boolean;
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
