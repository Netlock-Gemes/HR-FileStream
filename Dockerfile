FROM python:3.11-slim

WORKDIR /app

# Better Python behavior in Docker
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install dependencies first (Docker cache friendly)
COPY requirements.txt .

RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Start application
CMD ["python", "-m", "FileStream"]