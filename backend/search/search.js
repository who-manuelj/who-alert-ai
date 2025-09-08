// backend/search/search.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { embedQuery } from "./embedQuery.js"; // use our centralized embedding function

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
 * Parse date in YYYY-MM-DD format.
 */
function parseYyyyMmDd(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

/**
 * Filter documents by year/date range.
 */
export function filterDocs(docs, { year, dateFrom, dateTo } = {}) {
  const from = parseYyyyMmDd(dateFrom);
  const to = parseYyyyMmDd(dateTo);

  return docs.filter((d) => {
    const dt = new Date(d.publishedDate);
    if (Number.isInteger(year) && dt.getUTCFullYear() !== year) return false;
    if (from && dt < from) return false;
    if (to && dt > to) return false;
    return true;
  });
}

/**
 * Search embeddings with cosine similarity and optional filtering.
 * @param {string} query - User query string
 * @param {object} filters - Optional filters { year, dateFrom, dateTo }
 * @param {number} topK - Number of results to return
 */
export async function searchEmbeddings(query, filters = {}, topK = 20) {
  const docs = loadEmbeddings();

  // 1. Get embedding for query
  const queryEmbedding = await embedQuery(query);

  // 2. Filter documents by year/date
  const filteredDocs = filterDocs(docs, filters);

  // 3. Rank by cosine similarity
  const scored = filteredDocs.map((doc) => ({
    ...doc,
    score: cosine(queryEmbedding, doc.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}
