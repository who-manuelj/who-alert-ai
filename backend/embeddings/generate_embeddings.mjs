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
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function splitIntoParagraphs(text) {
  const rawParas = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const MAX_CHARS = 4000; // ~1000 tokens approx
  const chunks = [];
  for (const para of rawParas) {
    if (para.length <= MAX_CHARS) {
      chunks.push(para);
    } else {
      // split long paragraph
      for (let i = 0; i < para.length; i += MAX_CHARS) {
        chunks.push(para.slice(i, i + MAX_CHARS));
      }
    }
  }
  return chunks;
}

async function embedBatch(texts, attempt = 1) {
  try {
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
      if (res.status === 429 && attempt <= 5) {
        const backoff = Math.pow(3, attempt) * 1000;
        console.warn(`⚠️ 429 rate limit hit, retrying in ${backoff}ms (attempt ${attempt})`);
        await sleep(backoff);
        return embedBatch(texts, attempt + 1);
      }
      throw new Error(`Embedding API failed: ${res.status} ${t}`);
    }

    const data = await res.json();
    return data.data.map(d => d.embedding);
  } catch (err) {
    if (attempt <= 5) {
      const backoff = Math.pow(3, attempt) * 1000;
      console.warn(`⚠️ Embed error, retrying in ${backoff}ms (attempt ${attempt})`, err.message);
      await sleep(backoff);
      return embedBatch(texts, attempt + 1);
    }
    throw err;
  }
}

async function main() {
  const buf = await fs.readFile(INPUT_PATH, "utf-8");
  const alerts = JSON.parse(buf);

  const allChunks = [];
  for (const alert of alerts) {
    const paragraphs = splitIntoParagraphs(alert.content || "");
    paragraphs.forEach((chunkText, idx) => {
      allChunks.push({
        title: alert.title,
        link: alert.link,
        year: alert.year,
        chunkIndex: idx,
        chunkText,
      });
    });
  }

  console.log(`Total chunks to embed: ${allChunks.length}`);

  const BATCH = parseInt(process.env.EMBEDDING_BATCH_SIZE) || 8;
  let embeddedCount = 0;

  for (let i = 0; i < allChunks.length; i += BATCH) {
    const slice = allChunks.slice(i, i + BATCH);
    const texts = slice.map(c => c.chunkText);
    const embeds = await embedBatch(texts);
    embeds.forEach((e, j) => {
      slice[j].embedding = e;
    });
    embeddedCount += slice.length;
    console.log(`🧠 Embedded ${embeddedCount} / ${allChunks.length}`);
    await sleep(200); // slow down to avoid rate limit
  }

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(allChunks, null, 2), "utf-8");
  console.log(`✅ Wrote ${OUTPUT_PATH} with ${allChunks.length} chunks`);
}

main().catch((e) => {
  console.error("❌ Embedding generation failed:", e);
  process.exit(1);
});
