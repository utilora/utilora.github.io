CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE data_source (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code varchar(50) NOT NULL UNIQUE,
    name varchar(120) NOT NULL,
    source_type varchar(30) NOT NULL CHECK (source_type IN ('demo', 'free', 'licensed')),
    license_scope jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE data_snapshot (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    data_source_id uuid NOT NULL REFERENCES data_source(id),
    dataset_type varchar(40) NOT NULL,
    as_of_at timestamptz NOT NULL,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    status varchar(20) NOT NULL,
    content_hash char(64),
    quality_summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE instrument (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exchange varchar(10) NOT NULL,
    symbol varchar(16) NOT NULL,
    name_cn varchar(80) NOT NULL,
    board varchar(30) NOT NULL,
    list_date date,
    delist_date date,
    UNIQUE (exchange, symbol)
);
CREATE INDEX ix_instrument_symbol ON instrument(symbol);
CREATE INDEX ix_instrument_name_cn ON instrument(name_cn);

CREATE TABLE daily_bar (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    instrument_id uuid NOT NULL REFERENCES instrument(id),
    trade_date date NOT NULL,
    open numeric(20,6) NOT NULL,
    high numeric(20,6) NOT NULL,
    low numeric(20,6) NOT NULL,
    close numeric(20,6) NOT NULL,
    volume numeric(24,4) NOT NULL,
    amount numeric(24,4) NOT NULL,
    adjustment_type varchar(10) NOT NULL DEFAULT 'none',
    data_snapshot_id uuid NOT NULL REFERENCES data_snapshot(id),
    quality_status varchar(20) NOT NULL DEFAULT 'ok',
    UNIQUE (instrument_id, trade_date, adjustment_type, data_snapshot_id),
    CHECK (open >= 0 AND low >= 0),
    CHECK (high >= open AND high >= close AND high >= low),
    CHECK (low <= open AND low <= close AND low <= high),
    CHECK (volume >= 0 AND amount >= 0)
);
CREATE INDEX ix_daily_bar_instrument_date ON daily_bar(instrument_id, trade_date DESC);
CREATE INDEX ix_daily_bar_date_instrument ON daily_bar(trade_date, instrument_id);

INSERT INTO data_source (code, name, source_type, license_scope)
VALUES ('demo_v1', 'Built-in synthetic demo data', 'demo', '{"redistribution": true, "synthetic": true}');
