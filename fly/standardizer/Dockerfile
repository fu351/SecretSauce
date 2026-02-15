FROM python:3.11-slim

# Scraper API shells out to node-based scraper scripts.
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY python-api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY python-api/main.py ./main.py
COPY lib/scrapers ./lib/scrapers

EXPOSE 8080

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
