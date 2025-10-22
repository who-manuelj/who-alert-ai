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
COPY backend/package*.json ./
RUN npm install

# Copy backend source
COPY backend .

# Copy built frontend into backend/public
COPY --from=frontend /app/frontend/dist ./public

EXPOSE 5000
CMD ["npm", "start"]
