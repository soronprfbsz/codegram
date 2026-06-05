FROM python:3.13-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System dependencies: build tools for native wheels + postgres client utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first for better layer caching.
# Only the project metadata is copied here; application source is bind-mounted at runtime.
# hatchling requires the configured package (packages = ["app"]) to exist at build time,
# so create a throwaway stub package just to satisfy the wheel build, install the project
# (which pulls in all dependencies), then delete the stub. The real `app/` is bind-mounted
# at runtime and the installed dependencies stay in site-packages.
COPY pyproject.toml ./
RUN mkdir -p app \
    && echo '"""stub package replaced by bind-mounted source at runtime."""' > app/__init__.py \
    && pip install --upgrade pip \
    && pip install ".[dev]" \
    && pip uninstall -y erd-dbml-backend \
    && rm -rf app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]
