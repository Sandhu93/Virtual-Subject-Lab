#!/usr/bin/env bash
# RunPod pod startup script.
# Run once after creating the pod to install, configure, and start all services.
#
# Usage (from inside the RunPod pod terminal):
#   git clone <your-repo-url> /workspace/virtual-subject
#   cd /workspace/virtual-subject
#   bash scripts/runpod_start.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEIGHTS_DIR="/workspace/tribe-weights"

echo "=== Virtual Subject — RunPod Setup ==="
echo "Repo: $REPO_ROOT"
echo "Weights volume: $WEIGHTS_DIR"
echo ""

# ── 1. Persistent weights directory ──────────────────────────────────────────
mkdir -p "$WEIGHTS_DIR"

# ── 2. Create .env if missing ─────────────────────────────────────────────────
if [ ! -f "$REPO_ROOT/.env" ]; then
    cp "$REPO_ROOT/.env.runpod.example" "$REPO_ROOT/.env"
    echo "Created .env from .env.runpod.example"
    echo ""
    echo "  !! ACTION REQUIRED !!"
    echo "  Edit .env and fill in your HF_TOKEN before continuing:"
    echo "    nano $REPO_ROOT/.env"
    echo ""
    echo "  Get a token at: https://huggingface.co/settings/tokens"
    echo "  Accept the LLaMA license at: https://huggingface.co/meta-llama/Llama-3.2-3B"
    echo ""
    echo "  Then re-run this script."
    exit 0
fi

# Check HF_TOKEN is actually set
if grep -qE '^HF_TOKEN=hf_REPLACE_ME' "$REPO_ROOT/.env" 2>/dev/null; then
    echo "ERROR: HF_TOKEN is still the placeholder value in .env."
    echo "  Edit $REPO_ROOT/.env and replace hf_REPLACE_ME with your real token."
    exit 1
fi

# ── 3. Verify Docker ──────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    echo "ERROR: Docker not found."
    echo "  Use a RunPod template that includes Docker (e.g. runpod/pytorch)."
    exit 1
fi

# ── 4. Verify GPU access ──────────────────────────────────────────────────────
echo "Checking GPU access in Docker..."
if docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi -L 2>/dev/null; then
    echo "GPU confirmed."
else
    echo "WARNING: GPU not accessible in Docker containers."
    echo "  TRIBE inference will fall back to CPU (slow)."
    echo "  To fix: ensure the NVIDIA Container Toolkit is installed on this host."
fi
echo ""

# ── 5. Build and start services ───────────────────────────────────────────────
echo "Building images and starting services (this takes ~5-15 min on first run)..."
cd "$REPO_ROOT"
docker compose -f infra/compose.yaml -f infra/compose.runpod.yaml up -d --build
echo ""

# ── 6. Wait for API health ────────────────────────────────────────────────────
echo "Waiting for API to become healthy..."
ATTEMPTS=0
until curl -sf http://localhost:8000/api/v1/health >/dev/null 2>&1; do
    ATTEMPTS=$((ATTEMPTS + 1))
    if [ "$ATTEMPTS" -ge 60 ]; then
        echo "ERROR: API did not become healthy after 3 minutes."
        echo "  Check logs: docker compose -f infra/compose.yaml -f infra/compose.runpod.yaml logs api"
        exit 1
    fi
    sleep 3
done
echo "API is ready."
echo ""

# ── 7. Print access URLs ──────────────────────────────────────────────────────
echo "=== Services Running ==="
if [ -n "${RUNPOD_POD_ID:-}" ]; then
    echo "  Frontend  : https://${RUNPOD_POD_ID}-3000.proxy.runpod.net"
    echo "  API docs  : https://${RUNPOD_POD_ID}-8000.proxy.runpod.net/docs"
    echo "  MinIO     : https://${RUNPOD_POD_ID}-9001.proxy.runpod.net"
else
    echo "  Frontend  : http://localhost:3000"
    echo "  API docs  : http://localhost:8000/docs"
    echo "  MinIO     : http://localhost:9001"
fi
echo ""
echo "NOTE: Model weights download on the first inference run (~10-15 GB)."
echo "      The worker log will show download progress:"
echo "      docker compose -f infra/compose.yaml -f infra/compose.runpod.yaml logs -f worker"
echo ""
echo "To stop all services:"
echo "  docker compose -f infra/compose.yaml -f infra/compose.runpod.yaml down"
