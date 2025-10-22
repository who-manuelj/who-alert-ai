# frontend/Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build the app
RUN npm run build

# Expose port 3000 and serve built files with Vite preview (host exposed)
EXPOSE 3000

CMD ["npm", "run", "preview", "--", "--host", "--port", "3000"]
