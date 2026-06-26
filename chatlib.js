// Motor de reglas del chat (gratis, sin IA). Devuelve string o null (null = pasar a IA).
import { merchant, fmtCLP, searchText } from "./lib.js";

const MESES = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05",
  junio: "06", julio: "07", agosto: "08", septiembre: "09", setiembre: "09",
  octubre: "10", noviembre: "11", diciembre: "12",
};
const MES_NOMBRE = Object.fromEntries(Object.entries(MESES).map(([k, v]) => [v, k]));

const STOP = new Set([
  "cuanto", "cuánto", "gaste", "gasté", "gasto", "gastos", "gastado", "en", "el",
  "la", "los", "las", "de", "del", "mes", "este", "esta", "un", "una", "por", "para",
  "que", "con", "y", "a", "me", "mi", "plata", "dinero", "total", "fue", "he",
  "durante", "cuales", "cuáles", "son", "mas", "más", "mis", "año", "ano", "años",
  "anio", "resumen", "balance", "saldo", "como", "cómo", "voy", "recurrentes",
  "recurrente", "frecuentes", "frecuente", "compras", "compra", "pago", "pagos",
  "movimientos", "movimiento",
]);

function parse(q) {
  const lower = q.normalize("NFC").toLowerCase().trim();
  let mes = null, anio = null;

  // Periodos relativos
  const now = new Date();
  if (/este a[nñ]o|en el a[nñ]o\b/.test(lower)) anio = String(now.getFullYear());
  if (/este mes/.test(lower)) {
    anio = String(now.getFullYear());
    mes = String(now.getMonth() + 1).padStart(2, "0");
  }

  const tokens = lower.split(/\s+/);
  const keywords = [];
  for (const tk of tokens) {
    const c = tk.replace(/[¿?¡!.,]/g, "");
    if (!c) continue;
    if (MESES[c]) { mes = MESES[c]; continue; }
    if (/^\d{4}$/.test(c)) { anio = c; continue; }
    const ym = c.match(/^(\d{4})-(\d{2})$/);
    if (ym) { anio = ym[1]; mes = ym[2]; continue; }
    if (STOP.has(c)) continue;
    keywords.push(c);
  }
  return { keywords, mes, anio };
}

function enPeriodo(m, mes, anio) {
  const f = (m.post_date || m.transaction_date || "").slice(0, 7);
  if (!f) return false;
  const [y, mm] = f.split("-");
  if (anio && y !== anio) return false;
  if (mes && mm !== mes) return false;
  return true;
}

function etiquetaPeriodo(mes, anio) {
  if (mes && anio) return ` en ${MES_NOMBRE[mes]} ${anio}`;
  if (mes) return ` en ${MES_NOMBRE[mes]}`;
  if (anio) return ` en ${anio}`;
  return "";
}

// Filtra movimientos por lenguaje natural (periodo + keyword). Para la barra de búsqueda.
export function searchMovements(movs, question) {
  const { keywords, mes, anio } = parse(question);
  let f = movs.filter((m) => enPeriodo(m, mes, anio));
  if (keywords.length) {
    f = f.filter((m) => {
      const t = searchText(m);
      return keywords.every((k) => t.includes(k));
    });
  }
  const periodo = etiquetaPeriodo(mes, anio).replace(/^ en /, "");
  const label =
    [keywords.length ? `"${keywords.join(" ")}"` : "", periodo]
      .filter(Boolean)
      .join(" · ") || "todo";
  return { movs: f, label, keywords, mes, anio };
}

export function answerRules(movs, question) {
  const q = question.normalize("NFC").toLowerCase();
  const { keywords, mes, anio } = parse(question);
  const periodo = etiquetaPeriodo(mes, anio);

  const gastos = movs.filter((m) => m.amount < 0 && enPeriodo(m, mes, anio));

  // Intent: gastos recurrentes / frecuentes
  if (/recurrent|frecuent|seguido|repit/.test(q)) {
    const map = {};
    for (const m of gastos) {
      const k = merchant(m);
      if (!map[k]) map[k] = { total: 0, n: 0 };
      map[k].total += -m.amount;
      map[k].n += 1;
    }
    const top = Object.entries(map).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    if (!top.length) return `No hay gastos${periodo}.`;
    let out = `Gastos más recurrentes${periodo} (por frecuencia):\n`;
    for (const [name, { total, n }] of top) {
      out += `\n• ${name} — ${n} veces, ${fmtCLP(total)}`;
    }
    return out;
  }

  // Intent: en qué gasto más / mayores gastos (por monto)
  if (/en qu[eé] (gast|se me va)|mayor(es)? gasto|donde gast|en qu[eé] me gast/.test(q) && !keywords.length) {
    const map = {};
    for (const m of gastos) {
      const k = merchant(m);
      if (!map[k]) map[k] = { total: 0, n: 0 };
      map[k].total += -m.amount;
      map[k].n += 1;
    }
    const top = Object.entries(map).sort((a, b) => b[1].total - a[1].total).slice(0, 8);
    if (!top.length) return `No hay gastos${periodo}.`;
    let out = `En lo que más gastas${periodo}:\n`;
    for (const [name, { total, n }] of top) {
      out += `\n• ${name} — ${fmtCLP(total)} (${n})`;
    }
    return out;
  }

  // Intent: resumen / balance / cómo voy
  if (/resumen|balance|c[oó]mo voy|cuanto gaste$|cuánto gasté$|total/.test(q) && !keywords.length) {
    const totalGasto = gastos.reduce((s, m) => s + -m.amount, 0);
    const ingresos = movs
      .filter((m) => m.amount > 0 && enPeriodo(m, mes, anio))
      .reduce((s, m) => s + m.amount, 0);
    return (
      `Resumen${periodo}:\n` +
      `\n• Ingresos: ${fmtCLP(ingresos)}` +
      `\n• Gastos: ${fmtCLP(totalGasto)}` +
      `\n• Neto: ${fmtCLP(ingresos - totalGasto)}` +
      `\n• ${gastos.length} gastos`
    );
  }

  // Intent: cuanto gaste en <keyword> [periodo]
  if (keywords.length && /(cuanto|cuánto|gast)/.test(q)) {
    const match = gastos.filter((m) => {
      const txt = searchText(m);
      return keywords.every((k) => txt.includes(k));
    });
    const total = match.reduce((s, m) => s + -m.amount, 0);
    const concepto = ` en "${keywords.join(" ")}"`;
    if (!match.length) return null; // sin match -> que lo intente la IA (sinónimos)
    let out = `Gastaste ${fmtCLP(total)}${concepto}${periodo} — ${match.length} movimientos.`;
    const top = [...match].sort((a, b) => a.amount - b.amount).slice(0, 5);
    for (const m of top) {
      out += `\n• ${(m.post_date || "").slice(0, 10)}  ${fmtCLP(-m.amount)}  ${(m.description || "").slice(0, 36)}`;
    }
    return out;
  }

  return null; // no entendido -> IA
}
