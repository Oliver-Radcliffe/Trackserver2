# Trackserver2 Production Dockerfile
# Multi-stage build: Node for dashboard, Python for backend

# =============================================================================
# Stage 1: Build React Dashboard
# =============================================================================
FROM node:20-alpine AS dashboard-builder

WORKDIR /app/dashboard

# Copy package files
COPY dashboard/package*.json ./

# Install dependencies
RUN npm ci

# Copy dashboard source
COPY dashboard/ ./

# Build for production
RUN npm run build

# =============================================================================
# Stage 2: Python Backend with Dashboard
# =============================================================================
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY trackserver2/ trackserver2/
COPY tools/ tools/

# Copy built dashboard from stage 1
COPY --from=dashboard-builder /app/dashboard/dist /app/static

# Create non-root user
RUN useradd -m -u 1000 trackserver && \
    chown -R trackserver:trackserver /app
USER trackserver

# Expose ports
# 4509 = ciNet protocol (TCP/UDP) - requires separate hosting
# 8080 = REST API + WebSocket + Dashboard (or PORT env var on Render)
EXPOSE 4509 8080

# Environment defaults (PORT is set by Render, DATABASE_URL by Render PostgreSQL)
ENV CINET_HOST=0.0.0.0 \
    CINET_PORT=4509 \
    API_HOST=0.0.0.0 \
    LOG_LEVEL=INFO \
    STATIC_DIR=/app/static

# Run the server
CMD ["python", "-m", "trackserver2.main"]
