# Coach Financiero con Fintoc + Claude

Conecta tu banco chileno y analiza tus gastos con IA. En 3 pasos.

```
> cuanto gaste en supermercado en marzo
Gastaste $48.320 en "supermercado" en marzo — 6 movimientos.

Mayores:
  2025-03-22    $12.990  SANTA ISABEL
  2025-03-15     $9.800  JUMBO
```

---

## Paso 1 — Crea tu cuenta en Fintoc

Ve a [fintoc.com](https://fintoc.com) y crea una cuenta gratuita.

Una vez dentro, en el panel ve a **API Keys** y copia:
- `sk_test_...` → tu Secret Key (backend)
- `pk_test_...` → tu Public Key (widget)

> Empieza en modo **test** — bancos simulados, sin necesidad de conectar tu banco real todavía.

---

## Paso 2 — Instala y configura

```bash
git clone https://github.com/pablovidal05/fintoc-analyzer
cd fintoc-analyzer
npm install
```

Copia el archivo de ejemplo y pega tus keys:

```bash
cp .env.example .env
```

Edita `.env`:

```
FINTOC_SECRET_KEY=sk_test_TU_KEY_AQUI
FINTOC_PUBLIC_KEY=pk_test_TU_KEY_AQUI
```

---

## Paso 3 — Conecta tu banco

```bash
npm run widget
```

Abre [http://localhost:4000](http://localhost:4000), haz clic en **Conectar banco** y sigue el flujo.

Al terminar, el `link_token` y el `account_id` se guardan solos en tu `.env`. Listo.

---

## A jugar

**Preguntas en terminal:**
```bash
npm run ask
```

Ejemplos:
```
cuanto gaste en uber
cuanto gaste en supermercado en marzo
gastos en abril 2025
gastos recurrentes
en qué gasto más
resumen de este mes
```

**Dashboard web con gráficos:**
```bash
npm run dashboard
# → http://localhost:4000/dashboard
```

**Resumen rápido en terminal:**
```bash
npm start          # ingresos / gastos / neto por mes
npm run overview   # saldo + ranking de comercios + top gastos
```

---

## Activar coach IA con Claude (opcional)

Sin `ANTHROPIC_API_KEY` todo funciona con un motor de reglas gratis.

Si quieres el chat conversacional con Claude, agrega al `.env`:

```
ANTHROPIC_API_KEY=sk-ant-TU_KEY_AQUI
```

Consigue tu key en [console.anthropic.com](https://console.anthropic.com).

Con la key activa, el chat del dashboard y `npm run ask` usan Claude como coach financiero multi-turno — analiza tus hábitos, responde preguntas abiertas y da consejos accionables.

Modelo por defecto: `claude-opus-4-8`. Cambia con:
```
FINTOC_AI_MODEL=claude-haiku-4-5-20251001
```

---

## Bancos disponibles en Fintoc Chile

| Banco | Modo test | Modo live |
|---|---|---|
| Banco de Chile | ✅ | ✅ |
| Santander | ✅ | ✅ |
| BancoEstado | ✅ | ✅ |
| BCI | ✅ | ✅ |
| Scotiabank | ✅ | ✅ |
| Itaú | ✅ | ✅ |
| BICE | ✅ | ✅ |
| Banco Security | ✅ | ✅ |
| Falabella | ✅ | ✅ |
| Coopeuch | ✅ | ✅ |

> Modo live requiere onboarding con Fintoc (gratuito para uso personal, tarda 1-2 días).  
> Credenciales de prueba para modo test: [docs.fintoc.com/docs/test-credentials](https://docs.fintoc.com/docs/test-credentials)

---

## Seguridad

- `.env` y `movements.json` están en `.gitignore` — nunca se suben a git
- `sk_` (secret key) solo en backend; nunca en el frontend ni en el código
- Si una key se filtra, rótala en el panel de Fintoc de inmediato

---

## Licencia

MIT
