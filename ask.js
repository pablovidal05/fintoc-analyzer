import readline from "node:readline";
import { loadMovements, fmtCLP, searchText } from "./lib.js";

const MESES = {
  enero: "01", febrero: "02", marzo: "03", abril: "04",
  mayo: "05", junio: "06", julio: "07", agosto: "08",
  septiembre: "09", setiembre: "09", octubre: "10",
  noviembre: "11", diciembre: "12",
};
const MES_NOMBRE = Object.fromEntries(
  Object.entries(MESES).map(([k, v]) => [v, k])
);

// Palabras a ignorar al sacar el keyword
const STOP = new Set([
  "cuanto", "cuánto", "gaste", "gasté", "gasto", "gastos", "gastado",
  "en", "el", "la", "los", "las", "de", "del", "mes", "este", "un", "una",
  "por", "para", "que", "con", "y", "a", "me", "mi", "cuanta", "plata",
  "dinero", "total", "fue", "tengo", "he", "durante",
]);

function parseQuery(q) {
  const lower = q.toLowerCase().trim();
  const tokens = lower.split(/\s+/);

  // Mes (nombre) y/o anio (YYYY) y/o YYYY-MM
  let mes = null; // "01".."12"
  let anio = null; // "2025"
  const keywords = [];

  for (const tk of tokens) {
    const clean = tk.replace(/[¿?¡!.,]/g, "");
    if (!clean) continue;
    if (MESES[clean]) {
      mes = MESES[clean];
      continue;
    }
    if (/^\d{4}$/.test(clean)) {
      anio = clean;
      continue;
    }
    const ym = clean.match(/^(\d{4})-(\d{2})$/);
    if (ym) {
      anio = ym[1];
      mes = ym[2];
      continue;
    }
    if (STOP.has(clean)) continue;
    keywords.push(clean);
  }
  return { keywords, mes, anio };
}

function periodoFiltro(m, mes, anio) {
  const fecha = (m.post_date || m.transaction_date || "").slice(0, 7); // YYYY-MM
  if (!fecha) return false;
  const [y, mm] = fecha.split("-");
  if (anio && y !== anio) return false;
  if (mes && mm !== mes) return false;
  return true;
}

function responder(movs, q) {
  const { keywords, mes, anio } = parseQuery(q);

  let match = movs.filter((m) => m.amount < 0); // solo gastos
  match = match.filter((m) => periodoFiltro(m, mes, anio));

  if (keywords.length) {
    match = match.filter((m) => {
      const txt = searchText(m);
      return keywords.every((k) => txt.includes(k));
    });
  }

  const total = match.reduce((s, m) => s + m.amount, 0);

  // Etiqueta legible del periodo
  let periodo = "";
  if (mes && anio) periodo = ` en ${MES_NOMBRE[mes]} ${anio}`;
  else if (mes) periodo = ` en ${MES_NOMBRE[mes]} (todos los años)`;
  else if (anio) periodo = ` en ${anio}`;

  const concepto = keywords.length ? ` en "${keywords.join(" ")}"` : "";

  console.log(
    `\nGastaste ${fmtCLP(-total)}${concepto}${periodo} — ${match.length} movimientos.`
  );

  // Top 10 movimientos por monto
  const top = [...match].sort((a, b) => a.amount - b.amount).slice(0, 10);
  if (top.length) {
    console.log("\nMayores:");
    for (const m of top) {
      const f = (m.post_date || "").slice(0, 10);
      const desc = (m.description || "").slice(0, 40);
      const extra = m.comment ? `  [${m.comment.trim()}]` : "";
      console.log(`  ${f}  ${fmtCLP(-m.amount).padStart(12)}  ${desc}${extra}`);
    }
  }
  console.log("");
}

function resumen(movs) {
  const porMes = {};
  for (const m of movs) {
    const mes = (m.post_date || m.transaction_date || "").slice(0, 7);
    if (!mes) continue;
    if (!porMes[mes]) porMes[mes] = { ing: 0, gas: 0 };
    if (m.amount >= 0) porMes[mes].ing += m.amount;
    else porMes[mes].gas += m.amount;
  }
  console.log("\nPor mes (ingresos / gastos / neto):");
  for (const mes of Object.keys(porMes).sort()) {
    const { ing, gas } = porMes[mes];
    console.log(
      `  ${mes}  +${fmtCLP(ing).padStart(12)}  ${fmtCLP(gas).padStart(13)}  = ${fmtCLP(ing + gas)}`
    );
  }
  console.log("");
}

async function main() {
  const force = process.argv.includes("--refresh");
  const movs = await loadMovements({ force });

  console.log(`\n${movs.length} movimientos cargados.`);
  console.log("Pregunta cosas como:");
  console.log('  "cuanto gaste en uber"');
  console.log('  "cuanto gaste en supermercado en marzo"');
  console.log('  "gastos en abril 2025"');
  console.log("Comandos: resumen | refresh | salir\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });
  rl.prompt();

  rl.on("line", async (line) => {
    const q = line.trim();
    if (!q) return rl.prompt();
    if (["salir", "exit", "quit", "q"].includes(q.toLowerCase())) {
      rl.close();
      return;
    }
    if (q.toLowerCase() === "resumen") {
      resumen(movs);
      return rl.prompt();
    }
    if (q.toLowerCase() === "refresh") {
      const fresh = await loadMovements({ force: true });
      movs.length = 0;
      movs.push(...fresh);
      console.log(`Actualizado: ${movs.length} movimientos.`);
      return rl.prompt();
    }
    responder(movs, q);
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("Chao.");
    process.exit(0);
  });
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
