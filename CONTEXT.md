# Uber Eats Voice Recolección — Contexto completo del proyecto

> Usar este archivo para iniciar una nueva conversación con un agente de Claude.
> Contiene todo el contexto necesario para continuar el trabajo de forma eficiente.

---

## 1. ¿Qué hace este sistema?

Sistema de llamadas outbound automatizadas para el onboarding de merchants de Uber Eats en España.
El agente AI (Lucas) llama a merchants que están en fase de negociación para recoger los documentos
necesarios para completar su alta en la plataforma.

**Stack:**
- Backend: TypeScript + Express en Railway
- Orquestador de llamadas: HappyRobot
- Base de datos operativa: Google Sheets
- Modelo AI en llamada: gpt-4.1-fast (HappyRobot)

---

## 2. Arquitectura end-to-end (Dispatcher/Caller)

```
┌──────────────────────────────────────────────────────────────┐
│           BACKEND Express/TypeScript (Railway)               │
│                                                              │
│  node-cron dispara a las 11:30 / 18:30 / 19:00 (Madrid)     │
│  → POST al DISPATCHER webhook de HappyRobot                 │
│    { campaign_id, campaign_name, triggered_at,               │
│      dispatch_url, max_retries }                             │
└───────────────────────┬──────────────────────────────────────┘
                        │ dispara dispatcher
                        ▼
┌──────────────────────────────────────────────────────────────┐
│           HAPPYROBOT DISPATCHER (3 nodos, sin agents)        │
│                                                              │
│  1. Webhook trigger                                          │
│  2. Google Sheets: Get Rows (status = pending/in_progress)   │
│  3. Webhook POST → Backend /api/dispatch/:campaignId         │
│     Body: { rows: [...todas las filas elegibles...] }        │
└───────────────────────┬──────────────────────────────────────┘
                        │ envía rows al backend
                        ▼
┌──────────────────────────────────────────────────────────────┐
│           BACKEND (fan-out orchestrator)                      │
│                                                              │
│  POST /api/dispatch/:campaignId recibe rows[]                │
│  → Para cada merchant (con 3s delay):                        │
│    POST al CALLER webhook con TODOS los datos del merchant   │
└───────────────────────┬──────────────────────────────────────┘
                        │ 1 trigger por merchant
                        ▼
┌──────────────────────────────────────────────────────────────┐
│           HAPPYROBOT CALLER (1 merchant por ejecución)       │
│                                                              │
│  1. Webhook trigger (todos los datos como {{ trigger.X }})   │
│  2. Sheet Update: status = "in_progress"                     │
│  3. Condition Paths on {{ trigger.active_objective }}         │
│     ├── Docs   → Agent → AI Extract → Code → Sheet → CB     │
│     ├── Firma  → Agent → AI Extract → Code → Sheet → CB     │
│     ├── Tablet → Agent → AI Extract → Code → Sheet → CB     │
│     └── ROR    → Agent → AI Extract → Code → Sheet → CB     │
└───────────────────────┬──────────────────────────────────────┘
                        │ POST callback por merchant
                        ▼
┌──────────────────────────────────────────────────────────────┐
│           BACKEND (receptor de callbacks)                     │
│                                                              │
│  POST /api/callbacks/:campaignId                             │
│  Loguea en memoria (ring buffer 500 entradas)                │
│                                                              │
│  Endpoints de monitoreo:                                     │
│  GET /health          → estado + campañas activas            │
│  GET /api/stats       → totales por estado por campaña       │
│  GET /api/logs        → logs de callbacks recibidos          │
│  GET /api/dispatch-logs → logs de ciclos de dispatch         │
└──────────────────────────────────────────────────────────────┘
```

**Google Sheets** es la fuente de verdad. HappyRobot lee y escribe el Sheet — el backend nunca toca el Sheet directamente.

**¿Por qué Dispatcher/Caller?** El nodo Loop de HappyRobot tiene limitaciones de plataforma (`iteration_element` no se expande en el UI). Al mover el loop al backend, todos los datos llegan como `{{ trigger.X }}` — visibles y expandibles en el picker.

**URL producción:** `https://uber-eats-voice-recolection-production.up.railway.app`

---

## 3. Estructura del repositorio

```
uber-eats-voice-recolection/
├── src/
│   ├── index.ts                   # Entry point Express, rutas, arranque
│   ├── config/
│   │   ├── env.ts                 # Variables de entorno
│   │   └── campaigns.ts           # Registro de campañas y cron schedules
│   ├── services/
│   │   ├── scheduler.ts           # node-cron → dispara triggerDispatcher()
│   │   ├── happyrobot.ts          # triggerDispatcher() + triggerCaller() + triggerCampaign() (legacy)
│   │   ├── dispatch.ts            # Fan-out: recibe rows, triggerea Caller por merchant
│   │   └── callback-store.ts      # Ring buffer en memoria (logs + stats)
│   ├── routes/
│   │   ├── callbacks.ts           # POST /api/callbacks/:campaignId
│   │   └── dispatch.ts            # POST /api/dispatch/:campaignId
│   └── types/
│       └── index.ts               # Interfaces TypeScript
├── prompt-lucas-v2.md             # Prompt: UC Docs (documentación)
├── prompt-lucas-firma.md          # Prompt: UC Firma (contrato DocuSign)
├── prompt-lucas-tablet.md         # Prompt: UC Tablet (activación)
├── prompt-lucas-ror.md            # Prompt: UC ROR (ratio online)
├── docs/
│   ├── context_retry_logic.md     # Doc técnica del sistema de reintentos
│   ├── workflow-multi-usecase-guide.md           # Guía workflow con Loop (legacy, referencia)
│   └── workflow-dispatcher-caller-guide.md       # Guía Dispatcher/Caller (activa)
├── use-cases/                     # PDFs de referencia de Uber Eats
├── CONTEXT.md                     # Este archivo
├── package.json
├── tsconfig.json
└── railway.toml
```

---

## 4. Google Sheets — Esquema de columnas definitivo

| Columna | Tipo | Descripción |
|---|---|---|
| `merchant_uuid` | string | ID único del restaurante |
| `merchant_name` | string | Nombre del restaurante |
| `razon_social` | string | Razón social legal (usada para clasificar tipo de cliente) |
| `country` | string | País (ej. "ES") |
| `timezone` | string | Zona horaria IANA (ej. "Europe/Madrid") |
| `contact_name` | string | Nombre del contacto (decision maker) |
| `contact_phone` | string | Teléfono principal para llamadas |
| `alt_phone` | string | Teléfono alternativo (fallback) |
| `whatsapp_optin` | boolean | Si el merchant ha dado opt-in a WhatsApp |
| `whatsapp_number` | string | Número de WhatsApp del merchant |
| `ae_name` | string | Nombre del Account Executive asignado |
| `ae_phone` | string | Teléfono del AE |
| `ae_email` | string | Email del AE |
| `funnel_stage` | string | Etapa en el funnel (Negotiation / Closed Won) |
| `stage_entry_date` | date | Fecha de entrada en la etapa actual |
| `last_activity_date` | date | Última actividad registrada |
| `days_without_progress` | integer | Días sin avance (dispara lógica de urgencia) |
| `active_objective` | string | Objetivo activo: Docs / Firma / Tablet / ROR |
| `ulogistics_delivery_date` | date | Fecha de entrega de tablet (solo si obj = Tablet) |
| `status` | string | Estado del merchant en la campaña (ver valores abajo) |

### Valores de `status`
| Valor | Significado |
|---|---|
| `pending` | Pendiente de llamar — elegible para el loop |
| `in_progress` | Llamada en curso o intentos en marcha — elegible para el loop |
| `completed` | Documentación confirmada — excluido del loop |
| `max_retries_reached` | Se alcanzó el límite de intentos — excluido del loop |

**Nota:** el workflow filtra por `status IN (pending, in_progress)`. Solo estas filas se procesan.

### Columnas que escribe el workflow (write-back)
| Columna | Escrita por | Cuándo |
|---|---|---|
| `status` | Mark agent status / Mark agent's status | Antes y después de cada llamada |
| `last_call_date` | Mark agent status | Antes de llamar |
| `last_call_result` | Mark agent's status | Después de la llamada |
| `documentation_confirmed` | Mark agent's status | Después de la llamada |
| `call_summary` | Mark agent's status | Después de la llamada |
| `attempt_count` | Mark agent's status | Después de la llamada |

---

## 5. HappyRobot Workflow — Estado actual (v5)

**Nombre del workflow:** `uber-eats-doc-collection`
**Google Sheet conectada:** `Test Uber Eats - Onboarding Agent - Document and menu` → `Sheet1`

### Nodos en orden de ejecución

```
1. New Order Received (Webhook trigger)
   → Recibe POST del backend con: campaign_id, callback_url, max_retries

2. Check onboarding status (Google Sheets - Get rows)
   → Filtra: status = "pending" o "in_progress"
   → Expone todas las columnas como rows.0.*

3. Loop
   → Itera sobre cada fila elegible

   ├── 3a. Mark agent status (Google Sheets - Update)
   │   → Escribe: status="in_progress", last_call_date=ahora

   ├── 3b. Call Client Regarding Matter (AI Agent - Outbound)
   │   → Llama a: rows.0.contact_phone
   │   → Agente: Lucas (voz: Pablo HR, español España)
   │   → Prompt: ver sección 7 / archivo prompt-lucas-v2.md
   │   │
   │   ├── Prompt (nodo hijo del agente)
   │   ├── mark_documentation_received (Tool)
   │   │   → Outputs: documentation_confirmed, documents_mentioned
   │   └── Check Document Status (Code)
   │       → Valida si documentación confirmada

   ├── 3c. Analyze Call Transcript (AI Extract - gpt-4.1)
   │   → Extrae: call_connected, documentation_confirmed,
   │             call_outcome, call_summary, merchant_sentiment

   ├── 3d. Process Doc Confirmation (Python Code)
   │   → Input: documentation_confirmed, call_summary, call_outcome,
   │            merchant_sentiment, attempt_count, max_retries
   │   → Lógica de status:
   │     if doc_confirmed → "completed"
   │     elif attempt_count >= max_retries → "max_retries_reached"
   │     else → "in_progress"
   │   → Output: new_status, attempt_count, call_result,
   │             documentation_confirmed, call_summary, merchant_sentiment

   └── 3e. Mark agent's status (Google Sheets - Update)
       → Escribe: status, last_call_result, documentation_confirmed,
                  call_summary, attempt_count

4. Loop End

5. Callback to backend (Webhook POST)
   → URL: https://uber-eats-voice-recolection-production.up.railway.app/api/callbacks/uber-eats-doc-collection
   → Payload: phone_number, call_status, documentation_confirmed,
              call_summary, merchant_uuid, funnel_stage, active_objective
```

### Variables del workflow disponibles en el Prompt

Todas se referencian como `rows.0.<columna>`:

```
rows.0.merchant_uuid          rows.0.merchant_name
rows.0.contact_name           rows.0.contact_phone
rows.0.alt_phone              rows.0.razon_social
rows.0.country                rows.0.timezone
rows.0.whatsapp_optin         rows.0.whatsapp_number
rows.0.ae_name                rows.0.ae_phone
rows.0.ae_email               rows.0.funnel_stage
rows.0.stage_entry_date       rows.0.last_activity_date
rows.0.days_without_progress  rows.0.active_objective
rows.0.pending_documents      rows.0.attempt_count
```

---

## 6. Backend — Detalles técnicos

### Variables de entorno (Railway)
```
PORT=3000
BASE_URL=https://uber-eats-voice-recolection-production.up.railway.app
CALLBACK_SECRET=<secret>
CAMPAIGN_UBER_EATS_DOCS_WEBHOOK_URL=<happyrobot webhook url>
CAMPAIGN_UBER_EATS_DOCS_API_KEY=<api key>
```

### Campaña activa
```typescript
{
  id: 'uber-eats-doc-collection',
  name: 'Uber Eats - Recoleccion de documentacion',
  cronSchedules: ['30 11 * * *', '30 18 * * *', '0 19 * * *'],
  timezone: 'Europe/Madrid',
  maxRetries: 10,
  enabled: true,
}
```

### Tipos TypeScript clave (`src/types/index.ts`)

**CallbackPayload** — lo que HappyRobot envía al backend:
```typescript
interface CallbackPayload {
  campaign_id: string;
  phone_number: string;
  call_status: 'completed' | 'missed' | 'voicemail' | 'busy' | 'failed' | 'canceled';
  documentation_confirmed?: boolean;
  call_summary?: string;
  merchant_sentiment?: string;
  attempt_number?: number;
  merchant_uuid?: string;
  funnel_stage?: string;
  active_objective?: string;
}
```

**CallbackLog** — lo que se guarda en memoria:
```typescript
interface CallbackLog {
  campaign_id: string;
  phone_number: string;
  call_status: CallResult;
  documentation_confirmed: boolean;
  call_summary: string;
  received_at: string;
  merchant_uuid: string;
  funnel_stage: string;
  active_objective: string;
}
```

### API endpoints
```
GET  /health                              → estado + campañas activas
GET  /api/stats                           → totales por campaña y estado
GET  /api/logs?campaign_id=...&limit=...  → logs de callbacks recibidos
GET  /api/dispatch-logs                   → logs de ciclos de dispatch
POST /api/dispatch/:campaignId            → receptor de rows del Dispatcher
POST /api/callbacks/:campaignId           → receptor de callbacks del Caller
POST /api/trigger/:campaignId             → disparo manual Dispatcher/Caller (nuevo)
POST /api/trigger-legacy/:campaignId      → disparo manual workflow con Loop (legacy)
```

---

## 7. Prompt del agente Lucas (v2)

**Archivo:** `prompt-lucas-v2.md`

### Resumen del comportamiento del agente

- **Identidad:** Lucas, Account Executive de Uber Eats
- **Objetivo:** recoger documentación pendiente para completar el alta
- **Modelo:** gpt-4.1-fast

### Comportamientos dinámicos basados en datos del Sheet

| Campo | Comportamiento |
|---|---|
| `whatsapp_optin` | Si true → ofrece WhatsApp con el número del merchant. Si false → solo correo |
| `days_without_progress` | 1 día → urgencia estándar. 2+ días → urgencia refuerzo |
| `active_objective` | Si no es "Docs" → activa módulo de validación de objetivo |
| `razon_social` | Clasificación automática: SL / Autónomo / Otro tipo de sociedad |
| `ae_name` | Usado en módulo de escalación si merchant pide hablar con su AE |

### Documentos por tipo de cliente (fuente: `Documentos necesarios para alta.pdf`)

**SL:**
- Documento de identidad de socios con >25% (anverso/reverso, color)
- CIF Definitivo
- Documentación bancaria (logo banco + IBAN + titular)
- Correo electrónico (si no está registrado)
- Menú con horario del restaurante

**Autónomo:**
- Documento de identidad (anverso/reverso, color)
- Modelo 036 o 037 (Agencia Tributaria, NO Seguridad Social)
- Documentación bancaria (logo banco + IBAN + titular)
- Correo electrónico (si no está registrado)
- Menú con horario del restaurante

**Otro tipo (SLU, CB, ESPJ, OEM, etc.):**
- Documento de identidad de socios (anverso/reverso, color)
- CIF Definitivo + Acta de constitución (ambos obligatorios)
- Documentación bancaria (logo banco + IBAN + titular)
- Correo electrónico (si no está registrado)
- Menú con horario del restaurante

**Requisitos de calidad documental** (solo si el merchant pregunta):
- Foto a color, 4 esquinas visibles, sin brillo ni sombras, sin CamScanner, vigente

---

## 8. Multi-Use-Case: Arquitectura y cambios

### Casos de uso (4 en total)

| UC | Objetivo | Fase |
|---|---|---|
| **Docs** | Recoger documentación pendiente | PRE-CW |
| **Firma** | Firmar contrato DocuSign | PRE-CW |
| **Tablet** | Activar tablet paso a paso | POST-CW |
| **ROR** | Mejorar ratio conexión online | POST-CW |

### Arquitectura activa: Dispatcher/Caller

**El backend hace el loop.** HappyRobot solo lee/escribe el Sheet y hace llamadas.

```
Backend cron → Dispatcher (lee Sheet, envía rows) → Backend fan-out
→ por cada merchant: Caller workflow (1 merchant por ejecución)
  → Condition Paths on {{ trigger.active_objective }}
    → Agent → AI Extract → Code → Sheet Update → Callback
```

Ver `docs/workflow-dispatcher-caller-guide.md` para configuración completa.

### Arquitectura legacy: Workflow con Loop (referencia)

Si el Loop de HappyRobot se arregla en el futuro, se puede volver a usar:

```
Webhook → Get Rows → Loop → Condition Paths → Agent branches → Loop End
```

Ver `docs/workflow-multi-usecase-guide.md` para esta configuración.

### Prompts (archivos listos para copiar a HappyRobot)

| Archivo | UC |
|---|---|
| `prompt-lucas-v2.md` | Docs (existente) |
| `prompt-lucas-firma.md` | Firma |
| `prompt-lucas-tablet.md` | Tablet |
| `prompt-lucas-ror.md` | ROR |

---

## 9. Decisiones de diseño importantes

- **El backend NO es la fuente de verdad.** Google Sheets lo es. El backend es scheduler + monitor.
- **La lógica de reintentos vive en HappyRobot + Google Sheets**, no en el backend.
- **1 campaña, 1 workflow.** Una sola campaña (`uber-eats-onboarding`) dispara el workflow. El routing se hace por `active_objective` del Sheet, no desde el backend.
- **Condition Paths, no mega-prompt.** Cada UC tiene su propio Voice Agent con prompt y tools dedicados. Convergen en post-procesamiento unificado.
- **Status `escalated` es nuevo.** Cuando un merchant necesita intervención del AE, sale del loop y no se le vuelve a llamar hasta que alguien cambie su status manualmente.
- **ROR no tiene stop condition automática.** El caso queda `in_progress` y se llama periódicamente. Solo `max_retries_reached` o intervención manual lo para.
- **Credenciales de tablet vía tool, no en prompt.** El agente usa `provide_credentials` para obtener email/password del Sheet en tiempo real, evitando exponer datos sensibles en el prompt.
- **`alt_phone` no está en el prompt** — lo gestiona el nodo de llamada del workflow directamente como fallback.
- **`ae_phone` y `ae_email`** están en el contexto del agente pero **nunca se verbalizan directamente** en la llamada por privacidad. Solo se referencia el nombre del AE.
- **El workflow filtra por `status`** — carga todos los merchants con `pending` o `in_progress`. El Condition Paths dentro del loop enruta cada uno según su `active_objective`.

---

## 10. Documentación de referencia del proyecto

### `docs/context_retry_logic.md`
Documento técnico reutilizable que explica en detalle cómo funciona el sistema completo.
**Leer obligatoriamente** para entender:
- Arquitectura general del sistema scheduler + HappyRobot + Google Sheets
- Detalle nodo a nodo del workflow (con código Python de cada Custom Code node)
- Lógica de reintentos completa (cómo se calcula `new_status`, `attempt_count`, etc.)
- Limitaciones del sandbox Python de HappyRobot (qué funciones NO están disponibles)
- Cómo reutilizar el sistema para un nuevo caso de uso (paso a paso)
- Template de variables de entorno

### `Documentos necesarios para alta.pdf`
Fuente oficial de Uber Eats con los documentos requeridos por tipo de cliente (SL, Autónomo, otros).
Usada para validar y actualizar el prompt del agente Lucas.

### `prompt-lucas-v2.md`
Prompt del agente Lucas para el UC de documentación. Listo para copiar a HappyRobot.

### `prompt-lucas-firma.md`
Prompt del agente Lucas para el UC de firma de contrato. Incluye guía paso a paso de DocuSign.

### `prompt-lucas-tablet.md`
Prompt del agente Lucas para el UC de activación de tablet. Incluye troubleshooting y gestión de credenciales vía tool.

### `prompt-lucas-ror.md`
Prompt del agente Lucas para el UC de mejora de ROR. Tono motivacional, creación de hábito.

### `docs/workflow-multi-usecase-guide.md`
Guía completa paso a paso para configurar el workflow multi-UC en HappyRobot. Incluye configuración de cada nodo, tools, AI Extract, Python, Sheet columns y checklist.

### `uber-eats-document-collection-version-5.json`
Export del estado actual del workflow en HappyRobot (v5).
Útil para auditar la configuración exacta de cada nodo, variables mapeadas y lógica implementada.

---

## 11. Estado actual del sistema

- Backend: **actualizado** con arquitectura Dispatcher/Caller + legacy endpoints — pendiente de deploy
- Workflows HappyRobot: **pendiente de crear** Dispatcher (3 nodos) y Caller (sin loop)
- Workflow legacy (v5/v6 con Loop): **mantenerlo** como referencia, por si el Loop se arregla
- Google Sheets: **pendiente de añadir columnas** de los nuevos UCs
- Prompts: **4 prompts listos** en archivos .md
- Guía Dispatcher/Caller: `docs/workflow-dispatcher-caller-guide.md`
- Guía legacy (Loop): `docs/workflow-multi-usecase-guide.md`

### Variables de entorno (Railway) — Actualizadas

```
PORT=3000
BASE_URL=https://uber-eats-voice-recolection-production.up.railway.app
CALLBACK_SECRET=<secret>
DISPATCH_SECRET=<secret para auth Dispatcher→Backend>

# Legacy (workflow con Loop)
CAMPAIGN_UBER_EATS_WEBHOOK_URL=<happyrobot webhook url del workflow con Loop>

# Dispatcher/Caller (nuevo)
CAMPAIGN_UBER_EATS_DISPATCHER_WEBHOOK_URL=<webhook del Dispatcher workflow>
CAMPAIGN_UBER_EATS_CALLER_WEBHOOK_URL=<webhook del Caller workflow>

# Compartido
CAMPAIGN_UBER_EATS_API_KEY=<api key>
```

**Nota:** El cron usa Dispatcher/Caller por defecto. El endpoint `/api/trigger-legacy/:campaignId` usa el workflow con Loop.
