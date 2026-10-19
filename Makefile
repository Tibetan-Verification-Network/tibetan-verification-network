.DEFAULT_GOAL := help

.PHONY: help install start stop logs lint test build check migrate smoke bootstrap-admin

help:
	@echo "install          Install backend and frontend dependencies"
	@echo "start            Build and start PostgreSQL, the API, and the frontend"
	@echo "stop             Stop the local services"
	@echo "logs             Follow service logs"
	@echo "lint             Run lint and type checks"
	@echo "test             Run tests and the production frontend build"
	@echo "build            Compile the API and build the frontend"
	@echo "check            Run lint and test"
	@echo "smoke            Check that the local services are answering"
	@echo "migrate          Apply backend Alembic migrations to head"
	@echo "bootstrap-admin  Create the first platform administrator"

install:
	cd backend && uv sync --frozen --all-groups
	cd frontend && npm ci

start:
	docker compose up --build --detach --wait --wait-timeout 180

stop:
	docker compose down

logs:
	docker compose logs --follow

lint:
	cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy
	cd frontend && npm run lint && npm run typecheck && npm run format:check

test: test-backend test-frontend

test-backend:
	cd backend && uv run pytest

test-frontend:
	cd frontend && npm test
	cd frontend && npm run build
	cd frontend && node scripts/verify-dist.mjs

build:
	cd backend && uv run python -m compileall -q app
	cd frontend && npm run build
	cd frontend && node scripts/verify-dist.mjs

check: lint test

smoke:
	curl --fail --silent --show-error http://127.0.0.1:8000/health
	@echo
	curl --fail --silent --show-error http://127.0.0.1:8000/ready
	@echo
	curl --fail --silent --show-error --output /dev/null http://127.0.0.1:5173/

migrate:
	cd backend && uv run alembic upgrade head

bootstrap-admin:
	cd backend && uv run tvn-bootstrap-admin --email "$${TVN_BOOTSTRAP_EMAIL:?set TVN_BOOTSTRAP_EMAIL}"
