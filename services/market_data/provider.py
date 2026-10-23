from dataclasses import dataclass
from datetime import date
from typing import Protocol


@dataclass(frozen=True)
class ProviderCapabilities:
    provider_code: str
    supports_daily_bars: bool
    supports_trade_calendar: bool
    redistribution_allowed: bool


class MarketDataProvider(Protocol):
    """Stable boundary for demo and future licensed market-data providers."""

    def capabilities(self) -> ProviderCapabilities: ...

    def trading_days(self, start: date, end: date) -> list[date]: ...

