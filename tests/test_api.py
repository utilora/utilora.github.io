from fastapi.testclient import TestClient

from apps.api.main import app

client = TestClient(app)


def test_liveness() -> None:
    response = client.get("/api/v1/health/live")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_demo_status_never_exposes_probabilities() -> None:
    response = client.get("/api/v1/system/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "demo"
    assert payload["model_probabilities_visible"] is False


def test_instrument_search_and_bars_are_traceable_demo_data() -> None:
    search = client.get("/api/v1/instruments/search", params={"q": "600519"})
    assert search.status_code == 200
    instrument_id = search.json()[0]["id"]

    response = client.get(f"/api/v1/instruments/{instrument_id}/bars", params={"limit": 5})
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["data"]) == 5
    assert payload["meta"]["data_source"] == "demo_v1"
    assert payload["meta"]["data_kind"] == "synthetic_demo"
    assert "??????" in payload["meta"]["disclaimer"]


def test_bars_reject_invalid_date_range() -> None:
    instrument_id = "00000000-0000-0000-0000-000000000001"
    response = client.get(
        f"/api/v1/instruments/{instrument_id}/bars",
        params={"start_date": "2026-10-22", "end_date": "2026-10-01"},
    )
    assert response.status_code == 422
