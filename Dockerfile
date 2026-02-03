# ==========================================
# Stage 1: Build Frontend
# ==========================================
FROM node:20-alpine as frontend-builder
WORKDIR /app/frontend

# Install dependencies
COPY treasure-hunt-frontend/package*.json ./
RUN npm install

# Build frontend
COPY treasure-hunt-frontend/ .
RUN npm run build

# ==========================================
# Stage 2: Build Backend & Final Runtime
# ==========================================
FROM node:20-bullseye-slim

# 1. Install System Dependencies (Python 3)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2. Setup Python Environment
ENV VIRTUAL_ENV=/app/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# 3. Install Python Dependencies
# We use CPU-only version of PyTorch to reduce image size (~700MB vs ~3GB)
COPY treasure-hunt-backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

# 4. Setup Backend
WORKDIR /app/backend
COPY treasure-hunt-backend/package*.json ./
RUN npm install

# Copy backend source code
COPY treasure-hunt-backend/ .

# Build backend (TypeScript -> JavaScript)
RUN npm run build

# 5. Integrate Frontend
# Copy built frontend assets to backend's public directory
# The backend is configured to serve static files from 'public' if they exist
COPY --from=frontend-builder /app/frontend/dist ./public

# 6. Final Configuration
ENV NODE_ENV=production
ENV PORT=3000
# Ensure Python path points to our venv
ENV PYTHON_PATH="$VIRTUAL_ENV/bin/python3"

EXPOSE 3000

CMD ["npm", "start"]
