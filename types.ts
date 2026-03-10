
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
  steps?: number;
  restingHeartRate?: number;
  hrv?: number;
  sleepHours?: number;
  bloodPressureSys?: number;
  bloodPressureDia?: number;
  weight?: number;
  bodyFat?: number;
  leanBodyMass?: number;
  oxygenSaturation?: number;
  respiratoryRate?: number;
  vo2Max?: number;
  activeEnergy?: number;
  activityMinutes?: number;
  bloodGlucose?: number;
  bodyTemperature?: number;
}

export interface HealthInsight {
  title: string;
  detail: string;
  category: 'steps' | 'vitals' | 'weight' | 'regeneration';
  impact: 'positive' | 'neutral' | 'negative';
}

export interface HealthData {
  metrics: HealthMetricEntry[];
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
  rest: string;
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
  password?: string;
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
