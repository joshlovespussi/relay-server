import express from "express";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

// Optional safety: prevent self-loop
const SERVER_HOST = process.env.REPLIT_DEV_DOMAIN || "";

app.post("/", async (req, res) => {
  try {
    if (req.headers["x-relay-hop"] === "1") {
      return res.status(508).json({ e: "loop detected" });
    }

    const body = req.body;

    if (!body || !body.u) {
      return res.status(400).json({ e: "missing url" });
    }

    let targetUrl;
    try {
      targetUrl = new URL(body.u);
    } catch {
      return res.status(400).json({ e: "invalid url" });
    }

    const BLOCKED_HOSTS = [SERVER_HOST].filter(Boolean);

    if (BLOCKED_HOSTS.some(h => targetUrl.hostname.endsWith(h))) {
      return res.status(400).json({ e: "self-fetch blocked" });
    }

    // Build headers safely
    const headers = {};
    if (body.h && typeof body.h === "object") {
      for (const [k, v] of Object.entries(body.h)) {
        headers[k] = String(v);
      }
    }

    headers["x-relay-hop"] = "1";

    const fetchOptions = {
      method: (body.m || "GET").toUpperCase(),
      headers,
      redirect: body.r === false ? "manual" : "follow"
    };

    if (body.b) {
      fetchOptions.body = Buffer.from(body.b, "base64");
    }

    const resp = await fetch(targetUrl.toString(), fetchOptions);

    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const base64 = buffer.toString("base64");

    const responseHeaders = {};
    resp.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });

    return res.status(200).json({
      s: resp.status,
      h: responseHeaders,
      b: base64
    });

  } catch (err) {
    return res.status(500).json({ e: String(err) });
  }
});

// health check
app.get("/", (req, res) => {
  res.json({ status: "relay online" });
});

app.listen(PORT, () => {
  console.log(`Relay server running on port ${PORT}`);
});