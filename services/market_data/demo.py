from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from services.market_data.provider import DailyBar, Instrument, ProviderCapabilities


class DemoMarketDataProvider:
    """Deterministic synthetic data; never presented as licensed market data."""

    _instruments = (
        Instrument(
            UUID("00000000-0000-0000-0000-000000000001"),
            "SSE",
            "600519",
            "\u8d35\u5dde\u8305\u53f0",
            "\u4e3b\u677f",
        ),
        Instrument(
            UUID("00000000-0000-0000-0000-000000000002"),
            "SZSE",
            "000001",
            "\u5e73\u5b89\u94f6\u884c",
            "\u4e3b\u677f",
        ),
        Instrument(
            UUID("00000000-0000-0000-0000-000000000003"),
            "SSE",
            "688981",
            "\u4e2d\u82af\u56fd\u9645",
            "\u79d1\u521b\u677f",
        ),
    )

    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities("demo_v1", True, True, True)

    def trading_days(self, start: date, end: date) -> list[date]:
        days = []
        current = start
        while current <= end:
            if current.weekday() < 5:
                days.append(current)
            current += timedelta(days=1)
        return days

    def search_instruments(self, query: str, limit: int) -> list[Instrument]:
        query = query.strip().lower()
        return [
            item
            for item in self._instruments
            if query in item.symbol.lower() or query in item.name_cn.lower()
        ][:limit]

    def get_instrument(self, instrument_id: UUID) -> Instrument | None:
        return next((item for item in self._instruments if item.id == instrument_id), None)

    def daily_bars(
        self, instrument_id: UUID, start: date | None, end: date | None, limit: int
    ) -> list[DailyBar]:
        instrument = self.get_instrument(instrument_id)
        if instrument is None:
            return []
        end_date = min(end or date(2026, 10, 22), date(2026, 10, 22))
        start_date = start or end_date - timedelta(days=45)
        seed = int(instrument.symbol[-2:]) + 20
        bars = []
        for index, trade_date in enumerate(self.trading_days(start_date, end_date)):
            base = Decimal(seed) + Decimal(index) * Decimal("0.18")
            open_price = base + Decimal((index % 5) - 2) * Decimal("0.11")
            close = open_price + Decimal((index % 3) - 1) * Decimal("0.16")
            high = max(open_price, close) + Decimal("0.28")
            low = min(open_price, close) - Decimal("0.25")
            volume = Decimal(8_000_000 + index * 91_000)
            bars.append(DailyBar(trade_date, open_price, high, low, close, volume, close * volume))
        return bars[-limit:]
