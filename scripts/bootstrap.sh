#!/usr/bin/env bash
# bootstrap.sh — one-shot environment setup for local development.
#
# Usage:
#   bash scripts/bootstrap.sh
#
# What it does:
#   1. Copies .env.example → .env if .env does not already exist.
#   2. Creates the Python virtual environment (.venv) if absent.
#   3. Installs the package and dev dependencies.
#   4. Waits for Postgres to be ready (assumes Docker Compose is up).
#   5. Runs Alembic migrations to bring the schema to head.
#   6. Runs load_atlases.py to populate packages/atlas-assets/.
#
# To start the full stack first:
#   docker compose -f infra/compose.yaml up -d
# Then run this script.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ── 1. .env ──────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  echo "[bootstrap] Created .env from .env.example — edit as needed."
else
  echo "[bootstrap] .env already exists — skipping copy."
fi

# ── 2. Virtual environment ────────────────────────────────────────────────────
if [ ! -d .venv ]; then
  echo "[bootstrap] Creating .venv …"
  python3 -m venv .venv
fi
source .venv/bin/activate

# ── 3. Install dependencies ───────────────────────────────────────────────────
echo "[bootstrap] Installing package + dev extras …"
pip install -q --upgrade pip
pip install -q -e ".[dev]"

# ── 4. Wait for Postgres ──────────────────────────────────────────────────────
echo "[bootstrap] Waiting for Postgres …"
for i in $(seq 1 30); do
  if python - <<'EOF' 2>/dev/null
import os, psycopg
url = os.environ.get("DATABASE_URL", "")
# Strip SQLAlchemy dialect prefix for psycopg
url = url.replace("postgresql+psycopg://", "postgresql://")
with psycopg.connect(url): pass
EOF
  then
    echo "[bootstrap] Postgres is ready."
    break
  fi
  echo "[bootstrap]   attempt $i/30 — retrying in 2 s …"
  sleep 2
done

# ── 5. Alembic migrations ─────────────────────────────────────────────────────
echo "[bootstrap] Running Alembic migrations …"
alembic upgrade head

# ── 6. Atlas assets ───────────────────────────────────────────────────────────
echo "[bootstrap] Populating atlas assets …"
python scripts/load_atlases.py

echo ""
echo "[bootstrap] Done. Run the API:"
echo "  source .venv/bin/activate && virtual-subject-api"
echo "Run the worker (separate terminal):"
echo "  source .venv/bin/activate && virtual-subject-worker"
