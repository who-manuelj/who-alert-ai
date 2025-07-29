import os
import sys
import json
import faiss
import numpy as np
import re
from tqdm import tqdm
from sentence_transformers import SentenceTransformer
from dateutil.parser import parse as parse_date

def is_recency_query(query):
    return any(word in query.lower() for word in ["latest", "recent", "newest", "this month", "2025"])

def extract_year_from_query(query):
    # Finds any 4-digit year in the query
    match = re.search(r"\b(20\d{2})\b", query)
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
model = SentenceTransformer("all-MiniLM-L6-v2")  # Small and fast

# FAISS paths
EMBEDDINGS_PATH = os.path.join(os.path.dirname(__file__), "faiss_index.npy")
INDEX_PATH = os.path.join(os.path.dirname(__file__), "faiss.index")

def build_faiss_index():
    if os.path.exists(EMBEDDINGS_PATH) and os.path.exists(INDEX_PATH):
        index = faiss.read_index(INDEX_PATH)
        return index

    print("Building FAISS index from scratch...")
    embeddings = model.encode(texts, show_progress_bar=True)
    index = faiss.IndexFlatL2(embeddings.shape[1])
    index.add(np.array(embeddings).astype("float32"))

    # Save for reuse
    faiss.write_index(index, INDEX_PATH)
    np.save(EMBEDDINGS_PATH, embeddings)
    return index

index = build_faiss_index()

def search_embeddings(query, top_k=10):
    query_embedding = model.encode([query])
    year = extract_year_from_query(query)
    
    filtered_docs = []

    # Pre-filter documents by year if applicable
    if year:
        for doc in documents:
            try:
                doc_year = parse_date(doc["publishedDate"]).year
                if doc_year == year:
                    filtered_docs.append(doc)
            except Exception:
                continue
    else:
        filtered_docs = documents.copy()

    if not filtered_docs:
        return [{"title": "No alerts found for the given year.", "content": "", "link": "", "publishedDate": ""}]

    # Prepare texts for the filtered set
    filtered_texts = [
        f"Title: {doc['title']}\nDate: {doc['publishedDate']}\n\n{doc['content']}"
        for doc in filtered_docs
    ]

    # Generate new embeddings for this smaller set
    embeddings = model.encode(filtered_texts)

    # Create a temporary FAISS index just for this search
    temp_index = faiss.IndexFlatL2(embeddings.shape[1])
    temp_index.add(np.array(embeddings).astype("float32"))

    D, I = temp_index.search(np.array(query_embedding).astype("float32"), top_k * 5)

    # Deduplicate results by link
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
    if not query:
        print(json.dumps({"error": "No query provided"}))
        sys.exit(1)

    top_chunks = search_embeddings(query)
    print(json.dumps(top_chunks, indent=2, ensure_ascii=False))
