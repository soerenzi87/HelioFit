import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from firebase_admin import messaging
from sqlalchemy import desc, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_db, verify_api_key
from app.models import ScaleMeasurement
from app.schemas import HistoryResponse, ScaleMeasurementOut, ScaleWebhookPayload

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/scale", tags=["scale"], dependencies=[Depends(verify_api_key)])


# ── Webhook: receive data from Xiaomi scale ──────────────────────────────────

@router.post("/webhook")
async def scale_webhook(payload: ScaleWebhookPayload, db: AsyncSession = Depends(get_db)):
    measured_at = datetime.fromtimestamp(payload.measured_at, tz=timezone.utc)

    details = payload.details
    segmental_data = None
    if details:
        seg = {}
        if details.segmentalFatKg:
            seg["segmentalFatKg"] = details.segmentalFatKg.model_dump(exclude_none=True)
        if details.segmentalMuscleKg:
            seg["segmentalMuscleKg"] = details.segmentalMuscleKg.model_dump(exclude_none=True)
        if seg:
            segmental_data = seg

    values = dict(
        source=payload.source,
        device_id=payload.device_id,
        device_user_id=payload.user_id,
        measured_at=measured_at,
        weight_kg=payload.weight_kg,
        bmi=payload.bmi,
        body_fat_pct=payload.body_fat_pct,
        muscle_pct=payload.muscle_pct,
        water_pct=payload.water_pct,
        protein_pct=payload.protein_pct,
        visceral_fat=payload.visceral_fat,
        bone_mass_kg=payload.bone_mass_kg,
        bmr_kcal=payload.bmr_kcal,
        body_age=payload.body_age,
        score=payload.score,
        heart_rate_bpm=details.heartRateBpm if details else None,
        body_water_mass_kg=details.bodyWaterMassKg if details else None,
        fat_mass_kg=details.fatMassKg if details else None,
        protein_mass_kg=details.proteinMassKg if details else None,
        muscle_mass_kg=details.muscleMassKg if details else None,
        skeletal_muscle_mass_kg=details.skeletalMuscleMassKg if details else None,
        fat_free_body_weight_kg=details.fatFreeBodyWeightKg if details else None,
        skeletal_muscle_index=details.skeletalMuscleIndex if details else None,
        recommended_calorie_intake_kcal=details.recommendedCalorieIntakeKcal if details else None,
        waist_hip_ratio=details.waistHipRatio if details else None,
        bone_mineral_pct=details.boneMineralPct if details else None,
        segmental_data=segmental_data,
    )

    stmt = insert(ScaleMeasurement).values(**values).on_conflict_do_nothing(
        constraint="uq_scale_measurement"
    )
    result = await db.execute(stmt)
    await db.commit()

    inserted = result.rowcount if result.rowcount and result.rowcount > 0 else 0
    return {"status": "ok", "inserted": inserted}


# ── Query: latest scale measurement ──────────────────────────────────────────

@router.get("/latest", response_model=ScaleMeasurementOut | None)
async def get_latest_scale(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ScaleMeasurement).order_by(desc(ScaleMeasurement.measured_at)).limit(1)
    )
    r = result.scalar_one_or_none()
    if not r:
        return None
    return _to_schema(r)


# ── Query: scale history ─────────────────────────────────────────────────────

@router.get("/history", response_model=HistoryResponse)
async def get_scale_history(days: int = Query(90, ge=1, le=365), db: AsyncSession = Depends(get_db)):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(ScaleMeasurement)
        .where(ScaleMeasurement.measured_at >= cutoff)
        .order_by(desc(ScaleMeasurement.measured_at))
    )
    records = [_to_schema(r).model_dump(mode="json") for r in result.scalars().all()]
    return HistoryResponse(metric="scale", count=len(records), records=records)


# ── Push-Sync: send FCM, wait for fresh data ────────────────────────────────

PUSH_SYNC_POLL_INTERVAL = 2   # seconds between DB polls
PUSH_SYNC_TIMEOUT = 60        # max seconds to wait


@router.post("/push-sync")
async def push_sync(db: AsyncSession = Depends(get_db)):
    """Send FCM push to ScaleBridge app, wait for fresh data, return it."""

    token = settings.FCM_DEVICE_TOKEN
    if not token:
        raise HTTPException(status_code=503, detail="FCM_DEVICE_TOKEN not configured")

    # Remember current time (used to detect NEW data arriving after the push)
    before = datetime.now(timezone.utc)

    # Send FCM data message
    try:
        msg = messaging.Message(
            data={
                "target_app": "s800_bridge",
                "action": "s800_bridge_sync_now",
            },
            android=messaging.AndroidConfig(priority="high"),
            token=token,
        )
        resp = messaging.send(msg)
        log.info("FCM sent: %s", resp)
    except Exception as e:
        log.error("FCM send failed: %s", e)
        raise HTTPException(status_code=502, detail=f"FCM send failed: {e}")

    # Poll DB for new data
    elapsed = 0.0
    while elapsed < PUSH_SYNC_TIMEOUT:
        await asyncio.sleep(PUSH_SYNC_POLL_INTERVAL)
        elapsed += PUSH_SYNC_POLL_INTERVAL

        result = await db.execute(
            select(ScaleMeasurement)
            .where(ScaleMeasurement.created_at > before)
            .order_by(desc(ScaleMeasurement.created_at))
            .limit(1)
        )
        row = result.scalar_one_or_none()
        if row:
            log.info("Push-sync: fresh data after %.0fs", elapsed)
            return {
                "status": "ok",
                "waited_seconds": elapsed,
                "data": _to_schema(row).model_dump(mode="json"),
            }

    # Timeout – return last known data instead of failing
    result = await db.execute(
        select(ScaleMeasurement).order_by(desc(ScaleMeasurement.measured_at)).limit(1)
    )
    fallback = result.scalar_one_or_none()
    return {
        "status": "timeout",
        "message": f"No fresh data within {PUSH_SYNC_TIMEOUT}s – returning last known measurement",
        "waited_seconds": PUSH_SYNC_TIMEOUT,
        "data": _to_schema(fallback).model_dump(mode="json") if fallback else None,
    }


# ── Helper ──────────────────────────────────────────────────────────────────

def _to_schema(r: ScaleMeasurement) -> ScaleMeasurementOut:
    return ScaleMeasurementOut(
        measured_at=r.measured_at,
        weight_kg=r.weight_kg,
        bmi=r.bmi,
        body_fat_pct=r.body_fat_pct,
        muscle_pct=r.muscle_pct,
        water_pct=r.water_pct,
        protein_pct=r.protein_pct,
        visceral_fat=r.visceral_fat,
        bone_mass_kg=r.bone_mass_kg,
        bmr_kcal=r.bmr_kcal,
        body_age=r.body_age,
        score=r.score,
        heart_rate_bpm=r.heart_rate_bpm,
        body_water_mass_kg=r.body_water_mass_kg,
        fat_mass_kg=r.fat_mass_kg,
        protein_mass_kg=r.protein_mass_kg,
        muscle_mass_kg=r.muscle_mass_kg,
        skeletal_muscle_mass_kg=r.skeletal_muscle_mass_kg,
        fat_free_body_weight_kg=r.fat_free_body_weight_kg,
        skeletal_muscle_index=r.skeletal_muscle_index,
        recommended_calorie_intake_kcal=r.recommended_calorie_intake_kcal,
        waist_hip_ratio=r.waist_hip_ratio,
        bone_mineral_pct=r.bone_mineral_pct,
        segmental_data=r.segmental_data,
        source=r.source,
    )
