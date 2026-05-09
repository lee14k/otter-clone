def test_create_lecture_returns_id_and_default_title(client):
    r = client.post("/api/lectures", json={})
    assert r.status_code == 201
    body = r.json()
    assert "id" in body
    assert body["title"].startswith("Lecture ")
    assert body["status"] == "transcribing"


def test_create_lecture_with_explicit_title(client):
    r = client.post("/api/lectures", json={"title": "Calc 101 lecture 1"})
    assert r.status_code == 201
    assert r.json()["title"] == "Calc 101 lecture 1"


def test_list_lectures_returns_newest_first(client):
    a = client.post("/api/lectures", json={"title": "A"}).json()
    b = client.post("/api/lectures", json={"title": "B"}).json()
    rows = client.get("/api/lectures").json()
    assert [r["id"] for r in rows[:2]] == [b["id"], a["id"]]


def test_get_lecture_404_when_missing(client):
    assert client.get("/api/lectures/does-not-exist").status_code == 404


def test_get_lecture_includes_empty_segments_and_summaries(client):
    created = client.post("/api/lectures", json={"title": "X"}).json()
    detail = client.get(f"/api/lectures/{created['id']}").json()
    assert detail["segments"] == []
    assert detail["summaries"] == []


def test_patch_lecture_updates_title(client):
    created = client.post("/api/lectures", json={"title": "old"}).json()
    r = client.patch(f"/api/lectures/{created['id']}", json={"title": "new"})
    assert r.status_code == 200
    assert r.json()["title"] == "new"


def test_delete_lecture(client):
    created = client.post("/api/lectures", json={"title": "x"}).json()
    assert client.delete(f"/api/lectures/{created['id']}").status_code == 204
    assert client.get(f"/api/lectures/{created['id']}").status_code == 404
