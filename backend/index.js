// backend/index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import scrapeAlerts from "./scraper/scrape.js";
import fs from "fs";
import { spawn, spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { callAIWithBatchChunks, callAI } from "./helpers/helpers.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 5000;
const PYTHON_PATH = "/opt/venv/bin/python";
const ALERTS_PATH = path.join(__dirname, "embeddings", "alert_chunks.json");
const FAISS_SCRIPT_PATH = path.join(
  __dirname,
  "embeddings/generate_embeddings.py"
);
// 🔧 CONFIG FLAG: Always use FAISS instead of AI fallback
const USE_FAISS_ALWAYS = true;

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5000",
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // allow curl/Postman
      if (allowedOrigins.includes(origin)) return cb(null, true);
      console.warn("CORS denied for origin:", origin);
      return cb(null, false); // deny gracefully
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

// --- Endpoint: Query ---
app.post("/api/query", async (req, res) => {
  const messages = req.body.messages || [];
  const filters = req.body.filters || null;
  const userMessages = messages.filter((m) => m.role === "user");
  const userQuery = userMessages.at(-1)?.content || "";
  const isFirstQuery = userMessages.length === 1;

  console.log("💬 User query:", userQuery);
  console.log("📨 Is first query:", isFirstQuery);
  console.log("⚙️ Filters:", filters);

  // timestamp when user sends message
  const userTimestamp = new Date().toISOString();

  try {
    const runFaissSearch = () => {
      const args = filters
        ? [FAISS_SCRIPT_PATH, userQuery, JSON.stringify(filters)]
        : [FAISS_SCRIPT_PATH, userQuery];

      const result = spawnSync(PYTHON_PATH, args, { encoding: "utf-8" });
      if (result.error) throw result.error;

      let faissChunks = JSON.parse(result.stdout || "[]");
      if (!Array.isArray(faissChunks) || faissChunks.length === 0) return null;
      return faissChunks;
    };

    const runWithContext = async (faissChunks, sourceLabel) => {
      const reply = await callAIWithBatchChunks(
        "mistral",
        userQuery,
        faissChunks
      );

      // timestamp when AI responds
      const aiTimestamp = new Date().toISOString();

      return res.json({
        result: reply,
        source: sourceLabel,
        timestamps: {
          user: userTimestamp,
          ai: aiTimestamp,
        },
      });
    };

    if (isFirstQuery || USE_FAISS_ALWAYS) {
      console.log("🔍 FAISS triggered (first query or forced)");
      const faissChunks = runFaissSearch();
      if (!faissChunks)
        return res.json({
          result:
            "Sorry, I couldn't find any WHO alerts that match your question.",
          source: "faiss-empty",
          timestamps: {
            user: userTimestamp,
            ai: new Date().toISOString(),
          },
        });

      return await runWithContext(faissChunks, "faiss-first-query");
    }

    const filteredMessages = messages.filter((m) => m.role !== "system");
    const aiText = await callAI("mistral", filteredMessages);
    console.log("Mistral raw response:", aiText);

    const isGeneric = isGenericResponse(aiText);

    if (!isGeneric && !USE_FAISS_ALWAYS) {
      return res.json({
        result: aiText,
        source: "mistral-direct",
        timestamps: {
          user: userTimestamp,
          ai: new Date().toISOString(),
        },
      });
    }

    console.warn(
      "⚠️ Falling back to FAISS due to generic AI response or override"
    );
    const faissChunks = runFaissSearch();
    if (!faissChunks)
      return res.json({
        result:
          "Sorry, I couldn't find anything relevant in the WHO alerts to answer your question.",
        source: "faiss-empty-fallback",
        timestamps: {
          user: userTimestamp,
          ai: new Date().toISOString(),
        },
      });

    return await runWithContext(faissChunks, "faiss-fallback");
  } catch (err) {
    console.error("/api/query error:", err);
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
    console.error("Rebuild error:", err);
    res.status(500).json({ error: "Rebuild failed" });
  }
});

// --- Serve frontend build ---
// Path resolution helpers (already imported above)
const frontendPath = path.join(__dirname, "public");

// Serve static files
app.use(express.static(frontendPath));

// Catch-all: for React Router, always send index.html
app.get("/*splat", (req, res) => {
  // Prevent overriding API routes
  if (req.path.startsWith("/api"))
    return res.status(404).json({ error: "Not found" });
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
