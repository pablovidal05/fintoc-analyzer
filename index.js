import "dotenv/config";

const API_BASE = "https://api.fintoc.com/v1";

const {
  FINTOC_SECRET_KEY,
  FINTOC_LINK_TOKEN,
  FINTOC_ACCOUNT_ID,
} = process.env;

// --- Validacion de entorno ---
function checkEnv() {
  const faltan = [];
  if (!FINTOC_SECRET_KEY) faltan.push("FINTOC_SECRET_KEY (sk_live_/sk_test_)");
  if (!FINTOC_LINK_TOKEN) faltan.push("FINTOC_LINK_TOKEN");
  if (!FINTOC_ACCOUNT_ID) faltan.push("FINTOC_ACCOUNT_ID");

  if (faltan.length) {
    console.error("Faltan variables en .env:\n  - " + faltan.join("\n  - "));
    console.error(
      "\nNota: la pk_live_ es la key PUBLICA (widget). Para el backend " +
        "necesitas la SECRET key (sk_...) desde el panel de Fintoc."
    );
    process.exit(1);
  }
}

// --- Trae todos los movimientos paginando ---
async function fetchMovements() {
  const movs = [];
  let page = 1;
  const perPage = 300;

  while (true) {
    const url =
      `${API_BASE}/accounts/${FINTOC_ACCOUNT_ID}/movements` +
      `?link_token=${FINTOC_LINK_TOKEN}&page=${page}&per_page=${perPage}`;

    const res = await fetch(url, {
      headers: { Authorization: FINTOC_SECRET_KEY },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Fintoc ${res.status} ${res.statusText}: ${body}`);
    }

    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    movs.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }

  return movs;
}

// --- Resumen ingresos/gastos ---
function analizar(movs) {
  let ingresos = 0;
  let gastos = 0;
  const porMes = {}; // "YYYY-MM" -> { ingresos, gastos }

  for (const m of movs) {
    const monto = Number(m.amount) || 0;
    const fecha = (m.post_date || m.transaction_date || "").slice(0, 7);

    if (!porMes[fecha]) porMes[fecha] = { ingresos: 0, gastos: 0 };

    if (monto >= 0) {
      ingresos += monto;
      porMes[fecha].ingresos += monto;
    } else {
      gastos += monto;
      porMes[fecha].gastos += monto;
    }
  }

  return { ingresos, gastos, neto: ingresos + gastos, porMes };
}

function fmt(n) {
  return new Intl.NumberFormat("es-CL").format(n);
}

async function main() {
  checkEnv();

  console.log("Trayendo movimientos de Fintoc...\n");
  const movs = await fetchMovements();
  const { ingresos, gastos, neto, porMes } = analizar(movs);

  console.log(`Movimientos: ${movs.length}`);
  console.log(`Ingresos:    ${fmt(ingresos)}`);
  console.log(`Gastos:      ${fmt(gastos)}`);
  console.log(`Neto:        ${fmt(neto)}\n`);

  console.log("Por mes:");
  for (const mes of Object.keys(porMes).sort()) {
    const { ingresos, gastos } = porMes[mes];
    console.log(
      `  ${mes}  +${fmt(ingresos)}  ${fmt(gastos)}  = ${fmt(ingresos + gastos)}`
    );
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
