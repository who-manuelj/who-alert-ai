// backend/embeddings/generate_embeddings.mjs
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

// ---- Mistral API config ----
const EMBEDDING_API_URL = process.env.EMBEDDING_API_URL;
const EMBEDDING_API_KEY = process.env.MISTRAL_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "mistral-embed";

if (!EMBEDDING_API_URL || !EMBEDDING_API_KEY) {
  console.error("Missing EMBEDDING_API_URL or EMBEDDING_API_KEY in .env");
  process.exit(1);
}

const INPUT_PATH = path.join(__dirname, "alert_chunks.json");
const OUTPUT_PATH = path.join(__dirname, "alert_chunks_with_embeds.json");

// ---- Helpers ----
function docToText(doc) {
  return `Title: ${doc.title || ""}\nDate: ${doc.publishedDate || ""}\n\n${doc.content || ""}`;
}

// Embed a batch of texts
async function embedBatch(texts) {
  const res = await fetch(EMBEDDING_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${EMBEDDING_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Embedding API failed: ${res.status} ${t}`);
  }

  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

async function main() {
  const buf = await fs.readFile(INPUT_PATH, "utf-8");
  const docs = JSON.parse(buf);

  // Deduplicate by link
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
  let allEmbeds = [];

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
