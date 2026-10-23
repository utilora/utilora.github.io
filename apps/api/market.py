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
    disclaimer: str = (
        "\u5408\u6210\u6f14\u793a\u6570\u636e\uff0c"
        "\u4e0d\u4ee3\u8868\u771f\u5b9e\u884c\u60c5\uff0c"
        "\u4e0d\u6784\u6210\u8bc1\u5238\u6295\u8d44\u5efa\u8bae\u3002"
    )


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
        raise HTTPException(status_code=404, detail="\u80a1\u7968\u4e0d\u5b58\u5728")
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
        raise HTTPException(status_code=422, detail="start_date \u4e0d\u80fd\u665a\u4e8e end_date")
    if provider.get_instrument(instrument_id) is None:
        raise HTTPException(status_code=404, detail="\u80a1\u7968\u4e0d\u5b58\u5728")
    bars = provider.daily_bars(instrument_id, start_date, end_date, limit)
    return BarsResponse(
        data=[BarResponse(**bar.__dict__) for bar in bars],
        meta=DataMeta(
            data_source=provider.capabilities().provider_code,
            as_of=datetime.fromisoformat("2026-10-22T16:00:00+08:00"),
        ),
    )
