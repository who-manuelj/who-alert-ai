# ---- Frontend build stage ----
FROM node:20 AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install

COPY frontend/ .
RUN npm run build

# ---- Backend stage ----
FROM node:20 AS backend

# Install Python 3 and pip
RUN apt-get update && \
    apt-get install -y python3 python3-venv python3-pip && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

# Copy backend dependencies
COPY backend/package*.json ./
RUN npm install

# Copy Python requirements and create venv
COPY backend/embeddings/requirements.txt ./embeddings/
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir -r ./embeddings/requirements.txt

# Copy backend source
COPY backend/ .

# Copy frontend build output into backend/public
COPY --from=frontend-build /app/frontend/dist ./public

# Expose API port (matches backend/index.js default)
EXPOSE 5000

# Run backend
CMD ["node", "index.js"]
