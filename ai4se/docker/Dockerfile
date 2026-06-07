FROM python:3.11-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN python -m compileall -q . || true

FROM python:3.11-slim AS dev

WORKDIR /app

COPY --from=base /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY . .

EXPOSE 8000

CMD ["python", "scripts/serve_docs.py"]

FROM nginx:alpine AS production

RUN rm -rf /usr/share/nginx/html/*
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY docs/ /usr/share/nginx/html/

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:80/ || exit 1

EXPOSE 80

LABEL org.opencontainers.image.title="NJUPower - Dormitory Electricity Monitor"
LABEL org.opencontainers.image.description="NJU Dormitory Electricity Monitoring System"
LABEL org.opencontainers.image.source="https://github.com/Chen-Rong-Zi/nju-power-watch"
