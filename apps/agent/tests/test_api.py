from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from schemaingest import endpoints
from schemaingest.security import set_pairing_code
from schemaingest.server import create_app

PAGES = "https://jinethbosilu.github.io"


@pytest.fixture
def client() -> TestClient:
    set_pairing_code("123456")
    return TestClient(create_app())


def _token(client: TestClient) -> str:
    res = client.post("/pair/start", json={"code": "123456"})
    assert res.status_code == 200
    return res.json()["sessionToken"]


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_wrong_pairing_code_is_forbidden(client):
    assert client.post("/pair/start", json={"code": "000000"}).status_code == 403


def test_introspect_requires_a_session(client):
    assert client.post("/introspect", json={"dbname": "x"}).status_code == 422  # no header
    res = client.post("/introspect", json={"dbname": "x"}, headers={"Authorization": "Bearer bad"})
    assert res.status_code == 401


def test_introspect_passes_the_request_through(client, pack, monkeypatch):
    seen = []
    monkeypatch.setattr(endpoints, "introspect", lambda req: seen.append(req) or pack)
    res = client.post(
        "/introspect",
        json={"connectionString": "postgresql://a@b/c", "schema": "sales"},
        headers={"Authorization": f"Bearer {_token(client)}"},
    )
    assert res.status_code == 200
    assert seen[0].to_dsn() == "postgresql://a@b/c"
    assert seen[0].resolved_schema() == "sales"
    body = res.json()
    assert body["meta"]["schema"] == "public"
    assert body["tables"][0]["columns"][0]["isPrimaryKey"] is True


def test_introspect_passes_the_engine(client, pack, monkeypatch):
    seen = []
    monkeypatch.setattr(endpoints, "introspect", lambda req: seen.append(req) or pack)
    res = client.post(
        "/introspect",
        json={"engine": "mysql", "host": "db", "dbname": "shop", "user": "root"},
        headers={"Authorization": f"Bearer {_token(client)}"},
    )
    assert res.status_code == 200
    assert seen[0].resolved_engine() == "mysql"
    assert seen[0].to_mysql_params()["database"] == "shop"


def test_unknown_engine_is_rejected(client):
    res = client.post("/introspect", json={"engine": "oracle", "dbname": "x"},
                      headers={"Authorization": f"Bearer {_token(client)}"})
    assert res.status_code == 422


@pytest.mark.parametrize("url", ["postgresql://bob:s3cret@db/x", "mysql://bob:s3cret@db/x"])
def test_introspect_error_is_redacted(client, monkeypatch, url):
    def boom(req):
        raise RuntimeError(f"could not connect: {url}")

    monkeypatch.setattr(endpoints, "introspect", boom)
    res = client.post("/introspect", json={"dbname": "x"},
                      headers={"Authorization": f"Bearer {_token(client)}"})
    assert res.status_code == 400
    assert "s3cret" not in res.text


def test_bad_mysql_url_is_a_400(client):
    res = client.post("/introspect", json={"connectionString": "mysql://root@localhost/"},
                      headers={"Authorization": f"Bearer {_token(client)}"})
    assert res.status_code == 400
    assert "Put the database" in res.json()["detail"]


def test_preflight_from_pages_allows_private_network(client):
    res = client.options("/pair/start", headers={
        "Origin": PAGES,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
        "Access-Control-Request-Private-Network": "true",
    })
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == PAGES
    assert res.headers["access-control-allow-private-network"] == "true"


def test_preflight_from_other_origin_is_refused(client):
    res = client.options("/pair/start", headers={
        "Origin": "https://evil.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Private-Network": "true",
    })
    # Without Access-Control-Allow-Origin the browser refuses the request,
    # whatever else the response says.
    assert res.status_code == 400
    assert "access-control-allow-origin" not in res.headers
