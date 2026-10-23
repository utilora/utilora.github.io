from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Protocol
from uuid import UUID


@dataclass(frozen=True)
class ProviderCapabilities:
    provider_code: str
    supports_daily_bars: bool
    supports_trade_calendar: bool
    redistribution_allowed: bool

@dataclass(frozen=True)
class Instrument:
    id: UUID
    exchange: str
    symbol: str
    name_cn: str
    board: str


@dataclass(frozen=True)
class DailyBar:
    trade_date: date
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    amount: Decimal



class MarketDataProvider(Protocol):
    """Stable boundary for demo and future licensed market-data providers."""

    def capabilities(self) -> ProviderCapabilities: ...

    def trading_days(self, start: date, end: date) -> list[date]: ...

    def search_instruments(self, query: str, limit: int) -> list[Instrument]: ...

    def get_instrument(self, instrument_id: UUID) -> Instrument | None: ...

    def daily_bars(
        self, instrument_id: UUID, start: date | None, end: date | None, limit: int
    ) -> list[DailyBar]: ...

