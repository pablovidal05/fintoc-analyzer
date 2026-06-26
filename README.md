# Claude como Coach Financiero con Fintoc

Conecta tu banco chileno con [Fintoc](https://fintoc.com), baja tus movimientos y analízalos con un coach financiero impulsado por Claude (Anthropic).

Funciona sin pagar por IA gracias a un motor de reglas en español. Si tienes `ANTHROPIC_API_KEY`, el chat se convierte en coach conversacional multi-turno con Claude.

```
> cuanto gaste en supermercado en marzo
Gastaste $48.320 en "supermercado" en marzo — 6 movimientos.

Mayores:
  2025-03-22    $12.990  SANTA ISABEL 12345
  2025-03-15     $9.800  JUMBO ...
```

## Lo que incluye

| Comando | Qué hace |
|---|---|
| `npm run widget` | Conecta tu banco (widget Fintoc → guarda link en `.env`) |
| `npm run ask` | CLI de preguntas en lenguaje natural sobre tus gastos |
| `npm start` | Resumen mensual ingresos/gastos/neto en terminal |
| `npm run overview` | Panorama completo: saldo, ranking de comercios, meses |
| `npm run dashboard` | Dashboard web con gráficos + chat coach en `localhost:4000` |

## Requisitos

- Node.js 18+
- Cuenta en [Fintoc](https://fintoc.com) (gratis para modo test; para producción necesitas onboarding)
- Opcional: `ANTHROPIC_API_KEY` para activar el coach IA

## Setup

### 1. Instalar dependencias

```bash
npm install
```

### 2. Crear `.env`

Copia `.env.example` a `.env`:

```bash
cp .env.example .env
```

Edita `.env` con tus keys de Fintoc (las sacas del [panel de Fintoc](https://app.fintoc.com)):

```
FINTOC_SECRET_KEY=sk_test_xxxxxxxx   # backend
FINTOC_PUBLIC_KEY=pk_test_xxxxxxxx   # widget frontend
```

`sk_` y `pk_` deben ser del mismo modo (test ↔ test, live ↔ live).

### 3. Conectar un banco

```bash
npm run widget
```

Abre `http://localhost:4000`, haz clic en "Conectar banco" y sigue el flujo.  
Al terminar, `FINTOC_LINK_TOKEN` y `FINTOC_ACCOUNT_ID` se guardan solos en tu `.env`.

**Modo test**: bancos simulados con datos de prueba. Credenciales en la [documentación de Fintoc](https://docs.fintoc.com/docs/test-credentials).  
**Modo live**: tu banco real. Requiere que Fintoc te habilite producción.

### 4. Hacer preguntas

```bash
npm run ask
```

Ejemplos de preguntas que entiende:

```
cuanto gaste en uber
cuanto gaste en supermercado en marzo
gastos en abril 2025
cuanto gaste en redcompra este año
gastos recurrentes
en qué gasto más
resumen de este mes
```

Comandos especiales: `resumen` · `refresh` (re-baja desde Fintoc) · `salir`

## Dashboard web (opcional)

```bash
npm run dashboard
```

Abre `http://localhost:4000/dashboard`.

Incluye:
- KPIs y saldo en tiempo real
- Filtro de fechas (presets + rango personalizado)
- Búsqueda en lenguaje natural que filtra toda la vista
- Gráficos por mes (Chart.js)
- Panel "Tus hábitos" (categorías + insights empáticos)
- Copiloto proactivo (nudges según tus patrones reales)
- Chat lateral: motor de reglas gratis o coach IA si tienes `ANTHROPIC_API_KEY`

## Activar el coach IA (opcional)

Agrega al `.env`:

```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
```

Con esta key el chat del dashboard y `npm run ask` usan Claude como coach financiero conversacional multi-turno. Sin la key, todo funciona igual con el motor de reglas.

Por defecto usa `claude-opus-4-8`. Cambia el modelo con:

```
FINTOC_AI_MODEL=claude-haiku-4-5-20251001
```

## Arquitectura

```
ask.js            CLI de preguntas (npm run ask)
index.js          Resumen mensual (npm start)
overview.js       Panorama completo (npm run overview)
server.js         Servidor web: widget + dashboard + API de chat
lib.js            Fetch Fintoc, cache, categorización, nudges, analytics
chatlib.js        Motor de reglas del chat (parse español, intents)
public/
  index.html      Widget de conexión de banco
  dashboard.html  Dashboard web con chat
.env.example      Plantilla de variables de entorno
movements.json    Cache local (gitignored — datos reales)
.env              Keys + tokens (gitignored)
```

## Cómo funciona la integración con Fintoc

```
1. POST /v1/link_intents  → widget_token
2. Widget Fintoc (frontend) → el usuario elige banco y se autentica
3. GET /v1/links/exchange?exchange_token=...  → link_token + cuentas
4. GET /v1/accounts/{id}/movements?link_token=...  → movimientos paginados
```

`amount` negativo = gasto, positivo = ingreso. Montos en CLP sin decimales.

## Seguridad

- `.env` y `movements.json` están en `.gitignore` — tus keys y datos nunca se suben a git.
- `sk_` (secret key) solo en backend; nunca expongas la secret key al frontend.
- Si una key se filtra, rótala en el panel de Fintoc inmediatamente.

## Licencia

MIT
