from fastapi import APIRouter, Depends
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models import (
    ActiveCaloriesRecord,
    BloodPressureRecord,
    BodyTemperatureRecord,
    DistanceRecord,
    HeartRateRecord,
    HrvRecord,
    OxygenSaturationRecord,
    RespiratoryRateRecord,
    SleepSession,
    SleepStage,
    StepsRecord,
    User,
    WeightRecord,
)
from app.schemas import SyncPayload, SyncResponse

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/upload", response_model=SyncResponse)
async def upload_sync(
    payload: SyncPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    inserted = 0
    skipped = 0
    uid = user.id

    # Weight
    for r in payload.weight_records:
        stmt = insert(WeightRecord).values(
            user_id=uid, weight_kg=r.weight, bmi=r.bmi,
            body_fat_percent=r.body_fat_percent, source=r.source, timestamp=r.timestamp,
        ).on_conflict_do_nothing(constraint="uq_weight")
        result = await db.execute(stmt)
        if result.rowcount:
            inserted += 1
        else:
            skipped += 1

    # Heart Rate
    for r in payload.heart_rate_records:
        stmt = insert(HeartRateRecord).values(
            user_id=uid, bpm=r.bpm, source=r.source, timestamp=r.timestamp,
        ).on_conflict_do_nothing(constraint="uq_heart_rate")
        result = await db.execute(stmt)
        if result.rowcount:
            inserted += 1
        else:
            skipped += 1

    # HRV
    for r in payload.hrv_records:
        stmt = insert(HrvRecord).values(
            user_id=uid, rmssd_ms=r.rmssd, source=r.source, timestamp=r.timestamp,
        ).on_conflict_do_nothing(constraint="uq_hrv")
        result = await db.execute(stmt)
        if result.rowcount:
            inserted += 1
        else:
            skipped += 1

    # Blood Pressure
    for r in payload.blood_pressure_records:
        stmt = insert(BloodPressureRecord).values(
            user_id=uid, systolic=r.systolic, diastolic=r.diastolic,
            source=r.source, timestamp=r.timestamp,
        ).on_conflict_do_nothing(constraint="uq_blood_pressure")
        result = await db.execute(stmt)
        if result.rowcount:
            inserted += 1
        else:
            skipped += 1

    # SpO2
    for r in payload.oxygen_saturation_records:
        stmt = insert(OxygenSaturationRecord).values(
            user_id=uid, percentage=r.percentage, source=r.source, timestamp=r.timestamp,
        ).on_conflict_do_nothing(constraint="uq_spo2")
        result = await db.execute(stmt)
        if result.rowcount:
            inserted += 1
        else:
            skipped += 1

    # Steps
    for r in payload.steps_records:
        stmt = insert(StepsRecord).values(
            user_id=uid, count=r.count, source=r.source,
            start_time=r.start_time, end_time=r.end_time,
        ).on_conflict_do_nothing(constraint="uq_steps")
        result = await db.execute(stmt)
        if result.rowcount:
            inserted += 1
        else:
            skipped += 1

    # Active Calories
    for r in payload.active_calories_records:
        stmt = insert(ActiveCaloriesRecord).values(
            user_id=uid, kilocalories=r.kilocalories, source=r.source,
            start_time=r.start_time, end_time=r.end_time,
        ).on_conflict_do_nothing(constraint="uq_calories")
        result = await db.execute(stmt)
        if result.rowcount:
            inserted += 1
        else:
            skipped += 1

    # Distance
    for r in payload.distance_records:
        stmt = insert(DistanceRecord).values(
            user_id=uid, meters=r.meters, source=r.source,
            start_time=r.start_time, end_time=r.end_time,
        ).on_conflict_do_nothing(constraint="uq_distance")
        result = await db.execute(stmt)
        if result.rowcount:
            inserted += 1
        else:
            skipped += 1

    # Sleep Sessions (with stages)
    for r in payload.sleep_sessions:
        stmt = insert(SleepSession).values(
            user_id=uid, start_time=r.start_time, end_time=r.end_time,
            duration_minutes=r.duration_minutes, deep_sleep_minutes=r.deep_sleep_minutes,
            rem_sleep_minutes=r.rem_sleep_minutes, light_sleep_minutes=r.light_sleep_minutes,
            source=r.source,
        ).on_conflict_do_nothing(constraint="uq_sleep").returning(SleepSession.id)
        result = await db.execute(stmt)
        row = result.first()
        if row:
            inserted += 1
            session_id = row[0]
            for stage in r.stages:
                db.add(SleepStage(
                    session_id=session_id,
                    start_time=stage.start_time,
                    end_time=stage.end_time,
                    type=stage.type,
                ))
        else:
            skipped += 1

    # Respiratory Rate
    for r in payload.respiratory_rate_records:
        stmt = insert(RespiratoryRateRecord).values(
            user_id=uid, breaths_per_minute=r.breaths_per_minute,
            source=r.source, timestamp=r.timestamp,
        ).on_conflict_do_nothing(constraint="uq_respiratory")
        result = await db.execute(stmt)
        if result.rowcount:
            inserted += 1
        else:
            skipped += 1

    # Body Temperature
    for r in payload.body_temperature_records:
        stmt = insert(BodyTemperatureRecord).values(
            user_id=uid, celsius=r.celsius, source=r.source, timestamp=r.timestamp,
        ).on_conflict_do_nothing(constraint="uq_body_temp")
        result = await db.execute(stmt)
        if result.rowcount:
            inserted += 1
        else:
            skipped += 1

    await db.commit()
    return SyncResponse(inserted=inserted, skipped=skipped)
