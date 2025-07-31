import os
import sys
import io
import json
import faiss
import numpy as np
import re
from tqdm import tqdm
from sentence_transformers import SentenceTransformer
from dateutil.parser import parse as parse_date

# Force stdout encoding to UTF-8 (important for Windows terminals)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def is_recency_query(query):
    return any(word in query.lower() for word in ["latest", "recent", "newest", "this month", "2025"])

def extract_year_from_query(query):
    match = re.search(r"\b(20\\d{2})\\b", query)
    return int(match.group(1)) if match else None

# Load data
DATA_PATH = os.path.join(os.path.dirname(__file__), "alert_chunks.json")
with open(DATA_PATH, "r", encoding="utf-8") as f:
    raw_documents = json.load(f)

# Deduplicate by link
seen_links = set()
documents = []
for doc in raw_documents:
    if doc["link"] not in seen_links:
        seen_links.add(doc["link"])
        documents.append(doc)

# Prepare texts for embedding
texts = [
    f"Title: {doc['title']} (IMPORTANT)\nDate: {doc['publishedDate']}\n\n{doc['content']}"
    for doc in documents
]

# Load embedding model
model = SentenceTransformer("all-MiniLM-L6-v2")

# FAISS paths
EMBEDDINGS_PATH = os.path.join(os.path.dirname(__file__), "faiss_index.npy")
INDEX_PATH = os.path.join(os.path.dirname(__file__), "faiss.index")

def build_faiss_index():
    if os.path.exists(EMBEDDINGS_PATH) and os.path.exists(INDEX_PATH):
        return faiss.read_index(INDEX_PATH)

    print("Building FAISS index from scratch...")
    embeddings = model.encode(texts, show_progress_bar=True)
    index = faiss.IndexFlatL2(embeddings.shape[1])
    index.add(np.array(embeddings).astype("float32"))
    faiss.write_index(index, INDEX_PATH)
    np.save(EMBEDDINGS_PATH, embeddings)
    return index

index = build_faiss_index()

def search_embeddings(query, filters=None, top_k=20):
    query_embedding = model.encode([query])
    year = extract_year_from_query(query)
    filtered_docs = []

    # Parse optional filters
    date_from = parse_date(filters.get("publishedDateFrom")).date() if filters and filters.get("publishedDateFrom") else None
    date_to = parse_date(filters.get("publishedDateTo")).date() if filters and filters.get("publishedDateTo") else None

    for doc in documents:
        try:
            doc_date = parse_date(doc["publishedDate"]).date()
            if year and doc_date.year != year:
                continue
            if date_from and doc_date < date_from:
                continue
            if date_to and doc_date > date_to:
                continue
            filtered_docs.append(doc)
        except Exception:
            continue

    if not filtered_docs:
        return [{
            "title": "No alerts found for the given filter criteria.",
            "content": "",
            "link": "",
            "publishedDate": ""
        }]

    filtered_texts = [
        f"Title: {doc['title']}\nDate: {doc['publishedDate']}\n\n{doc['content']}"
        for doc in filtered_docs
    ]

    embeddings = model.encode(filtered_texts)
    temp_index = faiss.IndexFlatL2(embeddings.shape[1])
    temp_index.add(np.array(embeddings).astype("float32"))

    D, I = temp_index.search(np.array(query_embedding).astype("float32"), top_k * 5)

    results = []
    seen_links = set()

    for idx in I[0]:
        doc = filtered_docs[idx]
        link = doc.get("link")
        if link and link not in seen_links:
            results.append({
                "title": doc["title"],
                "content": doc["content"],
                "link": doc["link"],
                "publishedDate": doc["publishedDate"]
            })
            seen_links.add(link)
        if len(results) >= top_k:
            break

    return results

# CLI support
if __name__ == "__main__":
    query = sys.argv[1] if len(sys.argv) > 1 else ""
    filters = {}

    if not query:
        print(json.dumps({"error": "No query provided"}))
        sys.exit(1)

    if len(sys.argv) > 2:
        try:
            filters = json.loads(sys.argv[2])
        except json.JSONDecodeError:
            print(json.dumps({"error": "Invalid filters JSON"}))
            sys.exit(1)

    top_chunks = search_embeddings(query, filters)
    print(json.dumps(top_chunks, indent=2, ensure_ascii=False))
