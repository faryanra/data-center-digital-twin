FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY services/api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && groupadd --system app \
    && useradd --system --gid app --no-create-home app

COPY --chown=app:app common ./common
COPY --chown=app:app services ./services
COPY --chown=app:app simulation ./simulation
COPY --chown=app:app config ./config

USER app
CMD ["python", "-m", "services.api.api_service"]
