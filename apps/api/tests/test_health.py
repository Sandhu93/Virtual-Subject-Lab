from fastapi.testclient import TestClient

from virtual_subject.api.main import app


client = TestClient(app)


def test_health_endpoint() -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "api"


def test_home_page() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "virtual-subject" in response.text

