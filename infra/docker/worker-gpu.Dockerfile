FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/src

WORKDIR /app

# Build tools + ffmpeg (tribev2 uses ffmpeg for audio/video preprocessing)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY src ./src
COPY alembic ./alembic

# Install the base app
RUN pip install --upgrade pip && pip install uv .

# Install PyTorch with CUDA 12.1 support.
# RTX 3060 is Ampere (sm_86) — supported by CUDA 11.8+.
# If the model does not fit in 6 GB VRAM, set TRIBE_DEVICE=cpu in .env.
RUN pip install \
    torch torchaudio torchvision \
    --index-url https://download.pytorch.org/whl/cu121

# Install tribev2 from the facebookresearch GitHub repo.
# Repo: https://github.com/facebookresearch/tribev2 (public)
# Note: tribev2 has no [inference] extra — the base install is inference-ready.
RUN git clone --depth 1 https://github.com/facebookresearch/tribev2.git /tmp/tribev2 \
    && pip install /tmp/tribev2 \
    && rm -rf /tmp/tribev2

CMD ["python", "-m", "virtual_subject.worker.main"]
