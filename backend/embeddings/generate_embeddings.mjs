// backend/embeddings/generate_embeddings.mjs
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { pipeline } from "@xenova/transformers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

// ---- Local embedding config ----
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
const INPUT_PATH = path.join(__dirname, "alert_chunks.json");
const OUTPUT_PATH = path.join(__dirname, "alert_chunks_with_embeds.json");

// ---- Initialize local model ----
console.log(`🔄 Loading local embedding model: ${EMBEDDING_MODEL} ...`);
const embedder = await pipeline("feature-extraction", EMBEDDING_MODEL);
console.log("✅ Model loaded.");

// ---- Helpers ----
function docToText(doc) {
  return `Title: ${doc.title || ""}\nDate: ${doc.publishedDate || ""}\n\n${doc.content || ""}`;
}

async function embedBatch(texts) {
  const results = [];
  for (const text of texts) {
    const output = await embedder(text, { pooling: "mean", normalize: true });
    results.push(Array.from(output.data));
  }
  return results;
}

async function main() {
  const buf = await fs.readFile(INPUT_PATH, "utf-8");
  const docs = JSON.parse(buf);

  // De-duplicate by link
  const seen = new Set();
  const uniq = [];
  for (const d of docs) {
    if (!seen.has(d.link)) {
      seen.add(d.link);
      uniq.push(d);
    }
  }

  const BATCH = parseInt(process.env.EMBEDDING_BATCH_SIZE) || 8;
  const texts = uniq.map(docToText);
  const allEmbeds = [];

  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const embeds = await embedBatch(slice);
    allEmbeds.push(...embeds);
    console.log(`🧠 Embedded ${Math.min(i + BATCH, texts.length)} / ${texts.length}`);
  }

  // Attach embeddings
  const withEmbeds = uniq.map((doc, i) => ({
    ...doc,
    embedding: allEmbeds[i],
  }));

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(withEmbeds, null, 2), "utf-8");
  console.log(`✅ Wrote ${OUTPUT_PATH} with ${withEmbeds.length} items`);
}

main().catch((e) => {
  console.error("❌ Embedding generation failed:", e);
  process.exit(1);
});
