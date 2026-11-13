# ---------- Stage 1: build the website (web/) to static files ----------
FROM node:22-alpine AS web

WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build


# ---------- Stage 2: the bot, streaming server and API (backend/) ----------
FROM python:3.11-slim

WORKDIR /app/backend

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# Keeps the bot session and poster cache on the ./data volume, outside the code
ENV DATA_DIR=/app/data
ENV WEB_DIR=/app/web/out

COPY backend/requirements.txt .
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=web /web/out /app/web/out

CMD ["python", "-m", "FileStream"]
