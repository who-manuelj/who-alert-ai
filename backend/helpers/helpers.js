// backend/helpers/helpers.js
import dotenv from "dotenv";
dotenv.config();

/**
 * Call AI model (local LLM or Mistral API)
 * @param {string} model - Model name
 * @param {Array<{role: string, content: string}>} messages
 */
export async function callAI(model, messages) {
  const useLocal = process.env.USE_LOCAL_LLM === "true"; // properly parse boolean

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
 * Build a readable string from FAISS chunks for context
 * @param {Array} chunks
 */
export function buildContextChunks(chunks) {
  return chunks
    .slice(0, 5)
    .map((chunk, i) => {
      const content =
        chunk.content.length > 2500
          ? chunk.content.slice(0, 2500) + "..."
          : chunk.content;
      return `${i + 1}. ${chunk.title}\nPublished: ${
        chunk.publishedDate
      }\n${content}\nLink: ${chunk.link}`;
    })
    .join("\n\n");
}

/**
 * Batch process FAISS chunks through AI, summarize and merge
 * @param {string} model
 * @param {string} userQuery
 * @param {Array} faissChunks
 * @param {number} batchSize
 */
export async function callAIWithBatchChunks(
  model,
  userQuery,
  faissChunks,
  batchSize = 5
) {
  // Step 1: Split into batches
  const groups = [];
  for (let i = 0; i < faissChunks.length; i += batchSize) {
    groups.push(faissChunks.slice(i, i + batchSize));
  }

  // Step 2: Summarize each batch individually
  const batchSummaries = await Promise.all(
    groups.map(async (group, idx) => {
      const contextString = buildContextChunks(group);
      const systemPrompt = `You are a WHO alert assistant. Summarize the following WHO alert chunks concisely:\n\n${contextString}`;

      console.log(
        `🧠 Summarizing batch ${idx + 1}/${groups.length} with ${
          group.length
        } chunks`
      );

      const summary = await callAI(model, [
        { role: "system", content: systemPrompt },
        { role: "user", content: userQuery },
      ]);

      return summary;
    })
  );

  // Step 3: Merge all batch summaries into a single clean summary
  const mergePrompt = `You are a WHO alert assistant. Merge the following batch summaries into a single, clean, concise summary. Keep clear formatting (title, date, summary, link). Respond with a clear bullet-point list if multiple alerts are relevant:\n\n${batchSummaries.join(
    "\n\n"
  )}`;

  console.log("Merging all batch summaries into final output");

  const finalOutput = await callAI(model, [
    { role: "system", content: mergePrompt },
    { role: "user", content: userQuery },
  ]);

  return finalOutput;
}
