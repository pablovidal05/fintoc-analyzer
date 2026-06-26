import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_BASE = "https://api.fintoc.com/v1";
const CACHE = join(__dirname, "movements.json");

const { FINTOC_SECRET_KEY, FINTOC_LINK_TOKEN, FINTOC_ACCOUNT_ID } = process.env;

export function checkEnv() {
  const faltan = [];
  if (!FINTOC_SECRET_KEY) faltan.push("FINTOC_SECRET_KEY");
  if (!FINTOC_LINK_TOKEN) faltan.push("FINTOC_LINK_TOKEN");
  if (!FINTOC_ACCOUNT_ID) faltan.push("FINTOC_ACCOUNT_ID");
  if (faltan.length) {
    console.error("Faltan en .env: " + faltan.join(", "));
    process.exit(1);
  }
}

// Trae todos los movimientos paginando
export async function fetchAllMovements() {
  const movs = [];
  let page = 1;
  const perPage = 300;
  while (true) {
    const url =
      `${API_BASE}/accounts/${FINTOC_ACCOUNT_ID}/movements` +
      `?link_token=${encodeURIComponent(FINTOC_LINK_TOKEN)}` +
      `&page=${page}&per_page=${perPage}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${FINTOC_SECRET_KEY}` },
    });
    if (!res.ok) throw new Error(`Fintoc ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    movs.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }
  return movs;
}

// Carga desde cache; si no existe o force, baja y guarda
export async function loadMovements({ force = false } = {}) {
  checkEnv();
  if (!force && existsSync(CACHE)) {
    return JSON.parse(readFileSync(CACHE, "utf8"));
  }
  console.error("Bajando movimientos de Fintoc...");
  const movs = await fetchAllMovements();
  writeFileSync(CACHE, JSON.stringify(movs));
  console.error(`Guardados ${movs.length} movimientos en cache (movements.json).`);
  return movs;
}

export function fmtCLP(n) {
  return "$" + new Intl.NumberFormat("es-CL").format(Math.round(n));
}

// Saldos actuales de las cuentas del link
export async function fetchAccounts() {
  const url = `${API_BASE}/accounts?link_token=${encodeURIComponent(FINTOC_LINK_TOKEN)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${FINTOC_SECRET_KEY}` },
  });
  if (!res.ok) throw new Error(`Fintoc ${res.status}: ${await res.text()}`);
  return res.json();
}

// Nombre de comercio/concepto limpio para agrupar
export function merchant(m) {
  let d = (m.description || "").toUpperCase();
  d = d.replace(/REDCOMPRA|COMPRA|TEF|PAT|PAGO|TRANSFERENCIA|GIRO|CARGO/g, " ");
  d = d.replace(/\d+/g, " ");
  d = d.replace(/[-_.]/g, " ").replace(/\s+/g, " ").trim();
  return d.slice(0, 26) || "(otros)";
}

// Categoriza gastos en buckets de hábito + genera insights (copy conversacional, sin LLM)
export function categorize(movs) {
  const g = movs.filter((m) => m.amount < 0);
  const txt = (m) =>
    [m.description, m.comment, m.recipient_account?.holder_name]
      .filter(Boolean).join(" ").toUpperCase();

  const reglas = [
    ["Transferencias a personas", (m) => m.type === "transfer"],
    ["Supermercado", (m) => /ISABEL|JUMBO|LIDER|ACUENTA|TOTTUS|UNIMARC|MAYORISTA|MERCADO/.test(txt(m))],
    ["Bencina", (m) => /SHELL|COPEC|ARAMCO|ESMAX|PETROBRAS|LIPIGAS|LIQUIMAX/.test(txt(m))],
    ["Comida y delivery", (m) => /UBER EATS|PEDIDOS|RAPPI|MCDONALD|KFC|DOMINO|RESTAUR|CACTUS/.test(txt(m))],
    ["Estacionamiento", (m) => /PARKING|ESTACION/.test(txt(m))],
    ["Tarjeta de crédito", (m) => /TARJ CRED|TARJETA/.test(txt(m))],
    ["Suscripciones y PAC", (m) => /PAC |NETFLIX|SPOTIFY|SUSCRIP/.test(txt(m))],
  ];

  const total = g.reduce((s, m) => s - m.amount, 0) || 1;
  const usados = new Set();
  const categorias = [];
  for (const [name, fn] of reglas) {
    const ms = g.filter((m) => !usados.has(m.id) && fn(m));
    ms.forEach((m) => usados.add(m.id));
    const t = ms.reduce((s, m) => s - m.amount, 0);
    if (t > 0) categorias.push({ name, total: t, n: ms.length, pct: (t / total) * 100 });
  }
  const otros = g.filter((m) => !usados.has(m.id)).reduce((s, m) => s - m.amount, 0);
  if (otros > 0) categorias.push({ name: "Otros", total: otros, n: g.filter((m) => !usados.has(m.id)).length, pct: (otros / total) * 100 });
  categorias.sort((a, b) => b.total - a.total);

  const dias = new Set(g.map((m) => (m.post_date || "").slice(0, 10))).size || 1;
  const ritmo = { gastos: g.length, dias, ticket: Math.round(total / (g.length || 1)) };

  // Insights: copy empático y accionable derivado de los números
  const insights = [];
  const fmt = (n) => "$" + new Intl.NumberFormat("es-CL").format(Math.round(n));
  const c0 = categorias[0];
  if (c0 && c0.name === "Transferencias a personas" && c0.pct > 35) {
    insights.push(`Casi la mitad de tu plata (${c0.pct.toFixed(0)}%) son transferencias a personas. Es tu patrón principal — vale la pena saber si son gastos fijos (arriendo, familia) o variables.`);
  } else if (c0) {
    insights.push(`Donde más se te va la plata es en ${c0.name.toLowerCase()}: ${fmt(c0.total)} (${c0.pct.toFixed(0)}%).`);
  }
  const sup = categorias.find((c) => c.name === "Supermercado");
  if (sup && sup.n >= 20) {
    insights.push(`Vas al super seguido: ${sup.n} compras (ticket bajo). Compras chicas frecuentes — una compra grande planificada suele salir más barato.`);
  }
  const pac = categorias.find((c) => c.name === "Suscripciones y PAC");
  if (pac && pac.total > 0) {
    insights.push(`${fmt(pac.total)} en cargos automáticos (PAC/suscripciones). Revisa cuáles usas de verdad — es el ahorro más fácil.`);
  }
  insights.push(`Tu ritmo: ~${(ritmo.gastos / ritmo.dias).toFixed(1)} gastos al día, ticket promedio ${fmt(ritmo.ticket)}.`);

  return { categorias, ritmo, insights };
}

// Copiloto proactivo: detecta eventos en la data y genera nudges empáticos (priorizados, anti-fatiga)
// Diseñado para ESTE usuario: transferencias dominantes, PAC alto, va justo, gasto hormiga en super.
export function proactiveNudges(movs, accounts) {
  const fmt = (n) => "$" + new Intl.NumberFormat("es-CL").format(Math.round(n));
  const g = movs.filter((m) => m.amount < 0);
  if (!g.length) return [];

  const meses = new Set(g.map((m) => (m.post_date || "").slice(0, 7)));
  const nMeses = Math.max(meses.size, 1);
  const ymNow = (movs.map((m) => (m.post_date || "").slice(0, 7)).sort().at(-1)) || "";
  const saldo = (accounts || []).reduce((s, a) => s + (a.balance?.available ?? 0), 0);

  const txt = (m) =>
    [m.description, m.comment, m.recipient_account?.holder_name].filter(Boolean).join(" ").toUpperCase();

  // PAC / suscripciones
  const pac = g.filter((m) => /PAC |NETFLIX|SPOTIFY|SUSCRIP|SEGURO|PLAN /.test(txt(m)));
  const pacMensual = pac.reduce((s, m) => s - m.amount, 0) / nMeses;
  const pacCount = Math.round(pac.length / nMeses);

  // Transferencia recurrente principal (por destinatario)
  const porDest = {};
  for (const m of g) {
    if (m.type !== "transfer") continue;
    const id = m.recipient_account?.holder_id || m.recipient_account?.holder_name;
    if (!id) continue;
    if (!porDest[id]) porDest[id] = { id, nombre: m.recipient_account?.holder_name || "alguien", total: 0, n: 0 };
    porDest[id].total += -m.amount;
    porDest[id].n += 1;
  }
  const topDest = Object.values(porDest).filter((d) => d.n >= 3).sort((a, b) => b.total - a.total)[0];
  const transferMensual = topDest ? topDest.total / nMeses : 0;
  const primerNombre = topDest ? topDest.nombre.split(/\s+/)[0] : "";

  // Compromisos fijos estimados / mes
  const fijoMensual = pacMensual + transferMensual;

  // Mes actual vs promedio
  const gastoMes = g.filter((m) => (m.post_date || "").slice(0, 7) === ymNow).reduce((s, m) => s - m.amount, 0);
  const ingresoMes = movs.filter((m) => m.amount > 0 && (m.post_date || "").slice(0, 7) === ymNow).reduce((s, m) => s + m.amount, 0);

  // Super (gasto hormiga)
  const sup = g.filter((m) => /ISABEL|JUMBO|LIDER|ACUENTA|TOTTUS|UNIMARC|MERCADO/.test(txt(m)));
  const supMes = Math.round(sup.length / nMeses);

  const nudges = [];

  // 1. Saldo ajustado vs compromisos fijos
  if (fijoMensual > 0 && saldo < fijoMensual * 1.2) {
    nudges.push({
      priority: 1,
      icon: "⚠️",
      title: "Vas ajustado este mes",
      message:
        `Te quedan ${fmt(saldo)} y tus compromisos fijos rondan ${fmt(fijoMensual)} al mes` +
        (primerNombre ? ` (suscripciones + tu transferencia a ${primerNombre})` : "") +
        `. Ojo con gastos extra hasta tu próximo ingreso.`,
      action: "Ver compromisos fijos",
      query: "pac",
    });
  }

  // 2. Suscripciones / PAC — ahorro fácil
  if (pacMensual > 30000) {
    nudges.push({
      priority: 2,
      icon: "🔁",
      title: "Revisa tus cargos automáticos",
      message:
        `Pagas ~${fmt(pacMensual)} al mes en ${pacCount} cargos automáticos (PAC/suscripciones). ` +
        `Es donde más fácil se ahorra — ¿revisamos cuáles usas de verdad?`,
      action: "Ver suscripciones",
      query: "pac",
    });
  }

  // 3. Cash-flow del mes en rojo
  if (gastoMes > ingresoMes && ingresoMes > 0) {
    nudges.push({
      priority: 1,
      icon: "📉",
      title: "Este mes vas en rojo",
      message:
        `Llevas ${fmt(gastoMes)} gastado vs ${fmt(ingresoMes)} de ingreso este mes ` +
        `(${fmt(gastoMes - ingresoMes)} bajo cero). No es para alarmarse, pero conviene frenar lo no esencial.`,
      action: "Ver gastos del mes",
      query: "este mes",
    });
  }

  // 4. Gasto hormiga en super
  if (supMes >= 10) {
    nudges.push({
      priority: 3,
      icon: "🛒",
      title: "Muchas compras chicas al super",
      message:
        `Vas al super ~${supMes} veces al mes. Las compras chicas frecuentes suman; ` +
        `una compra grande planificada suele salir más barata.`,
      action: "Ver supermercado",
      query: "isabel",
    });
  }

  // 5. Tendencia: últimos 30 días vs 30 previos
  const dmax = g.map((m) => m.post_date).filter(Boolean).sort().at(-1);
  if (dmax) {
    const end = new Date(dmax.slice(0, 10));
    const dN = (n) => { const x = new Date(end); x.setDate(end.getDate() - n); return x.toISOString().slice(0, 10); };
    const endIso = end.toISOString().slice(0, 10);
    const rango = (a, b) => g.filter((m) => { const f = (m.post_date || "").slice(0, 10); return f > a && f <= b; }).reduce((s, m) => s - m.amount, 0);
    const ult = rango(dN(30), endIso);
    const prev = rango(dN(60), dN(30));
    if (prev > 0) {
      const pct = Math.round(((ult - prev) / prev) * 100);
      if (Math.abs(pct) >= 15) {
        nudges.push({
          priority: 2,
          icon: pct > 0 ? "📈" : "📉",
          title: `Gastaste ${Math.abs(pct)}% ${pct > 0 ? "más" : "menos"} que el periodo anterior`,
          message:
            `Últimos 30 días: ${fmt(ult)} vs ${fmt(prev)} antes. ` +
            (pct > 0 ? "Algo subió — vale la pena ver en qué." : "¡Bien! vas a la baja."),
          action: "Ver detalle",
          query: "este mes",
        });
      }
    }
  }

  // 6. Recordatorio de transferencia mensual dominante (¿ya salió este mes?)
  if (topDest && transferMensual > 50000) {
    const yaEsteMes = g.some(
      (m) =>
        m.type === "transfer" &&
        (m.recipient_account?.holder_id || m.recipient_account?.holder_name) === topDest.id &&
        (m.post_date || "").slice(0, 7) === ymNow
    );
    if (!yaEsteMes) {
      nudges.push({
        priority: 2,
        icon: "📅",
        title: `Tu transferencia a ${primerNombre} aún no aparece`,
        message:
          `Cada mes transfieres ~${fmt(transferMensual)} a ${primerNombre} y este mes todavía no figura. ` +
          `Si es un pago fijo, conviene tenerlo apartado.`,
        action: `Ver transferencias a ${primerNombre}`,
        query: primerNombre.toLowerCase(),
      });
    }
  }

  // 7. Meta de ahorro sugerida (según tus mejores meses)
  const netoMes = {};
  for (const m of movs) {
    const ym = (m.post_date || "").slice(0, 7);
    if (ym) netoMes[ym] = (netoMes[ym] || 0) + m.amount;
  }
  const positivos = Object.values(netoMes).filter((v) => v > 0);
  if (positivos.length >= 2) {
    const avgPos = positivos.reduce((a, b) => a + b, 0) / positivos.length;
    const meta = Math.round((avgPos * 0.5) / 1000) * 1000;
    if (meta >= 10000) {
      nudges.push({
        priority: 3,
        icon: "🎯",
        title: "Podrías fijar una meta de ahorro",
        message:
          `En tus mejores meses te queda ~${fmt(avgPos)} a favor. Una meta realista: apartar ` +
          `${fmt(meta)} apenas entra tu plata, antes de gastarla.`,
        action: "Ver mis mejores meses",
        query: "resumen este año",
      });
    }
  }

  // 8. Comercio nuevo en el último mes
  if (dmax) {
    const end2 = new Date(dmax.slice(0, 10));
    const c = new Date(end2); c.setDate(end2.getDate() - 30);
    const cutoff = c.toISOString().slice(0, 10);
    const firstSeen = {}, totM = {};
    for (const m of g) {
      const k = merchant(m), f = (m.post_date || "").slice(0, 10);
      if (!firstSeen[k] || f < firstSeen[k]) firstSeen[k] = f;
      totM[k] = (totM[k] || 0) - m.amount;
    }
    const nuevos = Object.keys(firstSeen)
      .filter((k) => firstSeen[k] > cutoff && totM[k] > 20000 && k !== "(otros)")
      .sort((a, b) => totM[b] - totM[a]);
    if (nuevos.length) {
      const k = nuevos[0];
      nudges.push({
        priority: 3,
        icon: "🆕",
        title: "Comercio nuevo en tus gastos",
        message:
          `Apareció "${k}" este último mes (${fmt(totM[k])}). Si es un cobro recurrente nuevo, tenlo en el radar.`,
        action: `Ver ${k}`,
        query: k.split(/\s+/)[0].toLowerCase(),
      });
    }
  }

  // 9. Día de la semana de más gasto
  const dowNames = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const sumDow = [0, 0, 0, 0, 0, 0, 0];
  for (const m of g) {
    const d = new Date((m.post_date || "").slice(0, 10));
    if (!isNaN(d)) sumDow[d.getUTCDay()] += -m.amount;
  }
  const mx = sumDow.indexOf(Math.max(...sumDow));
  if (sumDow[mx] > 0) {
    nudges.push({
      priority: 4,
      icon: "📆",
      title: `Los ${dowNames[mx]} gastas más`,
      message: `Históricamente los ${dowNames[mx]} concentran tus mayores gastos. Si quieres frenar, ese es el día a vigilar.`,
    });
  }

  // Dashboard (no push): mostramos hasta 6 ordenados por prioridad
  return nudges.sort((a, b) => a.priority - b.priority).slice(0, 6);
}

// Analitica lista para el dashboard
export function computeAnalytics(movs) {
  const ingresos = movs.filter((m) => m.amount > 0).reduce((s, m) => s + m.amount, 0);
  const gastos = movs.filter((m) => m.amount < 0).reduce((s, m) => s + m.amount, 0);

  const fechas = movs.map((m) => (m.post_date || "").slice(0, 10)).filter(Boolean).sort();

  // Por mes
  const mesMap = {};
  for (const m of movs) {
    const mes = (m.post_date || m.transaction_date || "").slice(0, 7);
    if (!mes) continue;
    if (!mesMap[mes]) mesMap[mes] = { ingresos: 0, gastos: 0 };
    if (m.amount >= 0) mesMap[mes].ingresos += m.amount;
    else mesMap[mes].gastos += -m.amount;
  }
  const porMes = Object.keys(mesMap).sort().map((mes) => ({ mes, ...mesMap[mes] }));

  // Por comercio (gastos)
  const comMap = {};
  for (const m of movs) {
    if (m.amount >= 0) continue;
    const k = merchant(m);
    if (!comMap[k]) comMap[k] = { total: 0, n: 0 };
    comMap[k].total += -m.amount;
    comMap[k].n += 1;
  }
  const porComercio = Object.entries(comMap)
    .map(([nombre, v]) => ({ nombre, ...v }))
    .sort((a, b) => b.total - a.total);

  // Gastos individuales mas grandes
  const topGastos = movs
    .filter((m) => m.amount < 0)
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 12)
    .map((m) => ({
      fecha: (m.post_date || "").slice(0, 10),
      monto: -m.amount,
      descripcion: m.description || "",
      comentario: m.comment || "",
    }));

  return {
    desde: fechas[0] || null,
    hasta: fechas.at(-1) || null,
    nMovs: movs.length,
    ingresos,
    gastos: -gastos,
    neto: ingresos + gastos,
    porMes,
    porComercio,
    topGastos,
  };
}

// Expande abreviaciones comunes de comercios chilenos (para que "santa isabel" matchee "STA ISABEL")
function expandAliases(s) {
  return s
    .replace(/\bsta\b/g, "santa")
    .replace(/\bsto\b/g, "santo")
    .replace(/\bsn\b/g, "san")
    .replace(/\bsupmdo\b/g, "supermercado")
    .replace(/\bcomercial\b/g, "comercializadora");
}

// Texto buscable de un movimiento
export function searchText(m) {
  const base = [
    m.description,
    m.comment,
    m.recipient_account?.holder_name,
    m.recipient_account?.institution?.name,
    m.type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return base + " " + expandAliases(base);
}
