FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY trackserver2/ trackserver2/
COPY tools/ tools/

# Create non-root user
RUN useradd -m -u 1000 trackserver
USER trackserver

# Expose ports
EXPOSE 4509 8080

# Run the server
CMD ["python", "-m", "trackserver2.main"]
