import logging
from contextlib import asynccontextmanager

import firebase_admin
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin import credentials

from app.config import settings
from app.database import engine
from app.models import Base
from app.routers import auth_router, query_router, scale_router, sync_router

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Database ────────────────────────────────────────────────────
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # ── Firebase ────────────────────────────────────────────────────
    try:
        cred = credentials.Certificate(settings.FIREBASE_SA_PATH)
        firebase_admin.initialize_app(cred)
        log.info("Firebase Admin SDK initialized")
    except Exception as e:
        log.warning("Firebase init failed (FCM push-sync disabled): %s", e)

    yield
    await engine.dispose()


app = FastAPI(
    title="HealthBridge API",
    description="Backend-Server fuer HealthBridge - Empfaengt Gesundheitsdaten und stellt sie fuer Google AI Studio bereit",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(sync_router.router)
app.include_router(query_router.router)
app.include_router(scale_router.router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
