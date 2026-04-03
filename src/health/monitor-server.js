const http = require("http");
const { getState } = require("./state");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderStatusPage({ healthy, state }) {
  const statusCode = healthy ? 200 : 500;
  const title = healthy ? "200 - Service Online" : "500 - Internal Error";
  const subtitle = healthy
    ? "This service is up and reachable."
    : "The service process is running, but an internal error was detected.";
  const badgeClass = healthy ? "ok" : "error";
  const badgeText = healthy ? "ONLINE" : "DEGRADED";
  const details = healthy
    ? "No active error signal in watchdog state."
    : `Last error: ${escapeHtml(state.lastErrorMessage || "unknown")} (${escapeHtml(
        state.lastErrorAt || "n/a"
      )})`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    :root { --bg:#f4f5f7; --card:#ffffff; --text:#1d1f20; --muted:#5f6b7a; --ok:#1f8f4a; --error:#c74634; --accent:#f48120; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      background:
        radial-gradient(circle at 8% 12%, rgba(244,129,32,0.15), transparent 40%),
        radial-gradient(circle at 85% 90%, rgba(0,0,0,0.06), transparent 35%),
        var(--bg);
      color: var(--text);
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: min(760px, 100%);
      background: var(--card);
      border: 1px solid #e8eaee;
      border-radius: 14px;
      box-shadow: 0 18px 45px rgba(17,24,39,0.08);
      overflow: hidden;
    }
    .topbar {
      height: 5px;
      background: var(--accent);
    }
    .inner {
      padding: 26px 28px;
    }
    .brand {
      font-size: 14px;
      color: #333;
      letter-spacing: 0.3px;
      margin-bottom: 16px;
      font-weight: 600;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 30px;
      line-height: 1.15;
    }
    p {
      margin: 0 0 14px;
      color: var(--muted);
      line-height: 1.55;
    }
    .badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.8px;
      border-radius: 999px;
      padding: 6px 10px;
      margin: 6px 0 16px;
      border: 1px solid transparent;
    }
    .badge.ok {
      color: var(--ok);
      border-color: rgba(31,143,74,0.35);
      background: rgba(31,143,74,0.08);
    }
    .badge.error {
      color: var(--error);
      border-color: rgba(199,70,52,0.35);
      background: rgba(199,70,52,0.08);
    }
    .meta {
      margin-top: 14px;
      border-top: 1px dashed #e0e3e8;
      padding-top: 14px;
      font-size: 13px;
      color: #4d5562;
      word-break: break-word;
    }
    .footer {
      margin-top: 12px;
      font-size: 12px;
      color: #7a8594;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="topbar"></div>
    <section class="inner">
      <div class="brand">DayFlow Status</div>
      <h1>${statusCode} ${healthy ? "OK" : "Internal Server Error"}</h1>
      <span class="badge ${badgeClass}">${badgeText}</span>
      <p>${subtitle}</p>
      <div class="meta">${details}</div>
      <div class="footer">Time: ${new Date().toISOString()}</div>
    </section>
  </main>
</body>
</html>`;
}

function createMonitorServer({ port, logger }) {
  let server = null;

  return {
    async start() {
      if (server) {
        return;
      }
      server = http.createServer((req, res) => {
        const state = getState();
        const healthy = Boolean(state.healthy);
        res.statusCode = healthy ? 200 : 500;
        res.setHeader("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("pragma", "no-cache");
        res.setHeader("expires", "0");

        if (req.method === "GET" || req.method === "HEAD") {
          res.setHeader("content-type", "text/html; charset=utf-8");
          if (req.method === "HEAD") {
            res.end();
            return;
          }
          res.end(renderStatusPage({ healthy, state }));
          return;
        }

        res.end();
      });

      await new Promise((resolve, reject) => {
        server.on("error", reject);
        server.listen(port, "0.0.0.0", resolve);
      });

      logger.info("monitor server started", { port });
    },
    async stop() {
      if (!server) {
        return;
      }
      await new Promise((resolve) => {
        server.close(resolve);
      });
      server = null;
    }
  };
}

module.exports = {
  createMonitorServer
};
