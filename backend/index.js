// backend/index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import scrapeAlerts from "./scraper/scrape.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { callAIWithBatchChunks, callAI } from "./helpers/helpers.js";
import { searchEmbeddings } from "./search/search.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 5000;
const ALERTS_PATH = path.join(
  __dirname,
  "embeddings",
  "alert_chunks_with_embeds.json"
);

// 🔧 CONFIG FLAG: Always use semantic search instead of AI fallback
const USE_SEMANTIC_SEARCH_ALWAYS = true;

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5000",
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      console.warn("CORS denied for origin:", origin);
      return cb(null, false);
    },
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
    console.log(
      "alert_chunks_with_embeds.json already exists. Skipping scrape."
    );
    alertsData = JSON.parse(fs.readFileSync(ALERTS_PATH, "utf-8"));
  } else {
    console.log(
      "📥 No alert_chunks_with_embeds.json found. Scraping alerts..."
    );
    const rawData = await scrapeAlerts(true);

    // ⚠️ NOTE: You must precompute embeddings separately and save to alert_chunks_with_embeds.json
    // Here we just save raw data for reference
    fs.writeFileSync(ALERTS_PATH, JSON.stringify(rawData, null, 2));
    console.log(
      "Scraped and saved alert_chunks_with_embeds.json (embeddings missing)."
    );
  }
};
await ensureAlertChunks();

// --- Endpoint: Return raw alerts ---
app.get("/api/alerts", (req, res) => res.json(alertsData));

// --- Endpoint: Query ---
app.post("/api/query", async (req, res) => {
  const messages = req.body.messages || [];
  const filters = req.body.filters || {};
  const userMessages = messages.filter((m) => m.role === "user");
  const userQuery = userMessages.at(-1)?.content || "";
  const isFirstQuery = userMessages.length === 1;

  console.log("User query:", userQuery);
  console.log("Filters:", filters);

  const userTimestamp = new Date().toISOString();

  try {
    const runSemanticSearch = async () => {
      const results = await searchEmbeddings(userQuery, filters, 20);
      return results;
    };

    const runWithContext = async (chunks, sourceLabel) => {
      const reply = await callAIWithBatchChunks("mistral", userQuery, chunks);
      return res.json({
        result: reply,
        source: sourceLabel,
        timestamps: {
          user: userTimestamp,
          ai: new Date().toISOString(),
        },
      });
    };

    // Always use semantic search first
    if (isFirstQuery || USE_SEMANTIC_SEARCH_ALWAYS) {
      console.log("🔍 Semantic search triggered (first query or forced)");
      const results = await runSemanticSearch();
      if (!results.length) {
        return res.json({
          result:
            "Sorry, I couldn't find any WHO alerts that match your question.",
          source: "semantic-empty",
          timestamps: {
            user: userTimestamp,
            ai: new Date().toISOString(),
          },
        });
      }
      return await runWithContext(results, "semantic-first-query");
    }

    const filteredMessages = messages.filter((m) => m.role !== "system");
    const aiText = await callAI("mistral", filteredMessages);

    if (!isGenericResponse(aiText) && !USE_SEMANTIC_SEARCH_ALWAYS) {
      return res.json({
        result: aiText,
        source: "mistral-direct",
        timestamps: {
          user: userTimestamp,
          ai: new Date().toISOString(),
        },
      });
    }

    console.warn("⚠️ Falling back to semantic search");
    const results = await runSemanticSearch();
    if (!results.length) {
      return res.json({
        result:
          "Sorry, I couldn't find anything relevant in the WHO alerts to answer your question.",
        source: "semantic-empty-fallback",
        timestamps: {
          user: userTimestamp,
          ai: new Date().toISOString(),
        },
      });
    }
    return await runWithContext(results, "semantic-fallback");
  } catch (err) {
    console.error("/api/query error:", err);
    return res.status(500).json({ error: "Query failed." });
  }
});

// --- Serve frontend build ---
const frontendPath = path.join(__dirname, "public");
app.use(express.static(frontendPath));
app.get("/*splat", (req, res) => {
  if (req.path.startsWith("/api"))
    return res.status(404).json({ error: "Not found" });
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
