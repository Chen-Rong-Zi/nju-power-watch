# Docker Deployment Guide

## Prerequisites

- Docker Engine 24+
- Docker Compose v2+

## Quick Start (Production)

```bash
docker compose -f docs/docker/docker-compose.yml up frontend
```

Open http://localhost:80

## Development Mode

```bash
# Start with hot-reload
docker compose -f docs/docker/docker-compose.yml --profile dev up dev
```

Open http://localhost:8000 — the `docs/` directory is mounted as a volume so
changes take effect immediately (browser hard-refresh required).

## One-off Data Pipeline

```bash
# Run a Python script inside the pipeline container
docker compose -f docs/docker/docker-compose.yml --profile pipeline run pipeline \
    scripts/serve_docs.py --port 8000
```

## Build & Architecture

| Image | Base | Purpose |
|-------|------|---------|
| `production` | `nginx:alpine` (~25 MB) | Serves static frontend |
| `dev` | `python:3.11-slim` (~200 MB) | Development with file watching |
| `pipeline` | `python:3.11-slim` | Data collection / aggregation |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NJU_USERNAME` | for pipeline | NJU epay username |
| `NJU_PASSWORD` | for pipeline | NJU epay password |
| `YUNMA_TOKEN` | for pipeline | Yunma CAPTCHA token |
