import express from "express";

const app = express();

// Fly-friendly port
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: "1mb" }));

// Simple health check
app.get("/", (req, res) => {
  res.json({ status: "relay online" });
});

// Basic rate safety (very light)
const lastRequestTime = new Map();

// Main relay
app.post("/", async (req, res) => {
  try {
    // 🔒 anti-loop header
    if (req.headers["x-relay-hop"] === "1") {
      return res.status(508).json({ error: "loop detected" });
    }

    // 🧾 validate input
    const { u, m = "GET", h = {}, b, r = true } = req.body || {};

    if (!u) {
      return res.status(400).json({ error: "missing url" });
    }

    let targetUrl;
    try {
      targetUrl = new URL(u);
    } catch {
      return res.status(400).json({ error: "invalid url" });
    }

    // ⛔ basic SSRF guard (block localhost)
    const blockedHosts = ["localhost", "127.0.0.1", "::1"];
    if (blockedHosts.includes(targetUrl.hostname)) {
      return res.status(403).json({ error: "blocked host" });
    }

    // 🧠 simple rate limit per IP
    const ip = req.ip || "unknown";
    const now = Date.now();

    if (lastRequestTime.has(ip)) {
      const diff = now - lastRequestTime.get(ip);
      if (diff < 300) {
        return res.status(429).json({ error: "too fast" });
      }
    }
    lastRequestTime.set(ip, now);

    // 📦 headers
    const headers = {};
    for (const [k, v] of Object.entries(h)) {
      headers[k] = String(v);
    }

    headers["x-relay-hop"] = "1";

    // 🌐 fetch request
    const resp = await fetch(targetUrl, {
      method: m.toUpperCase(),
      headers,
      redirect: r === false ? "manual" : "follow",
      body: b ? Buffer.from(b, "base64") : undefined
    });

    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 📤 response
    res.json({
      status: resp.status,
      headers: Object.fromEntries(resp.headers.entries()),
      body: buffer.toString("base64")
    });

  } catch (err) {
    res.status(500).json({
      error: err.message || "unknown error"
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Relay running on ${PORT}`);
});
