FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY dashboard.py /usr/local/bin/dashboard
COPY .env.example /app/.env.example

RUN chmod +x /usr/local/bin/dashboard

EXPOSE 8080

CMD ["dashboard"]
