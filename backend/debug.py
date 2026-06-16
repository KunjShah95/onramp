from fastapi.testclient import TestClient
from app.main import app
from app.database.config import db_config
print('env=', db_config.env, flush=True)
print('db_url=', db_config.database_url, flush=True)
with TestClient(app) as client:
    print('client created', flush=True)
    resp = client.get('/api/v1/teams/nonexistent-team-id', headers={'Authorization': 'Bearer ' + 'a'*25})
    print('status=', resp.status_code, flush=True)
    print('body=', resp.text, flush=True)
