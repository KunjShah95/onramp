from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.middleware.body_size import BodySizeLimitMiddleware


def _client(max_bytes=1024, monkeypatch=None):
    if monkeypatch is not None:
        monkeypatch.setenv("MAX_REQUEST_BODY_BYTES", str(max_bytes))
    else:
        import os

        os.environ["MAX_REQUEST_BODY_BYTES"] = str(max_bytes)
    app = FastAPI()
    app.add_middleware(BodySizeLimitMiddleware)

    @app.post("/echo")
    async def echo():
        return JSONResponse({"ok": True})

    return TestClient(app, raise_server_exceptions=False)


def test_small_body_passes(monkeypatch):
    c = _client(1024, monkeypatch)
    r = c.post("/echo", json={"a": 1})
    assert r.status_code == 200


def test_oversize_declared_length_rejected(monkeypatch):
    c = _client(10, monkeypatch)
    r = c.post(
        "/echo",
        content=b"x" * 100,
        headers={"Content-Length": "100", "Content-Type": "application/octet-stream"},
    )
    assert r.status_code == 413
    assert "too large" in r.text
