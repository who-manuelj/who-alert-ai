// backend/search/embedQuery.js

const EMBEDDING_API_URL = process.env.EMBEDDING_API_URL;
const EMBEDDING_API_KEY = process.env.MISTRAL_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "mistral-embed";

export async function embedQuery(text) {
  if (!EMBEDDING_API_URL || !EMBEDDING_API_KEY) {
    throw new Error("Missing EMBEDDING_API_URL or EMBEDDING_API_KEY");
  }

  const res = await fetch(EMBEDDING_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${EMBEDDING_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: [text],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Embedding API failed: ${res.status} ${t}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}
