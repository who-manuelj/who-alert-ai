// backend/search/search.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { embedQuery } from "./embedQuery.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.join(
  __dirname,
  "../embeddings/alert_chunks_with_embeds.json"
);

let CACHE = null;

/**
 * Load precomputed embeddings JSON.
 */
export function loadEmbeddings() {
  if (CACHE) return CACHE;
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(
      `Missing ${DATA_PATH}. Run the embedding precompute step first.`
    );
  }
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  CACHE = raw;
  return CACHE;
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosine(a, b) {
  let dot = 0,
    na = 0,
    nb = 0;
  const L = Math.min(a.length, b.length);
  for (let i = 0; i < L; i++) {
    const x = a[i],
      y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Filter documents by year/date range.
 */
export function filterDocs(docs, { year, dateFrom, dateTo } = {}) {
  const from = dateFrom ? new Date(dateFrom) : null;
  const to = dateTo ? new Date(dateTo) : null;

  return docs.filter((d) => {
    if (Number.isInteger(year) && d.year !== year) return false;

    if ((from || to) && d.publishedDate) {
      const dt = new Date(d.publishedDate);
      if (from && dt < from) return false;
      if (to && dt > to) return false;
    }

    return true;
  });
}

/**
 * Search embeddings with cosine similarity and optional filtering.
 * Automatically detects a year in the query and filters by it.
 */
export async function searchEmbeddings(query, filters = {}, topK = 10) {
  const docs = loadEmbeddings();

  // 1️⃣ Extract numeric year from query (if any)
  const yearMatch = query.match(/\b(20\d{2})\b/);
  const queryYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
  if (queryYear) {
    console.log(`🗓 Detected year in query: ${queryYear}`);
  }

  // 2️⃣ Filter docs: combine explicit filters + queryYear
  const filteredDocs = filterDocs(docs, { ...filters, year: queryYear });

  if (!filteredDocs.length) {
    console.warn(
      "⚠️ No alerts match the year/filter criteria. Using full corpus."
    );
  }

  const candidateDocs = filteredDocs.length ? filteredDocs : docs;

  // 3️⃣ Compute embedding for query
  const queryEmbedding = await embedQuery(query);

  // 4️⃣ Rank by cosine similarity
  const scored = candidateDocs.map((doc) => ({
    ...doc,
    score: cosine(queryEmbedding, doc.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);

  // 5️⃣ Take topK chunks
  const topChunks = scored.slice(0, topK);

  // 6️⃣ Logging for debugging
  console.log("🔍 FAISS search returned chunks:", topChunks.length);
  topChunks.forEach((c, i) => {
    console.log(
      `  ${i + 1}. ${c.title} | year: ${c.year} | chunkText length: ${
        c.chunkText?.length || 0
      }`
    );
  });

  // 7️⃣ Return chunks with full chunkText for AI summarization
  return topChunks.map((c) => ({
    title: c.title,
    link: c.link,
    year: c.year,
    chunkIndex: c.chunkIndex,
    chunkText: c.chunkText,
    publishedDate: c.publishedDate,
    embedding: c.embedding,
  }));
}
