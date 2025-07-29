// backend/index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import scrapeAlerts from "./scraper/scrape.js";
import fs from "fs";
import { spawn, spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 5000;
const PYTHON_PATH = "python";
const ALERTS_PATH = path.join(__dirname, "embeddings", "alert_chunks.json");
const FAISS_SCRIPT_PATH = path.join(
  __dirname,
  "embeddings/generate_embeddings.py"
);
const allowedOrigins = ["http://localhost:5173"];

app.use(
  cors({
    origin: (origin, cb) =>
      !origin || allowedOrigins.includes(origin)
        ? cb(null, true)
        : cb(new Error("CORS policy does not allow this origin"), false),
    credentials: true,
  })
);

app.use(express.json());

// --- Utility: Generic response detector ---
const isGenericResponse = (text) => {
  if (!text || text.length < 100) return true;
  return [
    /I'm an AI/i,
    /I don't have access/i,
    /I can't predict/i,
    /I cannot provide/i,
    /my knowledge is limited/i,
    /as of my last update/i,
    /I don't have real[- ]?time capabilities/i,
    /based on current trends/i,
  ].some((pattern) => pattern.test(text));
};

// --- Load alerts from cache or scrape if missing ---
let alertsData = [];

const ensureAlertChunks = async () => {
  if (fs.existsSync(ALERTS_PATH)) {
    console.log("✅ alert_chunks.json already exists. Skipping scrape.");
    alertsData = JSON.parse(fs.readFileSync(ALERTS_PATH, "utf-8"));
  } else {
    console.log("📥 No alert_chunks.json found. Scraping alerts...");
    alertsData = await scrapeAlerts(true);
    fs.writeFileSync(ALERTS_PATH, JSON.stringify(alertsData, null, 2));
    console.log("✅ Scraped and saved alert_chunks.json.");
  }
};
await ensureAlertChunks();

// --- Endpoint: Return raw alerts ---
app.get("/api/alerts", (req, res) => res.json(alertsData));

app.post("/api/query", async (req, res) => {
  const messages = req.body.messages || [];
  const filteredMessages = messages.filter((m) => m.role !== "system");
  const userQuery =
    filteredMessages.find((m) => m.role === "user")?.content || "";

  // ✅ Identify if this is the user's first message in the chat
  const isFirstQuery =
    filteredMessages.filter((m) => m.role === "user").length === 1;

  try {
    // Extract user intent
    const explicitYearMatch = userQuery.match(/\b(20[1-3][0-9])\b/);
    const hasTemporalIntent =
      /\b(latest|recent|this year|this month|past \d+ (days|weeks|months))\b/i.test(
        userQuery
      );

    // Step 1: Try direct response from Mistral
    const mistralRes = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mistral",
        messages: filteredMessages,
        temperature: 0.7,
        stream: false,
      }),
    });

    const mistralData = await mistralRes.json();
    const mistralText = mistralData?.message?.content || "";
    const isGeneric = isGenericResponse(mistralText);

    console.log("🧠 Mistral raw response:", mistralText);
    console.log(
      "🧪 isGeneric:",
      isGeneric,
      "| ⏳ Temporal intent:",
      hasTemporalIntent,
      "| 📅 Explicit year:",
      explicitYearMatch?.[0],
      "| 🧩 First query:",
      isFirstQuery
    );

    const shouldUseFaiss =
      isGeneric || hasTemporalIntent || !!explicitYearMatch || isFirstQuery;

    if (!shouldUseFaiss) {
      return res.json({ result: mistralText, source: "mistral-direct" });
    }

    // Step 2: Use FAISS fallback
    console.warn("⚠️ Falling back to FAISS…");
    const result = spawnSync(PYTHON_PATH, [FAISS_SCRIPT_PATH, userQuery], {
      encoding: "utf-8",
    });

    if (result.error) throw result.error;

    let faissChunks = [];
    try {
      faissChunks = JSON.parse(result.stdout);
    } catch (err) {
      console.error("❌ Failed to parse FAISS JSON:", err);
      console.error("💬 Raw output:", result.stdout);
      return res.status(500).json({ error: "Failed to parse FAISS output" });
    }

    if (!Array.isArray(faissChunks) || faissChunks.length === 0) {
      return res.json({
        result:
          "Sorry, I couldn't find relevant WHO alerts to answer your question.",
        source: "faiss-empty",
      });
    }

    // Step 3: Optional filter by year
    const targetYear = explicitYearMatch
      ? parseInt(explicitYearMatch[1], 10)
      : new Date().getFullYear();

    let filteredChunks = faissChunks;
    if (hasTemporalIntent || explicitYearMatch) {
      filteredChunks = faissChunks.filter((chunk) => {
        const chunkYear = parseInt(chunk.publishedDate?.slice(0, 4), 10);
        return chunkYear === targetYear;
      });

      console.log(
        `📆 Filtering to year ${targetYear}: ${filteredChunks.length} chunks retained.`
      );
    }

    if (filteredChunks.length === 0) {
      return res.json({
        result: `Sorry, I couldn’t find any alerts from ${targetYear} that match your query.`,
        source: "faiss-empty-filtered",
      });
    }

    // Step 4: Retry with FAISS context
    const topChunks = filteredChunks.slice(0, 5);
    const contextString = topChunks
      .map((chunk, i) => {
        const snippet =
          chunk.content.length > 1000
            ? chunk.content.slice(0, 1000) + "..."
            : chunk.content;
        return `${i + 1}. ${chunk.title}\nPublished: ${
          chunk.publishedDate
        }\n${snippet}\nLink: ${chunk.link}`;
      })
      .join("\n\n");

    const systemPrompt = `You are an AI assistant. Use ONLY the following WHO alert context to answer the user query. Do not speculate. Context:\n${contextString}`;

    const retryRes = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mistral",
        messages: [
          { role: "system", content: systemPrompt },
          ...filteredMessages,
        ],
        temperature: 0.7,
        stream: false,
      }),
    });

    const retryData = await retryRes.json();
    const retryText = retryData?.message?.content || "No response";

    return res.json({ result: retryText, source: "faiss-fallback" });
  } catch (err) {
    console.error("❌ /api/query error:", err);
    return res.status(500).json({ error: "Query failed." });
  }
});

// --- Endpoint: Rebuild embeddings ---
app.get("/api/rebuild-embeddings", async (req, res) => {
  try {
    const alerts = await scrapeAlerts(true);
    fs.writeFileSync(ALERTS_PATH, JSON.stringify(alerts, null, 2));

    const rebuild = spawn(PYTHON_PATH, ["embeddings/generate_embeddings.py"]);
    rebuild.on("close", (code) =>
      code === 0
        ? res.json({ message: "Embeddings rebuilt successfully" })
        : res.status(500).json({ error: "Embedding generation failed" })
    );
  } catch (err) {
    console.error("❌ Rebuild error:", err);
    res.status(500).json({ error: "Rebuild failed" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
