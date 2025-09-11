# WHO Alerts AI Assistant

This is a full-stack chatbot application that answers questions **strictly** based on the official [WHO Medical Product Alerts](https://www.who.int/teams/regulation-prequalification/incidents-and-SF/full-list-of-who-medical-product-alerts). It combines an AI model (Mistral) with a local FAISS vector search index to retrieve and summarize alert information from 2013 to present.

---

## Features

- Search WHO alerts using natural language (e.g., “What were the alerts from Nigeria in 2024?”)
- Hybrid RAG (Retrieval-Augmented Generation) pipeline using FAISS + Mistral
- Multi-turn chat with persistent memory and semantic fallback
- Filter-based structured form query support
- Uses either local Mistral via [Ollama](https://ollama.com) or a hosted Mistral API
- Built for fast, domain-specific querying over structured health data

---

## Tech Stack

| Layer     | Tech                          |
| --------- | ----------------------------- |
| Frontend  | React + TypeScript + Vite     |
| Backend   | Node.js + Express             |
| Vector DB | FAISS (Node.js bindings)      |
| Embedding | MiniLM (via JS wrapper)       |
| LLM       | Mistral (local or remote API) |
| Data      | WHO medical alert dataset     |

---

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/who-alerts-ai.git
cd who-alerts-ai
```
````

### 2. Install dependencies

```bash
npm install
```

### 3. Start the backend and frontend

```bash
npm run dev
```

This will start both the backend API and the React frontend.

---

## How It Works

- **First user query** triggers FAISS search over the alert dataset using MiniLM embeddings.
- **Top-N chunks** are injected into Mistral’s context window for retrieval-augmented generation.
- **Mistral LLM** responds using only the retrieved WHO alert data.
- **Multi-turn conversations** retain context, unless the model responds too generically, in which case FAISS is triggered again.
- **Form-based filters** (e.g., "Year: 2023", "Country: Nigeria") also use the same `/api/query` endpoint and update the chat history directly.

---

## Data Handling

- On **first server start**, if `alert_chunks.json` and the FAISS index do not exist:

  - The backend scrapes the WHO medical product alerts website
  - Saves parsed alerts to `alert_chunks.json`
  - Builds FAISS embeddings from the scraped data

- On subsequent queries, the backend loads cached alerts and embeddings for fast search.

- You can **force a rebuild** of alerts and embeddings at any time by calling:

```http
GET /api/rebuild-embeddings
```

---

## Deployment

- Can be deployed on platforms like **Netlify** (frontend) + **Render/Heroku/Vercel** (backend).
- No Python runtime is required anymore.
- Just ensure the backend server has enough disk space to cache `alert_chunks.json` and the FAISS index.

```

```
