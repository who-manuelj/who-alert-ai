// 🔌 Pluggable AI call
export async function callAI(model, messages) {
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
}

// 📦 Helper to create FAISS context
export function buildContextChunks(chunks) {
  return chunks
    .slice(0, 5)
    .map((chunk, i) => {
      const content =
        chunk.content.length > 1000
          ? chunk.content.slice(0, 1000) + "..."
          : chunk.content;
      return `${i + 1}. ${chunk.title}\nPublished: ${
        chunk.publishedDate
      }\n${content}\nLink: ${chunk.link}`;
    })
    .join("\n\n");
}
