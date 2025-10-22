# ===== FRONTEND BUILD STAGE =====
FROM node:20 AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend .
RUN npm run build

# ===== BACKEND STAGE =====
FROM node:20 AS backend
WORKDIR /app/backend

# Copy package.json & install dependencies
COPY backend/package*.json ./
RUN npm install

# Copy backend source
COPY backend ./

# Copy built frontend into backend/public
COPY --from=frontend /app/frontend/dist ./public

# Allow mounting /embeddings as a volume for persistent JSON
VOLUME ["/app/backend/embeddings"]

# Expose backend port
EXPOSE 5000

# Start backend
CMD ["npm", "start"]
