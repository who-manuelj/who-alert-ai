# 🧠 WHO Alerts AI Assistant

This is a full-stack chatbot application that answers questions **strictly** based on the official [WHO Medical Product Alerts](https://www.who.int/teams/regulation-prequalification/incidents-and-SF/full-list-of-who-medical-product-alerts). It combines an AI model (Mistral) with a local FAISS vector search index to retrieve and summarize alert information from 2013 to present.

---

## 🚀 Features

- 🔎 Search WHO alerts using natural language (e.g. “What were the alerts from Nigeria in 2024?”)
- 🧠 Hybrid RAG (Retrieval-Augmented Generation) pipeline using FAISS + Mistral
- 📋 Multi-turn chat with persistent memory and semantic fallback
- 📅 Filter-based structured form query support
- ⚡ Uses either local Mistral via [Ollama](https://ollama.com) or a hosted Mistral API
- 🎯 Built for fast, domain-specific querying over structured health data

---

## 🧰 Tech Stack

| Layer     | Tech                          |
|-----------|-------------------------------|
| Frontend  | React + TypeScript + Vite     |
| Backend   | Node.js + Express             |
| Vector DB | FAISS                         |
| Embedding | `sentence-transformers` (MiniLM) |
| LLM       | Mistral (local or remote API) |
| Data      | WHO medical alert dataset     |

---

## 🛠️ Setup Instructions

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/who-alerts-ai.git
cd who-alerts-ai
```

## Backend Setup
- Install Python Dependencies for embeddings
```bash
cd backend/embeddings
pip install -r requirements.txt
```
- Make sure requirements.txt contains:
```
faiss-cpu
sentence-transformers
numpy
tqdm
python-dateutil
```
- Generate FAISS index
-- Ensure you have parsed alerts in alert_chunks.json. Then run:
```bash
python generate_embeddings.py "recent alerts"
```
 This will generate the necessary indices to be used for AI query.
- Run the Project in root
```bash
npm install
npm run dev
```

🧠 How It Works

- First user query: triggers a FAISS search using MiniLM embeddings.

- Top-N chunks: are injected into Mistral’s context window.

- Mistral LLM: responds using only the retrieved WHO alert data.

- Multi-turn: conversations retain context unless the model responds too generically — in which case FAISS is triggered again.

Form-based filters (e.g. "Year: 2023", "Country: Nigeria") also use the same backend /api/query and update the message history directly.
