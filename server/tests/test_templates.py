def test_list_returns_seeded_defaults(client):
    rows = client.get("/api/templates").json()
    names = {r["name"] for r in rows}
    assert names == {"Study Guide", "Outline"}
    assert all(r["is_default"] for r in rows)


def test_create_template(client):
    r = client.post(
        "/api/templates",
        json={"name": "Anki", "prompt": "Make cards from {transcript}", "is_default": False},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Anki"
    assert body["is_default"] is False


def test_create_rejects_duplicate_name(client):
    client.post("/api/templates", json={"name": "X", "prompt": "{transcript}"})
    r = client.post("/api/templates", json={"name": "X", "prompt": "{transcript}"})
    assert r.status_code == 409


def test_create_rejects_template_without_transcript_placeholder(client):
    r = client.post("/api/templates", json={"name": "Bad", "prompt": "no placeholder"})
    assert r.status_code == 422


def test_patch_template(client):
    rows = client.get("/api/templates").json()
    sg = next(r for r in rows if r["name"] == "Study Guide")
    r = client.patch(f"/api/templates/{sg['id']}", json={"is_default": False})
    assert r.status_code == 200
    assert r.json()["is_default"] is False


def test_delete_template(client):
    created = client.post(
        "/api/templates", json={"name": "Temp", "prompt": "{transcript}"}
    ).json()
    assert client.delete(f"/api/templates/{created['id']}").status_code == 204
    rows = client.get("/api/templates").json()
    assert all(r["id"] != created["id"] for r in rows)
