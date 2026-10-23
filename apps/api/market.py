from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services.market_data.demo import DemoMarketDataProvider

router = APIRouter()
provider = DemoMarketDataProvider()


class InstrumentResponse(BaseModel):
    id: UUID
    exchange: str
    symbol: str
    name_cn: str
    board: str


class BarResponse(BaseModel):
    trade_date: date
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    amount: Decimal


class DataMeta(BaseModel):
    data_source: str
    data_kind: str = "synthetic_demo"
    as_of: datetime
    quality_status: str = "demo"
    disclaimer: str = "?????????????????????????"


class BarsResponse(BaseModel):
    data: list[BarResponse]
    meta: DataMeta


@router.get("/instruments/search", response_model=list[InstrumentResponse], tags=["instruments"])
def search_instruments(
    q: str = Query(min_length=1, max_length=80),
    limit: int = Query(10, ge=1, le=20),
) -> list[InstrumentResponse]:
    return [InstrumentResponse(**item.__dict__) for item in provider.search_instruments(q, limit)]


@router.get("/instruments/{instrument_id}", response_model=InstrumentResponse, tags=["instruments"])
def get_instrument(instrument_id: UUID) -> InstrumentResponse:
    item = provider.get_instrument(instrument_id)
    if item is None:
        raise HTTPException(status_code=404, detail="?????")
    return InstrumentResponse(**item.__dict__)


@router.get("/instruments/{instrument_id}/bars", response_model=BarsResponse, tags=["instruments"])
def get_bars(
    instrument_id: UUID,
    start_date: date | None = None,
    end_date: date | None = None,
    adjustment: str = Query("none", pattern="^(none|forward|backward)$"),
    limit: int = Query(500, ge=1, le=2000),
) -> BarsResponse:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date ???? end_date")
    if provider.get_instrument(instrument_id) is None:
        raise HTTPException(status_code=404, detail="?????")
    bars = provider.daily_bars(instrument_id, start_date, end_date, limit)
    return BarsResponse(
        data=[BarResponse(**bar.__dict__) for bar in bars],
        meta=DataMeta(
            data_source=provider.capabilities().provider_code,
            as_of=datetime.fromisoformat("2026-10-22T16:00:00+08:00"),
        ),
    )
