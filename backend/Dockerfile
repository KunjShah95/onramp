FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
# We copy into /app/app because the uvicorn command runs `app.main:app`
COPY ./app ./app

# Expose port 8000
EXPOSE 8000

# Start FastAPI server
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
