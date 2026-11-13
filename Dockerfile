# Frontend-Build; der lesbare Originalquelltext bleibt im Download erhalten.
FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.lock /app/backend/requirements.lock
RUN pip install --no-cache-dir -r /app/backend/requirements.lock
COPY backend/ /app/backend/
COPY --from=frontend /build/frontend/dist /app/frontend/dist
COPY --from=frontend /usr/local/bin/node /usr/local/bin/node
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser
WORKDIR /app/backend
EXPOSE 5000
CMD ["sh", "-c", "flask --app wsgi:app db upgrade && exec gunicorn --bind 0.0.0.0:5000 --workers 1 --threads 4 --timeout 180 wsgi:app"]
