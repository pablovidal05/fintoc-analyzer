import "dotenv/config";
import { loadMovements, fmtCLP } from "./lib.js";

const API_BASE = "https://api.fintoc.com/v1";
const { FINTOC_SECRET_KEY, FINTOC_LINK_TOKEN } = process.env;

// Saldos actuales de las cuentas del link
async function fetchAccounts() {
  const url = `${API_BASE}/accounts?link_token=${encodeURIComponent(FINTOC_LINK_TOKEN)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${FINTOC_SECRET_KEY}` },
  });
  if (!res.ok) throw new Error(`Fintoc ${res.status}: ${await res.text()}`);
  return res.json();
}

// Nombre de comercio/concepto limpio para agrupar
function merchant(m) {
  let d = (m.description || "").toUpperCase();
  d = d.replace(/REDCOMPRA|COMPRA|TEF|PAT|PAGO|TRANSFERENCIA|GIRO|CARGO/g, " ");
  d = d.replace(/\d+/g, " ");
  d = d.replace(/[-_.]/g, " ").replace(/\s+/g, " ").trim();
  return d.slice(0, 26) || "(otros)";
}

function bar(frac, width = 24) {
  const n = Math.round(frac * width);
  return "█".repeat(n) + "·".repeat(width - n);
}

async function main() {
  const [accounts, movs] = await Promise.all([fetchAccounts(), loadMovements()]);

  // --- Cuentas + saldos ---
  console.log("\n══ TUS CUENTAS ══");
  let totalSaldo = 0;
  for (const a of accounts) {
    const disp = a.balance?.available ?? 0;
    totalSaldo += disp;
    console.log(
      `  ${a.name} (nº ${a.number})  ${a.type}\n` +
        `    Disponible: ${fmtCLP(disp)}   Contable: ${fmtCLP(a.balance?.current ?? 0)}`
    );
  }
  if (accounts.length > 1) console.log(`  TOTAL disponible: ${fmtCLP(totalSaldo)}`);

  // --- Totales del periodo ---
  const fechas = movs
    .map((m) => (m.post_date || "").slice(0, 10))
    .filter(Boolean)
    .sort();
  const ingresos = movs.filter((m) => m.amount > 0).reduce((s, m) => s + m.amount, 0);
  const gastos = movs.filter((m) => m.amount < 0).reduce((s, m) => s + m.amount, 0);

  console.log(`\n══ RESUMEN (${fechas[0]} → ${fechas.at(-1)}, ${movs.length} movs) ══`);
  console.log(`  Ingresos: ${fmtCLP(ingresos)}`);
  console.log(`  Gastos:   ${fmtCLP(gastos)}`);
  console.log(`  Neto:     ${fmtCLP(ingresos + gastos)}`);

  // --- En qué gastas más (por comercio) ---
  const porComercio = {};
  for (const m of movs) {
    if (m.amount >= 0) continue;
    const k = merchant(m);
    if (!porComercio[k]) porComercio[k] = { total: 0, n: 0 };
    porComercio[k].total += -m.amount;
    porComercio[k].n += 1;
  }
  const ranking = Object.entries(porComercio).sort((a, b) => b[1].total - a[1].total);
  const maxGasto = ranking[0]?.[1].total || 1;

  console.log("\n══ EN QUÉ GASTAS MÁS (top 15) ══");
  for (const [name, { total, n }] of ranking.slice(0, 15)) {
    console.log(
      `  ${bar(total / maxGasto)} ${fmtCLP(total).padStart(12)}  ${name} (${n})`
    );
  }

  // --- Mes con más gasto ---
  const porMes = {};
  for (const m of movs) {
    if (m.amount >= 0) continue;
    const mes = (m.post_date || "").slice(0, 7);
    porMes[mes] = (porMes[mes] || 0) + -m.amount;
  }
  const mesesOrden = Object.entries(porMes).sort((a, b) => b[1] - a[1]);
  console.log("\n══ MESES CON MÁS GASTO ══");
  for (const [mes, t] of mesesOrden.slice(0, 5)) {
    console.log(`  ${mes}  ${fmtCLP(t)}`);
  }

  // --- Gastos más grandes (individuales) ---
  const top = [...movs].filter((m) => m.amount < 0).sort((a, b) => a.amount - b.amount).slice(0, 8);
  console.log("\n══ GASTOS MÁS GRANDES ══");
  for (const m of top) {
    console.log(
      `  ${(m.post_date || "").slice(0, 10)}  ${fmtCLP(-m.amount).padStart(12)}  ${(m.description || "").slice(0, 38)}`
    );
  }
  console.log("");
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
