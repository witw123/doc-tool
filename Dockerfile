# Multi-stage lightweight Python base
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code and static assets
COPY backend/ ./backend/
COPY static/ ./static/
COPY tests/ ./tests/
COPY app.py .

# Expose default port
EXPOSE 8000

# Run FileScope server
CMD ["python", "app.py", "--host", "0.0.0.0", "--port", "8000"]
