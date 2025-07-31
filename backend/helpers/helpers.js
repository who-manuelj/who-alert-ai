import dotenv from "dotenv";
dotenv.config();

export async function callAI(model, messages) {
  const useLocal = process.env.USE_LOCAL_LLM === "true";

  if (useLocal) {
    // ✅ Local Ollama setup
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
    // ✅ Hosted Mistral API
    const aiRes = await fetch(process.env.MISTRAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.MISTRAL_MODEL, // e.g., "mistral-medium" or "open-mistral-7b"
        messages,
        temperature: 0.7,
        stream: false,
      }),
    });

    const aiData = await aiRes.json();
    return aiData?.choices?.[0]?.message?.content || "";
  }
}


// 📦 Helper to create FAISS context
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

export async function callAIWithBatchChunks(model, userQuery, faissChunks, batchSize = 5) {
  const groups = [];
  for (let i = 0; i < faissChunks.length; i += batchSize) {
    groups.push(faissChunks.slice(i, i + batchSize));
  }

  const responses = await Promise.all(
    groups.map(async (group, idx) => {
      const contextString = buildContextChunks(group);
      const systemPrompt = `You are a WHO alert assistant. Use ONLY the following context from real WHO alerts to answer the user's question. Do not speculate. Respond with a clear bullet-point list if multiple alerts are relevant.\n\n${contextString}`;

      console.log(`🧠 Calling Mistral on batch ${idx + 1}/${groups.length} with ${group.length} chunks`);

      return await callAI(model, [
        { role: "system", content: systemPrompt },
        { role: "user", content: userQuery },
      ]);
    })
  );

  return responses.join("\n\n");
}
