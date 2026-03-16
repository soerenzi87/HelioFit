import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Column, DateTime, Double, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class WeightRecord(Base):
    __tablename__ = "weight_records"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    weight_kg = Column(Double, nullable=False)
    bmi = Column(Double, nullable=True)
    body_fat_percent = Column(Double, nullable=True)
    source = Column(String(20), nullable=False, default="HEALTH_CONNECT")
    timestamp = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "timestamp", "source", name="uq_weight"),
        Index("ix_weight_user_ts", "user_id", "timestamp"),
    )


class HeartRateRecord(Base):
    __tablename__ = "heart_rate_records"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    bpm = Column(Integer, nullable=False)
    source = Column(String(20), nullable=False, default="HEALTH_CONNECT")
    timestamp = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "timestamp", "source", name="uq_heart_rate"),
        Index("ix_heart_rate_user_ts", "user_id", "timestamp"),
    )


class HrvRecord(Base):
    __tablename__ = "hrv_records"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    rmssd_ms = Column(Double, nullable=False)
    source = Column(String(20), nullable=False, default="HEALTH_CONNECT")
    timestamp = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "timestamp", "source", name="uq_hrv"),
        Index("ix_hrv_user_ts", "user_id", "timestamp"),
    )


class BloodPressureRecord(Base):
    __tablename__ = "blood_pressure_records"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    systolic = Column(Double, nullable=False)
    diastolic = Column(Double, nullable=False)
    source = Column(String(20), nullable=False, default="HEALTH_CONNECT")
    timestamp = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "timestamp", "source", name="uq_blood_pressure"),
        Index("ix_blood_pressure_user_ts", "user_id", "timestamp"),
    )


class OxygenSaturationRecord(Base):
    __tablename__ = "oxygen_saturation_records"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    percentage = Column(Double, nullable=False)
    source = Column(String(20), nullable=False, default="HEALTH_CONNECT")
    timestamp = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "timestamp", "source", name="uq_spo2"),
        Index("ix_spo2_user_ts", "user_id", "timestamp"),
    )


class StepsRecord(Base):
    __tablename__ = "steps_records"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    count = Column(BigInteger, nullable=False)
    source = Column(String(20), nullable=False, default="HEALTH_CONNECT")
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "start_time", "end_time", "source", name="uq_steps"),
        Index("ix_steps_user_ts", "user_id", "start_time"),
    )


class ActiveCaloriesRecord(Base):
    __tablename__ = "active_calories_records"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    kilocalories = Column(Double, nullable=False)
    source = Column(String(20), nullable=False, default="HEALTH_CONNECT")
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "start_time", "end_time", "source", name="uq_calories"),
        Index("ix_calories_user_ts", "user_id", "start_time"),
    )


class DistanceRecord(Base):
    __tablename__ = "distance_records"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    meters = Column(Double, nullable=False)
    source = Column(String(20), nullable=False, default="HEALTH_CONNECT")
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "start_time", "end_time", "source", name="uq_distance"),
        Index("ix_distance_user_ts", "user_id", "start_time"),
    )


class SleepSession(Base):
    __tablename__ = "sleep_sessions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    deep_sleep_minutes = Column(Integer, nullable=False, default=0)
    rem_sleep_minutes = Column(Integer, nullable=False, default=0)
    light_sleep_minutes = Column(Integer, nullable=False, default=0)
    source = Column(String(20), nullable=False, default="HEALTH_CONNECT")
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    stages = relationship("SleepStage", back_populates="session", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("user_id", "start_time", "end_time", "source", name="uq_sleep"),
        Index("ix_sleep_user_ts", "user_id", "start_time"),
    )


class SleepStage(Base):
    __tablename__ = "sleep_stages"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(BigInteger, ForeignKey("sleep_sessions.id", ondelete="CASCADE"), nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    type = Column(String(10), nullable=False)

    session = relationship("SleepSession", back_populates="stages")


class RespiratoryRateRecord(Base):
    __tablename__ = "respiratory_rate_records"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    breaths_per_minute = Column(Double, nullable=False)
    source = Column(String(20), nullable=False, default="HEALTH_CONNECT")
    timestamp = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "timestamp", "source", name="uq_respiratory"),
        Index("ix_respiratory_user_ts", "user_id", "timestamp"),
    )


class BodyTemperatureRecord(Base):
    __tablename__ = "body_temperature_records"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    celsius = Column(Double, nullable=False)
    source = Column(String(20), nullable=False, default="HEALTH_CONNECT")
    timestamp = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "timestamp", "source", name="uq_body_temp"),
        Index("ix_body_temp_user_ts", "user_id", "timestamp"),
    )


class ScaleMeasurement(Base):
    __tablename__ = "scale_measurements"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    source = Column(String(50), nullable=False)
    device_id = Column(String(100), nullable=True)
    device_user_id = Column(String(100), nullable=True)
    measured_at = Column(DateTime(timezone=True), nullable=False)

    # Basic metrics
    weight_kg = Column(Double, nullable=False)
    bmi = Column(Double, nullable=True)
    body_fat_pct = Column(Double, nullable=True)
    muscle_pct = Column(Double, nullable=True)
    water_pct = Column(Double, nullable=True)
    protein_pct = Column(Double, nullable=True)
    visceral_fat = Column(Double, nullable=True)
    bone_mass_kg = Column(Double, nullable=True)
    bmr_kcal = Column(Double, nullable=True)
    body_age = Column(Double, nullable=True)
    score = Column(Double, nullable=True)

    # Detail metrics
    heart_rate_bpm = Column(Integer, nullable=True)
    body_water_mass_kg = Column(Double, nullable=True)
    fat_mass_kg = Column(Double, nullable=True)
    protein_mass_kg = Column(Double, nullable=True)
    muscle_mass_kg = Column(Double, nullable=True)
    skeletal_muscle_mass_kg = Column(Double, nullable=True)
    fat_free_body_weight_kg = Column(Double, nullable=True)
    skeletal_muscle_index = Column(Double, nullable=True)
    recommended_calorie_intake_kcal = Column(Double, nullable=True)
    waist_hip_ratio = Column(Double, nullable=True)
    bone_mineral_pct = Column(Double, nullable=True)

    # Segmental data as JSON
    segmental_data = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("device_id", "measured_at", name="uq_scale_measurement"),
        Index("ix_scale_measured_at", "measured_at"),
    )
