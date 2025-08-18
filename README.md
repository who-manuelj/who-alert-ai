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

| Layer     | Tech                             |
| --------- | -------------------------------- |
| Frontend  | React + TypeScript + Vite        |
| Backend   | Node.js + Express                |
| Vector DB | FAISS                            |
| Embedding | `sentence-transformers` (MiniLM) |
| LLM       | Mistral (local or remote API)    |
| Data      | WHO medical alert dataset        |

---

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/who-alerts-ai.git
cd who-alerts-ai
```

### 2. Backend Setup

1. Install Python dependencies for embeddings:

```bash
cd backend/embeddings
pip install -r requirements.txt
```

Ensure `requirements.txt` contains:

```
faiss-cpu
sentence-transformers
numpy
tqdm
python-dateutil
```

2. The backend automatically handles alert scraping and FAISS index generation:

- On **first server start**, if `alert_chunks.json` does not exist:

  - The backend scrapes the WHO medical product alerts website
  - Saves parsed alerts to `alert_chunks.json`
  - Builds FAISS embeddings from the scraped data

- On subsequent queries, the backend loads cached alerts and embeddings for fast search.

3. Optionally, you can manually rebuild alerts and embeddings at any time:

```http
GET /api/rebuild-embeddings
```

This will re-scrape the website and regenerate FAISS indices.

### 3. Start the backend and frontend

```bash
# From the root of the project
npm install
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
