from datetime import UTC, datetime

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from apps.api.config import get_settings

settings = get_settings()
app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="内部研究 API；不构成投资建议。",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)
router = APIRouter(prefix="/api/v1")


class HealthResponse(BaseModel):
    status: str
    environment: str
    timestamp: datetime


class SystemStatusResponse(BaseModel):
    mode: str
    model_probabilities_visible: bool
    data_status: str
    disclaimer: str


@router.get("/health/live", response_model=HealthResponse, tags=["system"])
def live() -> HealthResponse:
    return HealthResponse(
        status="ok",
        environment=settings.app_env,
        timestamp=datetime.now(UTC),
    )


@router.get("/system/status", response_model=SystemStatusResponse, tags=["system"])
def system_status() -> SystemStatusResponse:
    return SystemStatusResponse(
        mode="demo" if settings.demo_mode else "research",
        model_probabilities_visible=False,
        data_status="demo_ready" if settings.demo_mode else "not_configured",
        disclaimer="仅用于内部研究与测试，不构成证券投资建议。",
    )


app.include_router(router)

