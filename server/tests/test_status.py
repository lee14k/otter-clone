def test_status_returns_current_state(client):
    created = client.post("/api/lectures", json={}).json()
    r = client.get(f"/api/lectures/{created['id']}/status")
    assert r.status_code == 200
    assert r.json()["status"] == "transcribing"


def test_status_404_when_missing(client):
    assert client.get("/api/lectures/nope/status").status_code == 404
