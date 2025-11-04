// backend/helpers/helpers.js
import dotenv from "dotenv";
dotenv.config();

/**
 * Call AI model (local LLM or Mistral API)
 */
export async function callAI(model, messages) {
  const useLocal = process.env.USE_LOCAL_LLM === "true";

  if (useLocal) {
    const aiRes = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        stream: false,
      }),
    });
    const aiData = await aiRes.json();
    return aiData?.message?.content || "";
  } else {
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
}

/**
 * Build readable string from FAISS chunks for context
 */
export function buildContextChunks(chunks, maxChars = 1000) {
  return chunks
    .slice(0, 3) // limit for model context
    .map((chunk, i) => {
      const text = chunk.chunkText || "";
      const safeText =
        text.length > maxChars ? text.slice(0, maxChars) + "..." : text;
      return `${i + 1}. ${chunk.title} (${chunk.year})
Published: ${chunk.publishedDate || "Unknown"}
${safeText}
Link: ${chunk.link}`;
    })
    .join("\n\n");
}

/**
 * Build robust prompt for a single chunk
 */
function buildChunkPrompt(chunk, userQuery) {
  const text = chunk.chunkText || "";
  return `
You are a WHO Medical Product Alert assistant.
Summarize the following alert chunk in a structured format.
Include the following fields, even if empty:
- Title
- Year
- Published date
- Link
- Key points (if none, write: "No details available, see link.")

User query: "${userQuery}"

Alert chunk:
Title: ${chunk.title}
Year: ${chunk.year}
Published date: ${chunk.publishedDate || "Unknown"}
Link: ${chunk.link}
Content: ${text}
`;
}

/**
 * Summarize FAISS chunks individually, then merge into a single coherent response
 */
export async function callAIWithBatchChunks(
  model,
  userQuery,
  faissChunks,
  batchSize = 5
) {
  if (!faissChunks || faissChunks.length === 0) return "No relevant alerts found.";

  // 1️⃣ Split into batches
  const groups = [];
  for (let i = 0; i < faissChunks.length; i += batchSize) {
    groups.push(faissChunks.slice(i, i + batchSize));
  }

  // 2️⃣ Summarize each chunk individually
  const chunkSummaries = [];
  for (const group of groups) {
    for (const [idx, chunk] of group.entries()) {
      console.log(`\n🧠 Summarizing chunk ${idx + 1}/${faissChunks.length}`);
      console.log(
        `  Title: ${chunk.title}, year=${chunk.year}, chunkTextLength=${chunk.chunkText?.length || 0}`
      );
      console.log(
        `  Preview: ${chunk.chunkText?.slice(0, 100).replace(/\n/g, " ")}...`
      );

      const chunkPrompt = buildChunkPrompt(chunk, userQuery);

      let summary = await callAI(model, [{ role: "system", content: chunkPrompt }]);

      if (!summary || summary.trim() === "") {
        console.warn(`⚠️ Chunk ${idx + 1} returned empty summary. Using placeholder.`);
        summary = `- Title: ${chunk.title}
- Year: ${chunk.year}
- Published date: ${chunk.publishedDate || "Unknown"}
- Link: ${chunk.link}
- Key points: No details available, see link.`;
      }

      chunkSummaries.push(summary);
    }
  }

  // 3️⃣ Merge all chunk summaries into one coherent structured response
  console.log("\n🧩 Merging all chunk summaries into final output");

  const mergePrompt = `
You are a WHO alert assistant.
You have been provided with multiple alert summaries from FAISS context.
User query: "${userQuery}"

Instruction:
- Merge all summaries into ONE single, coherent structured response.
- Remove duplicates.
- Keep structured format: Title, Year, Published date, Link, Key points.
- Preserve order using Published date
- Consolidate similar points where possible, and combine information for items with the same title.
- Present as a single response, NOT separate chunk outputs.
- Do NOT add external information beyond the provided summaries.

Summaries to merge:
${chunkSummaries.join("\n\n")}
`;

  let finalOutput = await callAI(model, [{ role: "system", content: mergePrompt }]);

  if (!finalOutput || finalOutput.trim() === "") {
    console.warn("⚠️ AI returned empty summary after merging. Using fallback concatenation.");
    finalOutput = chunkSummaries.join("\n\n");
  }

  console.log(`📝 Final AI output length: ${finalOutput?.length}`);
  return finalOutput;
}
