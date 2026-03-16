from datetime import datetime

from pydantic import BaseModel, Field


# ── Auth ──────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Health Record Schemas (match Kotlin data classes) ─────────────────────────

class WeightRecordSchema(BaseModel):
    weight: float
    bmi: float | None = None
    body_fat_percent: float | None = None
    source: str = "HEALTH_CONNECT"
    timestamp: datetime


class HeartRateRecordSchema(BaseModel):
    bpm: int
    source: str = "HEALTH_CONNECT"
    timestamp: datetime


class HrvRecordSchema(BaseModel):
    rmssd: float
    source: str = "HEALTH_CONNECT"
    timestamp: datetime


class BloodPressureRecordSchema(BaseModel):
    systolic: float
    diastolic: float
    source: str = "HEALTH_CONNECT"
    timestamp: datetime


class OxygenSaturationRecordSchema(BaseModel):
    percentage: float
    source: str = "HEALTH_CONNECT"
    timestamp: datetime


class StepsRecordSchema(BaseModel):
    count: int
    source: str = "HEALTH_CONNECT"
    start_time: datetime
    end_time: datetime


class ActiveCaloriesRecordSchema(BaseModel):
    kilocalories: float
    source: str = "HEALTH_CONNECT"
    start_time: datetime
    end_time: datetime


class DistanceRecordSchema(BaseModel):
    meters: float
    source: str = "HEALTH_CONNECT"
    start_time: datetime
    end_time: datetime


class SleepStageSchema(BaseModel):
    start_time: datetime
    end_time: datetime
    type: str


class SleepSessionRecordSchema(BaseModel):
    start_time: datetime
    end_time: datetime
    stages: list[SleepStageSchema] = []
    source: str = "HEALTH_CONNECT"
    duration_minutes: int = 0
    deep_sleep_minutes: int = 0
    rem_sleep_minutes: int = 0
    light_sleep_minutes: int = 0


class RespiratoryRateRecordSchema(BaseModel):
    breaths_per_minute: float
    source: str = "HEALTH_CONNECT"
    timestamp: datetime


class BodyTemperatureRecordSchema(BaseModel):
    celsius: float
    source: str = "HEALTH_CONNECT"
    timestamp: datetime


# ── Sync Payload (bulk upload from app) ───────────────────────────────────────

class SyncPayload(BaseModel):
    weight_records: list[WeightRecordSchema] = []
    heart_rate_records: list[HeartRateRecordSchema] = []
    hrv_records: list[HrvRecordSchema] = []
    blood_pressure_records: list[BloodPressureRecordSchema] = []
    oxygen_saturation_records: list[OxygenSaturationRecordSchema] = []
    steps_records: list[StepsRecordSchema] = []
    active_calories_records: list[ActiveCaloriesRecordSchema] = []
    distance_records: list[DistanceRecordSchema] = []
    sleep_sessions: list[SleepSessionRecordSchema] = []
    respiratory_rate_records: list[RespiratoryRateRecordSchema] = []
    body_temperature_records: list[BodyTemperatureRecordSchema] = []


class SyncResponse(BaseModel):
    inserted: int
    skipped: int


# ── Scale (Xiaomi Smart Scale) ───────────────────────────────────────────────

class SegmentalFatKg(BaseModel):
    leftArm: float | None = None
    rightArm: float | None = None
    leftLeg: float | None = None
    trunk: float | None = None
    rightLeg: float | None = None


class SegmentalMuscleKg(BaseModel):
    leftArm: float | None = None
    rightArm: float | None = None
    leftLeg: float | None = None
    trunk: float | None = None
    rightLeg: float | None = None


class ScaleDetails(BaseModel):
    heartRateBpm: int | None = None
    bodyWaterMassKg: float | None = None
    fatMassKg: float | None = None
    proteinMassKg: float | None = None
    muscleMassKg: float | None = None
    skeletalMuscleMassKg: float | None = None
    fatFreeBodyWeightKg: float | None = None
    skeletalMuscleIndex: float | None = None
    recommendedCalorieIntakeKcal: float | None = None
    waistHipRatio: float | None = None
    boneMineralPct: float | None = None
    segmentalFatKg: SegmentalFatKg | None = None
    segmentalMuscleKg: SegmentalMuscleKg | None = None


class ScaleWebhookPayload(BaseModel):
    source: str = "android_accessibility"
    device_id: str | None = None
    user_id: str | None = None
    measured_at: int  # Unix timestamp
    weight_kg: float
    bmi: float | None = None
    body_fat_pct: float | None = None
    muscle_pct: float | None = None
    water_pct: float | None = None
    protein_pct: float | None = None
    visceral_fat: float | None = None
    bone_mass_kg: float | None = None
    bmr_kcal: float | None = None
    body_age: float | None = None
    score: float | None = None
    raw_payload: str | None = None
    id: int | None = None
    created_at: int | None = None
    details: ScaleDetails | None = None

    model_config = {"extra": "ignore"}


class ScaleMeasurementOut(BaseModel):
    measured_at: datetime
    weight_kg: float
    bmi: float | None = None
    body_fat_pct: float | None = None
    muscle_pct: float | None = None
    water_pct: float | None = None
    protein_pct: float | None = None
    visceral_fat: float | None = None
    bone_mass_kg: float | None = None
    bmr_kcal: float | None = None
    body_age: float | None = None
    score: float | None = None
    heart_rate_bpm: int | None = None
    body_water_mass_kg: float | None = None
    fat_mass_kg: float | None = None
    protein_mass_kg: float | None = None
    muscle_mass_kg: float | None = None
    skeletal_muscle_mass_kg: float | None = None
    fat_free_body_weight_kg: float | None = None
    skeletal_muscle_index: float | None = None
    recommended_calorie_intake_kcal: float | None = None
    waist_hip_ratio: float | None = None
    bone_mineral_pct: float | None = None
    segmental_data: dict | None = None
    source: str


# ── Query Response Schemas ────────────────────────────────────────────────────

class LatestMetrics(BaseModel):
    weight: WeightRecordSchema | None = None
    heart_rate: HeartRateRecordSchema | None = None
    hrv: HrvRecordSchema | None = None
    blood_pressure: BloodPressureRecordSchema | None = None
    spo2: OxygenSaturationRecordSchema | None = None
    sleep: SleepSessionRecordSchema | None = None
    respiratory_rate: RespiratoryRateRecordSchema | None = None
    body_temperature: BodyTemperatureRecordSchema | None = None
    scale: ScaleMeasurementOut | None = None
    today_steps: int = 0
    today_calories: float = 0.0
    today_distance: float = 0.0


class HistoryResponse(BaseModel):
    metric: str
    count: int
    records: list[dict]
