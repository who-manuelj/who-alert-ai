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
 * Basic token extractor from a user query for simple keyword narrowing.
 * Returns normalized tokens (length > 3, stripped punctuation).
 */
function extractKeyTokens(query) {
  if (!query || typeof query !== "string") return [];
  return query
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 3);
}

/**
 * Extract filters from the user query:
 * - numeric year (e.g. 2025)
 * - simple tokens used for title/content narrowing
 */
export function extractFiltersFromQuery(query) {
  const out = {};
  if (!query || typeof query !== "string") return out;

  // year detection (YYYY)
  const yearMatch = query.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    out.year = parseInt(yearMatch[1], 10);
  }

  // date range detection (optional) -- simple ISO-style or YYYY-MM-DD
  const dateFromMatch = query.match(/from\s+(\d{4}-\d{2}-\d{2})/i);
  const dateToMatch = query.match(/to\s+(\d{4}-\d{2}-\d{2})/i);
  if (dateFromMatch) out.dateFrom = dateFromMatch[1];
  if (dateToMatch) out.dateTo = dateToMatch[1];

  // tokens for keyword narrowing
  const tokens = extractKeyTokens(query);
  if (tokens.length) out.keyTokens = tokens;

  return out;
}

/**
 * Filter documents by explicit filter object:
 * { year, dateFrom, dateTo }
 */
export function filterDocs(docs, { year, dateFrom, dateTo } = {}) {
  const from = dateFrom ? new Date(dateFrom) : null;
  const to = dateTo ? new Date(dateTo) : null;

  return docs.filter((d) => {
    // prefer the numeric `year` field when present
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
 * Narrow by tokens: ensures title or chunkText contains at least one token.
 * This is a fast, conservative prefilter (case-insensitive).
 */
function tokenNarrow(docs, keyTokens = []) {
  if (!keyTokens || !keyTokens.length) return docs;
  const tokens = keyTokens.map((t) => t.toLowerCase());
  return docs.filter((d) => {
    const title = (d.title || "").toLowerCase();
    const text = (d.chunkText || "").toLowerCase();
    return tokens.some((tk) => title.includes(tk) || text.includes(tk));
  });
}

/**
 * Search embeddings with cosine similarity and optional filtering.
 * Implements hybrid retrieval:
 *  - detect year/date from query and treat as hard filter (no spillover)
 *  - otherwise attempt token-based narrowing first, then semantic ranking
 */
export async function searchEmbeddings(query, explicitFilters = {}, topK = 10) {
  const docs = loadEmbeddings();

  // Extract filters from query (year, dateFrom/dateTo, keyTokens)
  const extracted = extractFiltersFromQuery(query);
  const filters = { ...explicitFilters, ...extracted };

  if (filters.year) {
    console.log(`🗓 Detected year in query: ${filters.year}`);
  }

  // 1) Apply strict structured filter (year/date) if present
  const hasStrictFilter =
    Number.isInteger(filters.year) || filters.dateFrom || filters.dateTo;

  let candidateDocs = docs;
  let filteredByStrict = [];

  if (hasStrictFilter) {
    filteredByStrict = filterDocs(docs, {
      year: filters.year,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    });

    if (filteredByStrict.length > 0) {
      candidateDocs = filteredByStrict;
      console.log(
        `🔎 Structured filter matched ${filteredByStrict.length} chunks — restricting search to that set`
      );
    } else {
      console.warn(
        "⚠️ Structured filter matched ZERO chunks — falling back to full corpus for semantic search"
      );
      candidateDocs = docs; // fallback only when strict filter yields zero
    }
  } else {
    // 2) No strict filter: attempt token narrowing if tokens exist
    if (filters.keyTokens && filters.keyTokens.length) {
      const tokenNarrowed = tokenNarrow(docs, filters.keyTokens);
      if (tokenNarrowed.length > 0) {
        candidateDocs = tokenNarrowed;
        console.log(
          `🔎 Token narrowing reduced corpus to ${tokenNarrowed.length} chunks`
        );
      } else {
        // keep full docs for semantic scoring (no strict filter present)
        candidateDocs = docs;
        console.log("🔎 Token narrowing matched 0 chunks — using full corpus");
      }
    } else {
      // no tokens either → use full corpus
      candidateDocs = docs;
      console.log("🔎 No strict filters or tokens detected — using full corpus");
    }
  }

  // 3) Compute embedding for query (single call)
  const queryEmbedding = await embedQuery(query);

  // 4) Rank candidate docs by cosine similarity
  const scored = candidateDocs.map((doc) => ({
    ...doc,
    score: cosine(queryEmbedding, doc.embedding || []),
  }));
  scored.sort((a, b) => b.score - a.score);

  // 5) effectiveTopK: if strict structured filter matched some docs, only return up to
  // that number (no spillover). If strict filter had zero matches, we allowed fallback
  // to full corpus above.
  const effTopK =
    hasStrictFilter && filteredByStrict.length > 0
      ? Math.min(topK, filteredByStrict.length)
      : topK;

  const topChunks = scored.slice(0, effTopK);

  // 6) Logging for debugging
  console.log("🔍 FAISS search returned chunks:", topChunks.length);
  topChunks.forEach((c, i) => {
    console.log(
      `  ${i + 1}. ${c.title} | year: ${c.year} | chunkText length: ${
        c.chunkText?.length || 0
      } | score: ${c.score?.toFixed(4)}`
    );
  });

  // 7) Return chunks with full chunkText for AI summarization
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
