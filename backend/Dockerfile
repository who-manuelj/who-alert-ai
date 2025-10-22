# ===== BACKEND DOCKERFILE =====
FROM node:20 AS backend
WORKDIR /app

# Copy and install dependencies
COPY package*.json ./
RUN npm install

# Copy backend source code
COPY . .

# Expose backend API port
EXPOSE 5000

# Start the backend server
CMD ["npm", "start"]
