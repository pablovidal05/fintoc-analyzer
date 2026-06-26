import "dotenv/config";
import { createServer } from "node:http";
import { readFile, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadMovements, fetchAccounts, computeAnalytics, categorize, proactiveNudges } from "./lib.js";
import { answerRules, searchMovements } from "./chatlib.js";

const AI_MODEL = process.env.FINTOC_AI_MODEL || "claude-opus-4-8";
const HAS_AI = !!process.env.ANTHROPIC_API_KEY;

// Coach financiero conversacional con Claude (historial multi-turno + analítica como contexto)
async function answerAI(movs, messages) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno
  const ctx = computeAnalytics(movs);
  const resp = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    system:
      "Eres un coach financiero personal: cercano, directo y proactivo. Hablas español claro, sin tecnicismos.\n" +
      "Tienes los datos reales del usuario abajo (JSON). Usa SOLO esos datos; no inventes cifras. " +
      "Montos en CLP. En porComercio: 'total' es lo gastado (positivo) y 'n' = número de veces.\n" +
      "Qué haces:\n" +
      "- Analizas hábitos de consumo: comercios recurrentes (n alto), patrones por mes, en qué se va la plata.\n" +
      "- Das observaciones útiles y accionables, sin juzgar.\n" +
      "- Haces preguntas de seguimiento cuando ayudan (¿es gasto fijo o puntual? ¿tienes meta de ahorro? ¿qué categoría quieres revisar?).\n" +
      "- Eres breve (2-6 frases). Si falta info, la pides en vez de inventar.\n\n" +
      `DATOS DEL USUARIO:\n${JSON.stringify(ctx)}`,
    messages, // historial conversacional [{role, content}, ...]
  });
  return resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_BASE = "https://api.fintoc.com/v1";
const PORT = process.env.PORT || 4000;

const {
  FINTOC_SECRET_KEY,
  FINTOC_PUBLIC_KEY,
  FINTOC_HOLDER_TYPE = "individual",
  FINTOC_COUNTRY = "cl",
} = process.env;

if (!FINTOC_SECRET_KEY || !FINTOC_PUBLIC_KEY) {
  console.error(
    "Faltan FINTOC_SECRET_KEY o FINTOC_PUBLIC_KEY en .env.\n" +
      "La SECRET (sk_...) la sacas del panel de Fintoc -> API Keys."
  );
  process.exit(1);
}

// --- Helpers ---
function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

async function fintoc(path, { method = "POST", body } = {}) {
  const opt = {
    method,
    headers: {
      Authorization: `Bearer ${FINTOC_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
  };
  if (body) opt.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opt);
  const text = await res.text();
  if (!res.ok) throw new Error(`Fintoc ${res.status}: ${text}`);
  return JSON.parse(text);
}

// Actualiza una clave en .env (la crea si no existe)
function setEnv(key, value) {
  const path = join(__dirname, ".env");
  let env = readFileSync(path, "utf8");
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  env = re.test(env) ? env.replace(re, line) : env.trimEnd() + "\n" + line + "\n";
  writeFileSync(path, env);
}

// --- Rutas ---
const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      readFile(join(__dirname, "public", "index.html"), "utf8", (err, html) => {
        if (err) return json(res, 500, { error: "no index.html" });
        html = html.replace("__PUBLIC_KEY__", FINTOC_PUBLIC_KEY);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      });
      return;
    }

    // Dashboard visual
    if (req.method === "GET" && (req.url === "/dashboard" || req.url.startsWith("/dashboard?"))) {
      readFile(join(__dirname, "public", "dashboard.html"), "utf8", (err, html) => {
        if (err) return json(res, 500, { error: "no dashboard.html" });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      });
      return;
    }

    // Datos para el dashboard
    //   ?refresh=1 re-baja de Fintoc
    //   ?from=YYYY-MM-DD&to=YYYY-MM-DD filtra por rango de fechas
    if (req.method === "GET" && req.url.startsWith("/api/data")) {
      const u = new URL(req.url, "http://localhost");
      const force = u.searchParams.get("refresh") === "1";
      const from = u.searchParams.get("from");
      const to = u.searchParams.get("to");

      const [accounts, allMovs] = await Promise.all([
        fetchAccounts(),
        loadMovements({ force }),
      ]);

      let movs = allMovs;
      if (from) movs = movs.filter((m) => (m.post_date || "").slice(0, 10) >= from);
      if (to) movs = movs.filter((m) => (m.post_date || "").slice(0, 10) <= to);

      const cuentas = accounts.map((a) => ({
        name: a.name,
        number: a.number,
        type: a.type,
        disponible: a.balance?.available ?? 0,
        contable: a.balance?.current ?? 0,
      }));
      return json(res, 200, {
        cuentas,
        filtro: { from, to },
        nudges: proactiveNudges(allMovs, accounts),
        habitos: categorize(movs),
        ...computeAnalytics(movs),
      });
    }

    // Búsqueda en lenguaje natural -> filtra el dashboard (job #2)
    if (req.method === "POST" && req.url === "/api/search") {
      const { question } = await readBody(req);
      if (!question || !question.trim())
        return json(res, 400, { error: "falta question" });

      const [accounts, allMovs] = await Promise.all([
        fetchAccounts(),
        loadMovements(),
      ]);
      const { movs, label } = searchMovements(allMovs, question);
      const cuentas = accounts.map((a) => ({
        name: a.name,
        number: a.number,
        type: a.type,
        disponible: a.balance?.available ?? 0,
        contable: a.balance?.current ?? 0,
      }));
      return json(res, 200, {
        label,
        cuentas,
        nudges: proactiveNudges(allMovs, accounts),
        habitos: categorize(movs),
        ...computeAnalytics(movs),
      });
    }

    // Chat: con IA = coach conversacional multi-turno; sin key = reglas
    if (req.method === "POST" && req.url === "/api/chat") {
      const body = await readBody(req);
      const history = Array.isArray(body.messages)
        ? body.messages
        : body.question
          ? [{ role: "user", content: body.question }]
          : null;
      if (!history || !history.length)
        return json(res, 400, { error: "falta messages/question" });

      const movs = await loadMovements(); // todo el historial

      if (HAS_AI) {
        try {
          const answer = await answerAI(movs, history);
          return json(res, 200, { source: "ia", answer });
        } catch (e) {
          return json(res, 200, { source: "error", answer: "Error IA: " + e.message });
        }
      }

      // Sin key: reglas sobre el último mensaje del usuario
      const lastUser = [...history].reverse().find((m) => m.role === "user");
      const ruleAnswer = lastUser ? answerRules(movs, lastUser.content) : null;
      if (ruleAnswer) return json(res, 200, { source: "reglas", answer: ruleAnswer });
      // Flujo de reparación: no entendí -> ofrezco caminos concretos (diseño conversacional)
      return json(res, 200, {
        source: "none",
        answer:
          "Esa no la pude calcular con mis reglas 🤔. Para análisis abierto (hábitos, consejos) " +
          "necesito IA — mira el panel \"Tus hábitos\" arriba mientras tanto. O prueba con una de estas:",
        suggestions: [
          "gastos recurrentes este año",
          "en qué gasto más",
          "resumen de este mes",
          "cuanto gaste en supermercado",
        ],
      });
    }

    // Paso 1: crear link_intent -> widget_token
    if (req.method === "POST" && req.url === "/create-link-intent") {
      const intent = await fintoc("/link_intents", {
        body: {
          product: "movements",
          country: FINTOC_COUNTRY,
          holder_type: FINTOC_HOLDER_TYPE,
        },
      });
      return json(res, 200, { widget_token: intent.widget_token });
    }

    // Paso 3: exchange_token -> link_token + cuentas
    if (req.method === "POST" && req.url === "/exchange") {
      const { exchange_token } = await readBody(req);
      if (!exchange_token) return json(res, 400, { error: "falta exchange_token" });

      const link = await fintoc(
        `/links/exchange?exchange_token=${encodeURIComponent(exchange_token)}`,
        { method: "GET" }
      );
      const linkToken = link.link_token;
      const accounts = (link.accounts || []).map((a) => ({
        id: a.id,
        name: a.name || a.holder_name,
        number: a.number,
        type: a.type,
      }));

      // Guarda automaticamente en .env (link_token + primera cuenta)
      if (linkToken) setEnv("FINTOC_LINK_TOKEN", linkToken);
      if (accounts[0]) setEnv("FINTOC_ACCOUNT_ID", accounts[0].id);

      console.log("\n=== CONEXION OK ===");
      console.log("link_token:", linkToken);
      console.log("cuentas:", accounts);
      console.log("Guardado en .env. Ya puedes correr: node index.js\n");

      return json(res, 200, { link_token: linkToken, accounts });
    }

    json(res, 404, { error: "not found" });
  } catch (err) {
    console.error(err);
    json(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Widget en http://localhost:${PORT}`);
  console.log("Abre esa URL, conecta tu banco, y se guardara el link en .env.");
});
