FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml README.md ./
COPY src ./src
COPY alembic ./alembic

RUN pip install --upgrade pip && pip install .

CMD ["python", "-m", "virtual_subject.worker.main"]

