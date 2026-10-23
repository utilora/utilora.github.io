FROM mcr.microsoft.com/devcontainers/python:1-3.12-bookworm
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs postgresql-client redis-tools \
    && rm -rf /var/lib/apt/lists/*

