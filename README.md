# Claude como Coach Financiero — con tu banco real

Dale a Claude acceso a tus movimientos bancarios reales y úsalo como coach financiero personal: que te diga en qué gastas, qué patrones tiene tu plata y qué podrías mejorar.

[Fintoc](https://fintoc.com) es el puente: conecta tu banco chileno de forma segura y baja los movimientos. Claude los lee y los analiza.

```
> en qué gasto más este año?

En lo que más gastas en 2025:
• TRANSFERENCIAS — $3.240.000 (48%)
• BENCINA — $890.000 (13%)
• SUPERMERCADO — $620.000 (9%)
• SUSCRIPCIONES / PAC — $180.000 (3%)

Casi la mitad de tu plata son transferencias a personas.
¿Son gastos fijos (arriendo, familia) o variables?
```

---

## Cómo funciona

```
Tu banco → Fintoc API → movimientos.json → Claude los lee → te responde
```

1. **Fintoc** se conecta a tu banco (con tus credenciales, de forma segura) y expone tus movimientos vía API.
2. Este proyecto baja esos movimientos y los cachea localmente.
3. **Claude** los analiza: responde preguntas en lenguaje natural, detecta hábitos, genera insights y actúa como coach conversacional.

Funciona **sin pagar por IA** gracias a un motor de reglas en español. Si tienes `ANTHROPIC_API_KEY`, el chat se convierte en coach con Claude real (multi-turno, preguntas abiertas, análisis profundo).

---

## Bancos disponibles en Fintoc Chile

| Banco | Test | Live |
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

> **Modo test**: bancos simulados con datos de prueba. Sin cuenta real, puedes probar todo igual.  
> **Modo live**: tu banco real. Requiere onboarding con Fintoc (gratis, 1-2 días).

---

## Setup

### 1. Crea cuenta en Fintoc

Ve a [fintoc.com](https://fintoc.com) → crea cuenta → ve a **API Keys** → copia tu `sk_test_...` y `pk_test_...`

### 2. Instala

```bash
git clone https://github.com/pablovidal05/fintoc-analyzer
cd fintoc-analyzer
npm install
cp .env.example .env
```

### 3. Agrega tus keys al `.env`

```env
FINTOC_SECRET_KEY=sk_test_TU_KEY_AQUI
FINTOC_PUBLIC_KEY=pk_test_TU_KEY_AQUI
```

### 4. Conecta tu banco

```bash
npm run widget
```

Abre [http://localhost:4000](http://localhost:4000) → **Conectar banco** → elige tu banco → autentícate.  
Al terminar, el `link_token` y `account_id` se guardan solos en `.env`.

> Credenciales de prueba para modo test: [docs.fintoc.com/docs/test-credentials](https://docs.fintoc.com/docs/test-credentials)

### 5. Activa Claude (opcional pero recomendado)

```env
ANTHROPIC_API_KEY=sk-ant-TU_KEY_AQUI
```

Consigue tu key en [console.anthropic.com](https://console.anthropic.com). Sin esta key, el chat funciona igual con reglas — con la key, Claude responde cualquier pregunta sobre tu plata.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run ask` | Chat en terminal: pregúntale a Claude sobre tus gastos |
| `npm run dashboard` | Dashboard web con gráficos + chat en `localhost:4000/dashboard` |
| `npm start` | Resumen mensual ingresos/gastos/neto |
| `npm run overview` | Panorama: saldo actual, ranking comercios, top gastos |
| `npm run widget` | Conecta banco (solo necesitas hacerlo una vez) |

### Ejemplos de preguntas que entiende

```
cuanto gaste en uber
cuanto gaste en supermercado en marzo
gastos en abril 2025
gastos recurrentes este año
en qué gasto más
cuanto gaste en bencina
resumen de este mes
```

---

## Dashboard web

```bash
npm run dashboard
# → http://localhost:4000/dashboard
```

Incluye:
- Saldo actual + KPIs
- Gráficos por mes (Chart.js)
- Filtro de fechas y búsqueda en lenguaje natural
- Panel "Tus hábitos" con categorías e insights
- Copiloto proactivo (detecta si vas ajustado, PAC alto, gasto hormiga)
- Chat lateral con Claude (o motor de reglas si no tienes key)

---

## Arquitectura

```
ask.js            Chat CLI con Claude (npm run ask)
index.js          Resumen mensual (npm start)
overview.js       Panorama completo (npm run overview)
server.js         Servidor: widget + dashboard + API de chat
lib.js            Fetch Fintoc, cache, categorización, nudges, analytics
chatlib.js        Motor de reglas: parse español, intents, búsqueda
public/
  index.html      Widget de conexión de banco
  dashboard.html  Dashboard visual con chat
.env.example      Variables de entorno necesarias
movements.json    Cache local (gitignored — tus datos nunca se suben)
.env              Keys y tokens (gitignored)
```

### Flujo Fintoc API

```
POST /v1/link_intents              → widget_token
Widget (frontend) → usuario elige banco y se autentica
GET  /v1/links/exchange?token=...  → link_token + cuentas
GET  /v1/accounts/{id}/movements   → movimientos paginados (amount negativo = gasto)
```

---

## Seguridad

- `.env` y `movements.json` en `.gitignore` — keys y datos bancarios nunca se suben a git
- `sk_` (secret key) solo en backend; jamás en el frontend ni en el código
- Si una key se filtra → rótala inmediatamente en el panel de Fintoc

---

## Licencia

MIT
