COMPOSE=docker compose -f infra/compose.yaml

.PHONY: up down logs test lint format migrate smoke

up:
	$(COMPOSE) up --build

down:
	$(COMPOSE) down -v

logs:
	$(COMPOSE) logs -f

test:
	pytest

lint:
	ruff check .

format:
	ruff check . --fix

migrate:
	alembic upgrade head

smoke:
	pytest -k smoke

