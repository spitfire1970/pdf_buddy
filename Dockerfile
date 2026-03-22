# Stage 1: Build the React/Vite frontend
FROM node:22-alpine AS frontend-builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci && npx patch-package

COPY index.html tsconfig.json vite.config.ts tailwind.config.ts tailwind.css biome.json ./
COPY public/ ./public/
COPY src/ ./src/

RUN npm run build

# Stage 2: Python backend + nginx to serve frontend on port 3000
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends nginx && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY application.py ./
COPY --from=frontend-builder /app/dist ./dist
COPY nginx.conf /etc/nginx/sites-enabled/default

# 3000 = frontend (nginx), 8000 = backend (uvicorn)
EXPOSE 3000 8000

CMD ["sh", "-c", "uvicorn application:app --host 0.0.0.0 --port 8000 & nginx -g 'daemon off;'"]
