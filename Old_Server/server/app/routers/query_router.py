from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db, verify_api_key
from app.models import (
    ActiveCaloriesRecord,
    BloodPressureRecord,
    BodyTemperatureRecord,
    DistanceRecord,
    HeartRateRecord,
    HrvRecord,
    OxygenSaturationRecord,
    RespiratoryRateRecord,
    ScaleMeasurement,
    SleepSession,
    StepsRecord,
    WeightRecord,
)
from app.schemas import HistoryResponse, LatestMetrics

router = APIRouter(prefix="/api/v1", tags=["query"], dependencies=[Depends(verify_api_key)])


def _cutoff(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


# ── Latest metrics (dashboard equivalent) ────────────────────────────────────

@router.get("/latest", response_model=LatestMetrics)
async def get_latest(db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    async def latest_one(model, order_col):
        r = await db.execute(select(model).order_by(desc(order_col)).limit(1))
        return r.scalar_one_or_none()

    weight = await latest_one(WeightRecord, WeightRecord.timestamp)
    hr = await latest_one(HeartRateRecord, HeartRateRecord.timestamp)
    hrv = await latest_one(HrvRecord, HrvRecord.timestamp)
    bp = await latest_one(BloodPressureRecord, BloodPressureRecord.timestamp)
    spo2 = await latest_one(OxygenSaturationRecord, OxygenSaturationRecord.timestamp)
    resp = await latest_one(RespiratoryRateRecord, RespiratoryRateRecord.timestamp)
    temp = await latest_one(BodyTemperatureRecord, BodyTemperatureRecord.timestamp)

    # Latest sleep session
    sleep_result = await db.execute(
        select(SleepSession).options(selectinload(SleepSession.stages))
        .order_by(desc(SleepSession.start_time)).limit(1)
    )
    sleep = sleep_result.scalar_one_or_none()

    # Today's aggregated values
    steps_sum = await db.execute(
        select(func.coalesce(func.sum(StepsRecord.count), 0))
        .where(StepsRecord.start_time >= today_start)
    )
    cal_sum = await db.execute(
        select(func.coalesce(func.sum(ActiveCaloriesRecord.kilocalories), 0.0))
        .where(ActiveCaloriesRecord.start_time >= today_start)
    )
    dist_sum = await db.execute(
        select(func.coalesce(func.sum(DistanceRecord.meters), 0.0))
        .where(DistanceRecord.start_time >= today_start)
    )

    # Latest scale measurement
    scale_result = await db.execute(
        select(ScaleMeasurement).order_by(desc(ScaleMeasurement.measured_at)).limit(1)
    )
    scale = scale_result.scalar_one_or_none()

    return LatestMetrics(
        weight=_weight_to_schema(weight) if weight else None,
        heart_rate=_hr_to_schema(hr) if hr else None,
        hrv=_hrv_to_schema(hrv) if hrv else None,
        blood_pressure=_bp_to_schema(bp) if bp else None,
        spo2=_spo2_to_schema(spo2) if spo2 else None,
        sleep=_sleep_to_schema(sleep) if sleep else None,
        respiratory_rate=_resp_to_schema(resp) if resp else None,
        body_temperature=_temp_to_schema(temp) if temp else None,
        scale=_scale_to_schema(scale) if scale else None,
        today_steps=steps_sum.scalar(),
        today_calories=cal_sum.scalar(),
        today_distance=dist_sum.scalar(),
    )


# ── History endpoints ─────────────────────────────────────────────────────────

@router.get("/weight", response_model=HistoryResponse)
async def get_weight_history(days: int = Query(30, ge=1, le=365), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(WeightRecord).where(WeightRecord.timestamp >= _cutoff(days))
        .order_by(desc(WeightRecord.timestamp))
    )
    records = [_weight_to_schema(r).model_dump(mode="json") for r in result.scalars().all()]
    return HistoryResponse(metric="weight", count=len(records), records=records)


@router.get("/heart-rate", response_model=HistoryResponse)
async def get_heart_rate_history(days: int = Query(7, ge=1, le=365), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(HeartRateRecord).where(HeartRateRecord.timestamp >= _cutoff(days))
        .order_by(desc(HeartRateRecord.timestamp))
    )
    records = [_hr_to_schema(r).model_dump(mode="json") for r in result.scalars().all()]
    return HistoryResponse(metric="heart_rate", count=len(records), records=records)


@router.get("/hrv", response_model=HistoryResponse)
async def get_hrv_history(days: int = Query(7, ge=1, le=365), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(HrvRecord).where(HrvRecord.timestamp >= _cutoff(days))
        .order_by(desc(HrvRecord.timestamp))
    )
    records = [_hrv_to_schema(r).model_dump(mode="json") for r in result.scalars().all()]
    return HistoryResponse(metric="hrv", count=len(records), records=records)


@router.get("/blood-pressure", response_model=HistoryResponse)
async def get_bp_history(days: int = Query(30, ge=1, le=365), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BloodPressureRecord).where(BloodPressureRecord.timestamp >= _cutoff(days))
        .order_by(desc(BloodPressureRecord.timestamp))
    )
    records = [_bp_to_schema(r).model_dump(mode="json") for r in result.scalars().all()]
    return HistoryResponse(metric="blood_pressure", count=len(records), records=records)


@router.get("/spo2", response_model=HistoryResponse)
async def get_spo2_history(days: int = Query(7, ge=1, le=365), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(OxygenSaturationRecord).where(OxygenSaturationRecord.timestamp >= _cutoff(days))
        .order_by(desc(OxygenSaturationRecord.timestamp))
    )
    records = [_spo2_to_schema(r).model_dump(mode="json") for r in result.scalars().all()]
    return HistoryResponse(metric="spo2", count=len(records), records=records)


@router.get("/steps", response_model=HistoryResponse)
async def get_steps_history(days: int = Query(30, ge=1, le=365), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(StepsRecord).where(StepsRecord.start_time >= _cutoff(days))
        .order_by(desc(StepsRecord.start_time))
    )
    records = [{"count": r.count, "source": r.source, "start_time": r.start_time.isoformat(), "end_time": r.end_time.isoformat()} for r in result.scalars().all()]
    return HistoryResponse(metric="steps", count=len(records), records=records)


@router.get("/calories", response_model=HistoryResponse)
async def get_calories_history(days: int = Query(30, ge=1, le=365), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ActiveCaloriesRecord).where(ActiveCaloriesRecord.start_time >= _cutoff(days))
        .order_by(desc(ActiveCaloriesRecord.start_time))
    )
    records = [{"kilocalories": r.kilocalories, "source": r.source, "start_time": r.start_time.isoformat(), "end_time": r.end_time.isoformat()} for r in result.scalars().all()]
    return HistoryResponse(metric="calories", count=len(records), records=records)


@router.get("/distance", response_model=HistoryResponse)
async def get_distance_history(days: int = Query(30, ge=1, le=365), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DistanceRecord).where(DistanceRecord.start_time >= _cutoff(days))
        .order_by(desc(DistanceRecord.start_time))
    )
    records = [{"meters": r.meters, "source": r.source, "start_time": r.start_time.isoformat(), "end_time": r.end_time.isoformat()} for r in result.scalars().all()]
    return HistoryResponse(metric="distance", count=len(records), records=records)


@router.get("/sleep", response_model=HistoryResponse)
async def get_sleep_history(days: int = Query(14, ge=1, le=365), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SleepSession).options(selectinload(SleepSession.stages))
        .where(SleepSession.start_time >= _cutoff(days))
        .order_by(desc(SleepSession.start_time))
    )
    records = [_sleep_to_schema(r).model_dump(mode="json") for r in result.scalars().all()]
    return HistoryResponse(metric="sleep", count=len(records), records=records)


@router.get("/respiratory-rate", response_model=HistoryResponse)
async def get_resp_history(days: int = Query(7, ge=1, le=365), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RespiratoryRateRecord).where(RespiratoryRateRecord.timestamp >= _cutoff(days))
        .order_by(desc(RespiratoryRateRecord.timestamp))
    )
    records = [_resp_to_schema(r).model_dump(mode="json") for r in result.scalars().all()]
    return HistoryResponse(metric="respiratory_rate", count=len(records), records=records)


@router.get("/body-temperature", response_model=HistoryResponse)
async def get_temp_history(days: int = Query(7, ge=1, le=365), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BodyTemperatureRecord).where(BodyTemperatureRecord.timestamp >= _cutoff(days))
        .order_by(desc(BodyTemperatureRecord.timestamp))
    )
    records = [_temp_to_schema(r).model_dump(mode="json") for r in result.scalars().all()]
    return HistoryResponse(metric="body_temperature", count=len(records), records=records)


# ── Summary endpoint for AI Studio ───────────────────────────────────────────

@router.get("/summary")
async def get_summary(days: int = Query(7, ge=1, le=365), db: AsyncSession = Depends(get_db)):
    cutoff = _cutoff(days)
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    summary = {"period_days": days, "data_freshness": now.isoformat()}

    # Weight
    w = await db.execute(select(WeightRecord).order_by(desc(WeightRecord.timestamp)).limit(1))
    w = w.scalar_one_or_none()
    if w:
        summary["weight"] = {"latest_kg": w.weight_kg, "bmi": w.bmi, "body_fat_percent": w.body_fat_percent}

    # Heart Rate stats
    hr_stats = await db.execute(
        select(
            func.avg(HeartRateRecord.bpm),
            func.min(HeartRateRecord.bpm),
            func.max(HeartRateRecord.bpm),
        ).where(HeartRateRecord.timestamp >= cutoff)
    )
    hr_row = hr_stats.first()
    hr_latest = await db.execute(select(HeartRateRecord).order_by(desc(HeartRateRecord.timestamp)).limit(1))
    hr_latest = hr_latest.scalar_one_or_none()
    if hr_latest:
        summary["heart_rate"] = {
            "latest_bpm": hr_latest.bpm,
            "avg_bpm": round(hr_row[0], 1) if hr_row[0] else None,
            "min_bpm": hr_row[1],
            "max_bpm": hr_row[2],
            "unit": "bpm",
        }

    # HRV
    hrv_stats = await db.execute(
        select(func.avg(HrvRecord.rmssd_ms)).where(HrvRecord.timestamp >= cutoff)
    )
    hrv_latest = await db.execute(select(HrvRecord).order_by(desc(HrvRecord.timestamp)).limit(1))
    hrv_latest = hrv_latest.scalar_one_or_none()
    if hrv_latest:
        summary["hrv"] = {
            "latest_ms": hrv_latest.rmssd_ms,
            "avg_ms": round(hrv_stats.scalar() or 0, 1),
            "unit": "ms",
        }

    # Blood Pressure
    bp_latest = await db.execute(select(BloodPressureRecord).order_by(desc(BloodPressureRecord.timestamp)).limit(1))
    bp_latest = bp_latest.scalar_one_or_none()
    if bp_latest:
        summary["blood_pressure"] = {
            "latest_systolic": bp_latest.systolic,
            "latest_diastolic": bp_latest.diastolic,
            "unit": "mmHg",
        }

    # SpO2
    spo2_stats = await db.execute(
        select(func.avg(OxygenSaturationRecord.percentage)).where(OxygenSaturationRecord.timestamp >= cutoff)
    )
    spo2_latest = await db.execute(select(OxygenSaturationRecord).order_by(desc(OxygenSaturationRecord.timestamp)).limit(1))
    spo2_latest = spo2_latest.scalar_one_or_none()
    if spo2_latest:
        summary["spo2"] = {
            "latest_percent": spo2_latest.percentage,
            "avg_percent": round(spo2_stats.scalar() or 0, 1),
            "unit": "%",
        }

    # Today's steps, calories, distance
    steps = await db.execute(
        select(func.coalesce(func.sum(StepsRecord.count), 0)).where(StepsRecord.start_time >= today_start)
    )
    cal = await db.execute(
        select(func.coalesce(func.sum(ActiveCaloriesRecord.kilocalories), 0.0)).where(ActiveCaloriesRecord.start_time >= today_start)
    )
    dist = await db.execute(
        select(func.coalesce(func.sum(DistanceRecord.meters), 0.0)).where(DistanceRecord.start_time >= today_start)
    )

    # Daily averages for steps
    daily_steps = await db.execute(
        select(func.avg(StepsRecord.count)).where(StepsRecord.start_time >= cutoff)
    )

    summary["activity"] = {
        "today_steps": steps.scalar(),
        "today_calories_kcal": round(cal.scalar(), 1),
        "today_distance_meters": round(dist.scalar(), 1),
        "daily_avg_steps": round(daily_steps.scalar() or 0, 0),
    }

    # Sleep
    sleep_result = await db.execute(
        select(SleepSession).options(selectinload(SleepSession.stages))
        .order_by(desc(SleepSession.start_time)).limit(1)
    )
    sleep = sleep_result.scalar_one_or_none()
    if sleep:
        sleep_avg = await db.execute(
            select(func.avg(SleepSession.duration_minutes)).where(SleepSession.start_time >= cutoff)
        )
        summary["sleep"] = {
            "last_duration_minutes": sleep.duration_minutes,
            "last_deep_minutes": sleep.deep_sleep_minutes,
            "last_rem_minutes": sleep.rem_sleep_minutes,
            "last_light_minutes": sleep.light_sleep_minutes,
            "avg_duration_minutes": round(sleep_avg.scalar() or 0, 0),
        }

    # Respiratory Rate
    resp_latest = await db.execute(select(RespiratoryRateRecord).order_by(desc(RespiratoryRateRecord.timestamp)).limit(1))
    resp_latest = resp_latest.scalar_one_or_none()
    if resp_latest:
        summary["respiratory_rate"] = {"latest_bpm": resp_latest.breaths_per_minute, "unit": "breaths/min"}

    # Body Temperature
    temp_latest = await db.execute(select(BodyTemperatureRecord).order_by(desc(BodyTemperatureRecord.timestamp)).limit(1))
    temp_latest = temp_latest.scalar_one_or_none()
    if temp_latest:
        summary["body_temperature"] = {"latest_celsius": temp_latest.celsius, "unit": "celsius"}

    # Scale (Xiaomi Smart Scale)
    scale_latest = await db.execute(
        select(ScaleMeasurement).order_by(desc(ScaleMeasurement.measured_at)).limit(1)
    )
    scale_latest = scale_latest.scalar_one_or_none()
    if scale_latest:
        summary["body_composition"] = {
            "weight_kg": scale_latest.weight_kg,
            "bmi": scale_latest.bmi,
            "body_fat_pct": scale_latest.body_fat_pct,
            "muscle_pct": scale_latest.muscle_pct,
            "water_pct": scale_latest.water_pct,
            "protein_pct": scale_latest.protein_pct,
            "visceral_fat": scale_latest.visceral_fat,
            "bone_mass_kg": scale_latest.bone_mass_kg,
            "bmr_kcal": scale_latest.bmr_kcal,
            "body_age": scale_latest.body_age,
            "score": scale_latest.score,
            "muscle_mass_kg": scale_latest.muscle_mass_kg,
            "fat_mass_kg": scale_latest.fat_mass_kg,
            "skeletal_muscle_mass_kg": scale_latest.skeletal_muscle_mass_kg,
            "measured_at": scale_latest.measured_at.isoformat(),
            "source": "xiaomi_scale",
        }

    return summary


# ── Helper functions: ORM -> Pydantic ─────────────────────────────────────────

def _weight_to_schema(r):
    from app.schemas import WeightRecordSchema
    return WeightRecordSchema(weight=r.weight_kg, bmi=r.bmi, body_fat_percent=r.body_fat_percent, source=r.source, timestamp=r.timestamp)

def _hr_to_schema(r):
    from app.schemas import HeartRateRecordSchema
    return HeartRateRecordSchema(bpm=r.bpm, source=r.source, timestamp=r.timestamp)

def _hrv_to_schema(r):
    from app.schemas import HrvRecordSchema
    return HrvRecordSchema(rmssd=r.rmssd_ms, source=r.source, timestamp=r.timestamp)

def _bp_to_schema(r):
    from app.schemas import BloodPressureRecordSchema
    return BloodPressureRecordSchema(systolic=r.systolic, diastolic=r.diastolic, source=r.source, timestamp=r.timestamp)

def _spo2_to_schema(r):
    from app.schemas import OxygenSaturationRecordSchema
    return OxygenSaturationRecordSchema(percentage=r.percentage, source=r.source, timestamp=r.timestamp)

def _resp_to_schema(r):
    from app.schemas import RespiratoryRateRecordSchema
    return RespiratoryRateRecordSchema(breaths_per_minute=r.breaths_per_minute, source=r.source, timestamp=r.timestamp)

def _temp_to_schema(r):
    from app.schemas import BodyTemperatureRecordSchema
    return BodyTemperatureRecordSchema(celsius=r.celsius, source=r.source, timestamp=r.timestamp)

def _sleep_to_schema(r):
    from app.schemas import SleepSessionRecordSchema, SleepStageSchema
    return SleepSessionRecordSchema(
        start_time=r.start_time, end_time=r.end_time, source=r.source,
        duration_minutes=r.duration_minutes, deep_sleep_minutes=r.deep_sleep_minutes,
        rem_sleep_minutes=r.rem_sleep_minutes, light_sleep_minutes=r.light_sleep_minutes,
        stages=[SleepStageSchema(start_time=s.start_time, end_time=s.end_time, type=s.type) for s in r.stages],
    )

def _scale_to_schema(r):
    from app.schemas import ScaleMeasurementOut
    return ScaleMeasurementOut(
        measured_at=r.measured_at, weight_kg=r.weight_kg, bmi=r.bmi,
        body_fat_pct=r.body_fat_pct, muscle_pct=r.muscle_pct, water_pct=r.water_pct,
        protein_pct=r.protein_pct, visceral_fat=r.visceral_fat, bone_mass_kg=r.bone_mass_kg,
        bmr_kcal=r.bmr_kcal, body_age=r.body_age, score=r.score,
        heart_rate_bpm=r.heart_rate_bpm, body_water_mass_kg=r.body_water_mass_kg,
        fat_mass_kg=r.fat_mass_kg, protein_mass_kg=r.protein_mass_kg,
        muscle_mass_kg=r.muscle_mass_kg, skeletal_muscle_mass_kg=r.skeletal_muscle_mass_kg,
        fat_free_body_weight_kg=r.fat_free_body_weight_kg,
        skeletal_muscle_index=r.skeletal_muscle_index,
        recommended_calorie_intake_kcal=r.recommended_calorie_intake_kcal,
        waist_hip_ratio=r.waist_hip_ratio, bone_mineral_pct=r.bone_mineral_pct,
        segmental_data=r.segmental_data, source=r.source,
    )
