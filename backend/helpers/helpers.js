// backend/helpers/helpers.js
import dotenv from "dotenv";
dotenv.config();

/**
 * Call AI model (Mistral API)
 */
export async function callAI(model, messages) {
  const aiRes = await fetch(process.env.MISTRAL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.MISTRAL_MODEL,
      messages,
      temperature: 0.7,
      stream: false,
    }),
  });

  const aiData = await aiRes.json();
  return aiData?.choices?.[0]?.message?.content || "";
}

/**
 * Build readable context from FAISS chunks
 */
export function buildContextChunks(chunks, maxChars = 1000, maxChunks = 20) {
  return chunks
    .slice(0, maxChunks)
    .map((chunk, i) => {
      const text = chunk.chunkText || "";
      const safeText = text.length > maxChars ? text.slice(0, maxChars) + "..." : text;
      return `${i + 1}. ${chunk.title} (${chunk.year})
Published: ${chunk.publishedDate || "Unknown"}
${safeText}
Link: ${chunk.link}`;
    })
    .join("\n\n");
}

/**
 * Respond to user query with FAISS context
 * - If query matches a specific alert title, focus on that chunk
 * - Otherwise, provide context from top-N chunks
 */
export async function respondToQuery(model, userQuery, faissChunks) {
  if (!faissChunks || faissChunks.length === 0) return "No relevant alerts found.";

  // 1️⃣ Try exact match for alert title
  const exactMatch = faissChunks.find(c =>
    userQuery.toLowerCase().includes(c.title.toLowerCase())
  );

  if (exactMatch) {
    const prompt = `
You are a WHO Medical Product Alert assistant.
Answer the user's query using ONLY the following alert:
Title: ${exactMatch.title}
Year: ${exactMatch.year}
Published date: ${exactMatch.publishedDate || "Unknown"}
Link: ${exactMatch.link}
Content: ${exactMatch.chunkText}

User query: "${userQuery}"

Respond in a structured format with:
- Title
- Year
- Published date
- Link
- Key points (if none, write: "No details available, see link.")
Do NOT include information beyond this alert.
    `;
    return await callAI(model, [{ role: "system", content: prompt }]);
  }

  // 2️⃣ General query mode: build context from top chunks
  const contextText = buildContextChunks(faissChunks, 2000, 15); // 15 chunks, 2k chars each

  const generalPrompt = `
You are a WHO Medical Product Alert assistant.
Use the context below to answer the user's query as completely and accurately as possible.

User query: "${userQuery}"

Context:
${contextText}

Instruction:
- Focus on answering the user's query.
- Present structured information (Title, Year, Published date, Link, Key points).
- Remove duplicates and consolidate similar alerts.
- Do NOT add information beyond the provided context.
    `;

  return await callAI(model, [{ role: "system", content: generalPrompt }]);
}

/**
 * Build chunk-specific prompt (used in previous batch summarization, optional)
 */
export function buildChunkPrompt(chunk, userQuery) {
  const text = chunk.chunkText || "";
  return `
You are a WHO Medical Product Alert assistant.
Answer the user's query using only this alert chunk.
User query: "${userQuery}"
Alert chunk:
Title: ${chunk.title}
Year: ${chunk.year}
Published date: ${chunk.publishedDate || "Unknown"}
Link: ${chunk.link}
Content: ${text}

Respond in structured format:
- Title
- Year
- Published date
- Link
- Key points
`;
}
