# WHO-Alert-AI

A Node.js-based AI assistant for querying WHO medical product alerts (2013–2025) using semantic search and Mistral API embeddings. The project includes a frontend, a backend, and optional Docker setup for easy deployment.

---

## Features

* **Query WHO Alerts** using natural language.
* **Semantic search** via Mistral API embeddings.
* **Rebuild embeddings** via API endpoint when new alerts are added.
* **Dockerized full-stack** (frontend + backend) with persistent embeddings.
* **Frontend** built with a separate stage and served statically by the backend.

---

## Repository Structure

```
WHO-Alert-AI/
├── backend/
│   ├── embeddings/
│   │   ├── alert_chunks.json
│   │   └── alert_chunks_with_embeds.json
│   ├── search/
│   ├── helpers/
│   ├── scraper/
│   ├── index.js
│   └── package.json
├── frontend/
│   ├── package.json
│   └── ... (frontend source files)
├── Dockerfile
└── README.md
```

* `backend/embeddings` — stores raw alert JSON and precomputed embeddings.
* `frontend/` — frontend source code (built into `backend/public` during Docker build).
* `backend/index.js` — Express server with API endpoints.
* `backend/embeddings/generate_embeddings.mjs` — script to generate embeddings using Mistral API.

---

## Environment Variables

Create a `.env` file in `backend/` with:

```env
MISTRAL_API_URL=https://api.mistral.ai/v1/chat/completions
MISTRAL_API_KEY=<your_mistral_api_key>
MISTRAL_MODEL=mistral-medium

EMBEDDING_API_URL=https://api.mistral.ai/v1/embeddings
EMBEDDING_MODEL=mistral-embed
EMBEDDING_BATCH_SIZE=8
```

---

## Available API Endpoints

| Endpoint                  | Method | Description                                                                                              |
| ------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `/api/alerts`             | GET    | Returns all cached WHO alerts.                                                                           |
| `/api/query`              | POST   | Query alerts with semantic search. Request body: `{ messages: [{role, content}], filters: {} }`          |
| `/api/rescrape`           | POST   | Rescrape the WHO Medical Alerts Website with new data. (The embeddings will still need to be rebuilt.)`  |
| `/api/rebuild-embeddings` | POST   | Regenerates embeddings for all alerts using Mistral API. JSON files are updated in `backend/embeddings`. |

---

## Docker Setup

### Build the Docker image

```bash
docker build -t who-alert-ai .
```

### Run the container with persistent embeddings

```bash
docker run -p 5000:5000 -v ${PWD}/backend/embeddings:/app/backend/embeddings who-alert-ai
```

* `-v` ensures your JSON files persist between container runs.

### Access the app

* Backend API: `http://localhost:5000`
* Frontend: `http://localhost:5000` (served statically from `backend/public`)

---

## Local Development (Optional)

If you prefer to run without Docker:

```bash
# Backend
cd backend
npm install
npm start

# Frontend
cd frontend
npm install
npm run build
```

Ensure `.env` is present in `backend/` with the correct API keys.

---

## Regenerating Embeddings

You can regenerate embeddings either by:

1. Calling the rebuild endpoint:

```bash
curl -X POST http://localhost:5000/api/rebuild-embeddings
```

2. Or running directly inside backend:

```bash
node embeddings/generate_embeddings.mjs
```

> JSON files are stored in `backend/embeddings` (and persisted if using Docker volume).

---

## Notes

* Fully Node.js — no Python.
* Uses **Mistral API embeddings** for semantic search.
* Frontend build is included in the Docker image and served by Express.
* Supports volume mounting for embeddings to avoid rebuilding on every container start.

---
