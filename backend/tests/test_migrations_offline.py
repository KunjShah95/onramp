"""Regression test for Alembic's offline SQL generation path."""

from pathlib import Path
import subprocess
import sys


def test_alembic_head_offline_sql_generation():
    backend_dir = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head", "--sql"],
        cwd=backend_dir,
        capture_output=True,
        text=True,
        timeout=45,
    )
    assert result.returncode == 0, result.stderr[-4000:]
    assert "ALTER TABLE onramp_agent_events ADD COLUMN team_id" in result.stdout
    assert "ALTER TABLE onramp_embedding_chunks ADD COLUMN team_id" in result.stdout
    assert "ix_users_github_username" in result.stdout

    downgrade = subprocess.run(
        [sys.executable, "-m", "alembic", "downgrade", "head:base", "--sql"],
        cwd=backend_dir,
        capture_output=True,
        text=True,
        timeout=45,
    )
    assert downgrade.returncode == 0, downgrade.stderr[-4000:]
    assert "DROP COLUMN team_id" in downgrade.stdout
