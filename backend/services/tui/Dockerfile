FROM python:3.11-slim

WORKDIR /app

# Install dependencies
RUN pip install poetry

# Copy project files
COPY pyproject.toml .
COPY app.py .
COPY __main__.py .

# Install dependencies
RUN poetry install --no-interaction --no-venv

# Run the TUI application
CMD ["poetry", "run", "python", "-m", "app"]