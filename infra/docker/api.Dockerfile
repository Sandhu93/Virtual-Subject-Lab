FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/src

WORKDIR /app

COPY pyproject.toml README.md ./
COPY src ./src
COPY alembic ./alembic
COPY packages ./packages

RUN pip install --upgrade pip && pip install .

CMD ["uvicorn", "virtual_subject.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
