# Guía de configuración: Arquitectura Dispatcher/Caller en HappyRobot

> Esta guía detalla paso a paso cómo configurar los dos workflows nuevos
> (Dispatcher y Caller) que reemplazan el workflow con Loop.
>
> El workflow antiguo con Loop se mantiene deshabilitado como referencia.
> Su guía está en `docs/workflow-multi-usecase-guide.md`.

---

## 1. Visión general

Se eliminó el Loop de HappyRobot porque `iteration_element` no se puede expandir en el UI. En su lugar, el backend hace el loop.

### Flujo completo

```
Backend (cron) ──POST──► Dispatcher workflow (HappyRobot)
                              │
                              ├── Google Sheets: Get Rows
                              │
                              └── Webhook POST ──► Backend /api/dispatch/:campaignId
                                                      │
                                                      │  (para cada merchant, con 3s delay)
                                                      ▼
                                                  Caller workflow (HappyRobot)
                                                      │
                                                      ├── Sheet Update (in_progress)
                                                      ├── Condition Paths (active_objective)
                                                      │   ├── Docs   → Agent → Extract → Code → Sheet Update → Callback
                                                      │   ├── Firma  → Agent → Extract → Code → Sheet Update → Callback
                                                      │   ├── Tablet → Agent → Extract → Code → Sheet Update → Callback
                                                      │   └── ROR    → Agent → Extract → Code → Sheet Update → Callback
                                                      └── (cada rama es autocontenida)
```

### Diferencia clave vs. workflow antiguo

| Antes (Loop) | Ahora (Dispatcher/Caller) |
|---|---|
| `{{ iteration_element.contact_phone }}` | `{{ trigger.contact_phone }}` |
| Variables opacas, no expandibles | Variables de trigger, visibles en picker |
| 1 workflow run = N merchants | 1 workflow run = 1 merchant |
| Debugging difícil (loop iterations) | Debugging trivial (1 run = 1 llamada) |

---

## 2. Workflow: Dispatcher (NUEVO — 3 nodos)

Este workflow solo lee el Sheet y envía los datos al backend. No tiene agents, AI, ni llamadas.

### Nodo 1: Webhook Trigger

Payload que recibe del backend:

```json
{
  "campaign_id": "uber-eats-onboarding",
  "campaign_name": "Uber Eats - Onboarding (all use cases)",
  "triggered_at": "2026-03-08T11:30:00.000Z",
  "dispatch_url": "https://uber-eats-voice-recolection-production.up.railway.app/api/dispatch/uber-eats-onboarding",
  "max_retries": 10
}
```

### Nodo 2: Google Sheets — Get Rows

| Campo | Valor |
|---|---|
| Spreadsheet | Test Uber Eats - Onboarding Agent - Document and menu |
| Worksheet | Sheet1 |

**Filtros:**

| Campo | Operador | Valor |
|---|---|---|
| `status` | equals | `pending` |
| `status` | equals | `in_progress` |

**Lógica:** status = pending OR status = in_progress

### Nodo 3: Webhook POST (al backend)

| Campo | Valor |
|---|---|
| URL | `{{ trigger.dispatch_url }}` |
| Method | POST |

**Headers:**

```
Content-Type: application/json
X-Dispatch-Secret: <valor del secreto configurado en Railway>
```

**Body (Raw JSON):**

```json
{
  "rows": {{ get_rows.rows }}
}
```

> `{{ get_rows.rows }}` pasa el array completo de filas. Usa el @picker para
> seleccionar "Check onboarding status → Rows" (el array, no filas individuales).

---

## 3. Workflow: Caller (NUEVO — sin loop)

Este workflow recibe TODOS los datos de UN merchant en el webhook trigger. No necesita leer Google Sheets para obtener datos — solo para actualizar status.

### Nodo 1: Webhook Trigger

Payload que recibe del backend (un merchant por trigger):

```json
{
  "campaign_id": "uber-eats-onboarding",
  "campaign_name": "Uber Eats - Onboarding (all use cases)",
  "triggered_at": "2026-03-08T11:30:03.000Z",
  "callback_url": "https://uber-eats-voice-recolection-production.up.railway.app/api/callbacks/uber-eats-onboarding",
  "max_retries": 10,
  "merchant_uuid": "uuid-001",
  "merchant_name": "Restaurante El Buen Sabor",
  "contact_name": "María García",
  "contact_phone": "34669895417",
  "country": "ES",
  "timezone": "Europe/Madrid",
  "ae_name": "Alex",
  "ae_phone": "661661661",
  "ae_email": "alex@uber.com",
  "active_objective": "Docs",
  "status": "pending",
  "attempt_count": "0",
  "current_ror": "60",
  "tablet_credentials_email": "maria@restaurante.com",
  "tablet_credentials_password": "UE2024abc",
  "pending_documents": "DNI, menú"
}
```

**Todos los campos son accesibles como `{{ trigger.X }}`** — visibles y expandibles en el @picker.

### Nodo 2: Google Sheets — Update Row (pre-call)

| Campo | Valor |
|---|---|
| Spreadsheet | Test Uber Eats - Onboarding Agent - Document and menu |
| Worksheet | Sheet1 |
| Update Mode | Single Update |
| Column to Match on | `merchant_uuid` |
| Value to Match on | `{{ trigger.merchant_uuid }}` |
| Update Occurrence | First Occurrence |

**Columnas a escribir:**

| Columna | Valor |
|---|---|
| `status` | `in_progress` |
| `last_call_date` | Today (usar variable de sistema) |

### Nodo 3: Condition Paths

| Campo | Valor |
|---|---|
| Variable a evaluar | `{{ trigger.active_objective }}` |
| Política | Use first evaluated |

**Paths:**

| Path | Condición | Destino |
|---|---|---|
| Path 1 | `active_objective` equals `Docs` | Agent Lucas-Docs |
| Path 2 | `active_objective` equals `Firma` | Agent Lucas-Firma |
| Path 3 | `active_objective` equals `Tablet` | Agent Lucas-Tablet |
| Path 4 | `active_objective` equals `ROR` | Agent Lucas-ROR |

---

## 4. Configuración de cada Voice Agent

### Configuración base (igual en los 4)

| Campo | Valor |
|---|---|
| Voice | Pablo HR (es-ES) |
| Language | Spanish |
| Accent | Spanish |
| Model | gpt-4.1-fast |
| Max call duration | 600s |
| Voicemail handling | hangup |
| To | `{{ trigger.contact_phone }}` |
| From (prod) | +34911671042 |
| From (dev) | +34911675195 |

> **Nota:** Antes era `{{ iteration_element.contact_phone }}`. Ahora es `{{ trigger.contact_phone }}`.

### 4.1 Lucas-Docs (Path 1)

**Prompt:** Copiar contenido completo de `prompt-lucas-v2.md`

En el prompt, las variables template se mapean así:

| Variable del prompt | Referenciar con |
|---|---|
| Nombre del restaurante | `{{ trigger.merchant_name }}` |
| Contacto | `{{ trigger.contact_name }}` |
| País / Zona horaria | `{{ trigger.country }}` / `{{ trigger.timezone }}` |
| Nombre AE | `{{ trigger.ae_name }}` |
| Teléfono AE | `{{ trigger.ae_phone }}` |
| Email AE | `{{ trigger.ae_email }}` |
| Documentos pendientes | `{{ trigger.pending_documents }}` |

**Tool: `mark_documentation_received`** — sin cambios respecto al workflow original.

### 4.2 Lucas-Firma (Path 2)

**Prompt:** Copiar contenido completo de `prompt-lucas-firma.md`

Mismo mapeo de variables que Docs (usar `{{ trigger.X }}`).

**Tool: `mark_contract_status`**

| Campo | Valor |
|---|---|
| Nombre | mark_contract_status |
| Descripción | Usar cuando el merchant confirma haber firmado, se compromete a firmar, o necesita que le reenvíen el contrato. NO usar si solo dice "ya lo miraré". |
| AI message | "Confirma al merchant que tomas nota de su respuesta sobre el contrato." |

Parámetros:

| Nombre | Tipo | Required | Descripción |
|---|---|---|---|
| `contract_signed` | boolean | sí | true si el merchant confirmó haber firmado |
| `signing_timeline` | string | no | Cuándo dice que va a firmar: "ahora", "hoy", "mañana", etc. |
| `needs_resend` | boolean | sí | true si el merchant no encontró el email y necesita reenvío |

**Code hijo (Check Contract Status):**

```python
confirmed = str(input_data.get("contract_signed", "false")).lower() == "true"
needs_resend = str(input_data.get("needs_resend", "false")).lower() == "true"
timeline = str(input_data.get("signing_timeline", ""))

output = {
    "contract_signed": "TRUE" if confirmed else "FALSE",
    "needs_resend": "TRUE" if needs_resend else "FALSE",
    "signing_timeline": timeline
}
```

### 4.3 Lucas-Tablet (Path 3)

**Prompt:** Copiar contenido completo de `prompt-lucas-tablet.md`

Mismo mapeo de variables que Docs (usar `{{ trigger.X }}`).

**Tool 1: `mark_tablet_activated`**

| Campo | Valor |
|---|---|
| Nombre | mark_tablet_activated |
| Descripción | Usar cuando se completa un paso de activación o la tablet queda operativa con estado ABIERTO. |
| AI message | "Confirma al merchant que registras el progreso de la activación." |

Parámetros:

| Nombre | Tipo | Required | Descripción |
|---|---|---|---|
| `tablet_activated` | boolean | sí | true si la tablet quedó en estado "Abierto" |
| `step_reached` | string | sí | Último paso completado: "power", "wifi", "login", "permissions", "open" |

**Code hijo (Check Tablet Status):**

```python
activated = str(input_data.get("tablet_activated", "false")).lower() == "true"
step = str(input_data.get("step_reached", ""))

output = {
    "tablet_activated": "TRUE" if activated else "FALSE",
    "step_reached": step
}
```

**Tool 2: `provide_credentials`**

| Campo | Valor |
|---|---|
| Nombre | provide_credentials |
| Descripción | Usar cuando el merchant necesita sus credenciales de acceso a la app Uber Eats Orders. Llamar a este tool ANTES de proporcionar cualquier credencial. |
| AI message | "Un momento, obtengo las credenciales de acceso." |

Parámetros del tool: **ninguno**

**Code hijo (Get Credentials):**

Los inputs se mapean desde el **trigger** (ya no desde iteration_element):

| Input del code | Mapeado a |
|---|---|
| `email` | `{{ trigger.tablet_credentials_email }}` |
| `password` | `{{ trigger.tablet_credentials_password }}` |

```python
email = str(input_data.get("email", ""))
password = str(input_data.get("password", ""))

output = {
    "email": email,
    "password": password,
    "has_credentials": "TRUE" if email and password else "FALSE"
}
```

### 4.4 Lucas-ROR (Path 4)

**Prompt:** Copiar contenido completo de `prompt-lucas-ror.md`

Mismo mapeo de variables que Docs (usar `{{ trigger.X }}`). Adicionalmente:

| Variable del prompt | Referenciar con |
|---|---|
| ROR actual | `{{ trigger.current_ror }}` |

**Tool: `mark_ror_commitment`**

| Campo | Valor |
|---|---|
| Nombre | mark_ror_commitment |
| Descripción | Usar cuando el merchant se compromete a mantener la tablet activa o se identifica la causa del bajo ROR. NO usar si no hubo conversación real. |
| AI message | "Confirma al merchant que tomas nota de su compromiso." |

Parámetros:

| Nombre | Tipo | Required | Descripción |
|---|---|---|---|
| `merchant_committed` | boolean | sí | true si el merchant se compromete a mejorar |
| `issue_category` | string | sí | Causa identificada: "tablet_off", "app_background", "wifi", "technical", "disinterest", "unaware" |

**Code hijo (Check ROR Status):**

```python
committed = str(input_data.get("merchant_committed", "false")).lower() == "true"
category = str(input_data.get("issue_category", ""))

output = {
    "merchant_committed": "TRUE" if committed else "FALSE",
    "issue_category": category
}
```

---

## 5. AI Extract por rama

Cada rama tiene su propio nodo AI Extract después del Voice Agent. Las descripciones son idénticas al workflow antiguo (son independientes de la arquitectura).

### 5.1 AI Extract: Docs

**Modelo:** gpt-4.1
**Input:** Transcript de la llamada
**Prompt:**

```
Analiza la transcripción de una llamada outbound de Uber Eats cuyo objetivo era conseguir que el merchant envíe la documentación pendiente para completar su alta en la plataforma.

El agente (Lucas) llama para hacer push de que el merchant envíe documentos de identidad, documentación fiscal, bancaria, y/o el menú con horario del restaurante. No procesa documentos él mismo — solo pide que los envíen al AE por correo o WhatsApp.

Extrae los siguientes datos basándote EXCLUSIVAMENTE en lo que se dijo explícitamente en la conversación. No asumas ni inferiras datos que no estén en el transcript.
```

**Parámetros:**

| Nombre | Tipo | Required | Descripción |
|---|---|---|---|
| `call_connected` | boolean | sí | true SOLO si hubo una conversación real con una persona que respondió y habló. false si saltó buzón de voz, no contestaron, línea ocupada, error de conexión, o solo se escuchó un tono. Ejemplo true: "Sí, soy yo" / "Dígame" / "Hola". Ejemplo false: "Deje su mensaje después de la señal" / silencio total / tonos sin respuesta. |
| `documentation_confirmed` | boolean | sí | true SOLO si el merchant confirmó explícitamente que va a enviar la documentación pendiente o que ya la envió. No marcar true si solo dijo "lo miraré" o "ya veré". Ejemplo true: "Sí, se lo envío hoy" / "Ya lo mandé ayer por correo". Ejemplo false: "Luego lo miro" / "Ya veré" / "No tengo tiempo ahora". |
| `call_outcome` | string | sí | EXACTAMENTE uno de: "connected_committed", "connected_refused", "connected_more_time", "connected_already_sent", "connected_other", "voicemail", "no_answer", "error". |
| `call_summary` | string | sí | Resumen objetivo en 1-2 frases en español. |
| `merchant_sentiment` | string | sí | EXACTAMENTE uno de: "positive", "neutral", "negative". |
| `needs_escalation` | boolean | sí | true si requiere intervención del AE. |
| `escalation_reason` | string | no | Motivo específico de la escalación. |

### 5.2 AI Extract: Firma

**Modelo:** gpt-4.1
**Input:** Transcript de la llamada
**Prompt:**

```
Analiza la transcripción de una llamada outbound de Uber Eats cuyo objetivo era conseguir que el merchant firme un acuerdo comercial pendiente en DocuSign.

El agente (Lucas) llama para recordar al merchant que tiene un contrato sin firmar en su correo electrónico. No reenvía el contrato ni explica cláusulas — solo hace push para que lo firme.

Extrae los siguientes datos basándote EXCLUSIVAMENTE en lo que se dijo explícitamente en la conversación. No asumas ni inferiras datos que no estén en el transcript.
```

**Parámetros:**

| Nombre | Tipo | Required | Descripción |
|---|---|---|---|
| `call_connected` | boolean | sí | true SOLO si hubo conversación real. |
| `contract_found` | boolean | sí | true si el merchant confirmó que ha visto o localizado el email de DocuSign. |
| `contract_signed` | boolean | sí | true SOLO si el merchant confirmó que completó la firma. |
| `signing_commitment` | string | no | Cuándo se comprometió a firmar. |
| `needs_resend` | boolean | sí | true si buscó el email (inbox + spam) y no lo encontró. |
| `needs_escalation` | boolean | sí | true si requiere intervención del AE. |
| `escalation_reason` | string | no | Motivo específico de la escalación. |
| `call_outcome` | string | sí | EXACTAMENTE uno de: "signed", "will_sign_today", "will_sign_later", "needs_resend", "has_doubts", "refused", "voicemail", "no_answer", "error". |
| `call_summary` | string | sí | Resumen en 1-2 frases en español. |
| `merchant_sentiment` | string | sí | EXACTAMENTE uno de: "positive", "neutral", "negative". |

### 5.3 AI Extract: Tablet

**Modelo:** gpt-4.1
**Input:** Transcript de la llamada
**Prompt:**

```
Analiza la transcripción de una llamada outbound de Uber Eats cuyo objetivo era guiar al merchant paso a paso en la activación de su tablet para recibir pedidos.

El agente (Lucas) llama para ayudar al merchant a: enchufar la tablet, conectarla al WiFi, abrir la app Uber Eats Orders, iniciar sesión con sus credenciales, y verificar que aparece como "Abierto" (online).

Extrae los siguientes datos basándote EXCLUSIVAMENTE en lo que se dijo explícitamente en la conversación. No asumas ni inferiras datos que no estén en el transcript.
```

**Parámetros:**

| Nombre | Tipo | Required | Descripción |
|---|---|---|---|
| `call_connected` | boolean | sí | true SOLO si hubo conversación real. |
| `tablet_activated` | boolean | sí | true SOLO si la tablet muestra "Abierto" en verde al final de la llamada. |
| `activation_step_reached` | string | sí | EXACTAMENTE uno de: "power", "wifi", "login", "permissions", "open", "none". |
| `technical_issue_type` | string | no | EXACTAMENTE uno de: "wifi", "credentials", "power", "app_not_found", "none". |
| `needs_escalation` | boolean | sí | true si problema técnico persiste tras 2 intentos o merchant pide hablar con alguien. |
| `escalation_reason` | string | no | Motivo específico de la escalación. |
| `call_outcome` | string | sí | EXACTAMENTE uno de: "fully_activated", "partial_progress", "no_tablet", "needs_credentials", "technical_issue", "voicemail", "no_answer", "error". |
| `call_summary` | string | sí | Resumen en 1-2 frases en español. |
| `merchant_sentiment` | string | sí | EXACTAMENTE uno de: "positive", "neutral", "negative". |

### 5.4 AI Extract: ROR

**Modelo:** gpt-4.1
**Input:** Transcript de la llamada
**Prompt:**

```
Analiza la transcripción de una llamada outbound de Uber Eats cuyo objetivo era mejorar el ratio de conexión online (ROR) del merchant. El restaurante no está apareciendo como disponible en la app durante todo su horario de apertura, lo que significa que pierde pedidos.

El agente (Lucas) llama para identificar por qué el restaurante no está conectado, resolver problemas sencillos, y construir el hábito de verificar la tablet cada mañana.

Extrae los siguientes datos basándote EXCLUSIVAMENTE en lo que se dijo explícitamente en la conversación. No asumas ni inferiras datos que no estén en el transcript.
```

**Parámetros:**

| Nombre | Tipo | Required | Descripción |
|---|---|---|---|
| `call_connected` | boolean | sí | true SOLO si hubo conversación real. |
| `ror_issue_identified` | boolean | sí | true si se identificó la causa del bajo ROR. |
| `issue_category` | string | sí | EXACTAMENTE uno de: "tablet_off", "app_background", "wifi", "technical", "disinterest", "unaware", "unknown". |
| `merchant_committed` | boolean | sí | true si el merchant se comprometió verbalmente a mejorar. |
| `needs_escalation` | boolean | sí | true si problema técnico persistente, frustración alta, o quiere hablar con alguien. |
| `escalation_reason` | string | no | Motivo específico de la escalación. |
| `call_outcome` | string | sí | EXACTAMENTE uno de: "issue_resolved", "committed", "disinterested", "needs_help", "voicemail", "no_answer", "error". |
| `call_summary` | string | sí | Resumen en 1-2 frases en español. |
| `merchant_sentiment` | string | sí | EXACTAMENTE uno de: "positive", "neutral", "negative". |

---

## 6. Post-Call Processing por rama (Custom Code)

Cada rama tiene su propio Custom Code que procesa los resultados de SU AI Extract.

### 6.1 Inputs comunes (iguales en los 4 nodos)

| Input name | Source |
|---|---|
| `call_connected` | AI Extract de la misma rama |
| `call_outcome` | AI Extract de la misma rama |
| `call_summary` | AI Extract de la misma rama |
| `merchant_sentiment` | AI Extract de la misma rama |
| `needs_escalation` | AI Extract de la misma rama |
| `escalation_reason` | AI Extract de la misma rama |
| `attempt_count` | `{{ trigger.attempt_count }}` |
| `max_retries` | `{{ trigger.max_retries }}` |

> **Cambio vs workflow antiguo:** `attempt_count` ahora viene de `{{ trigger.attempt_count }}` en vez de `{{ iteration_element.attempt_count }}`.

### 6.2 Process Docs

**Input adicional:** `documentation_confirmed` ← AI Extract Docs

```python
call_connected = str(input_data.get("call_connected", "false")).lower() == "true"
needs_escalation = str(input_data.get("needs_escalation", "false")).lower() == "true"
objective_completed = str(input_data.get("documentation_confirmed", "false")).lower() == "true"

try:
    attempt_count = int(input_data.get("attempt_count", 0))
except:
    attempt_count = 0
try:
    max_retries = int(input_data.get("max_retries", 10))
except:
    max_retries = 10

if not call_connected:
    attempt_count = attempt_count + 1

if objective_completed:
    new_status = "completed"
elif needs_escalation:
    new_status = "escalated"
elif not call_connected and attempt_count >= max_retries:
    new_status = "max_retries_reached"
else:
    new_status = "in_progress"

output = {
    "new_status": new_status,
    "attempt_count": str(attempt_count),
    "call_connected": "TRUE" if call_connected else "FALSE",
    "call_result": str(input_data.get("call_outcome", "unknown")),
    "objective_completed": "TRUE" if objective_completed else "FALSE",
    "call_summary": str(input_data.get("call_summary", "Sin conversacion")),
    "merchant_sentiment": str(input_data.get("merchant_sentiment", "neutral")),
    "needs_escalation": "TRUE" if needs_escalation else "FALSE",
    "escalation_reason": str(input_data.get("escalation_reason", "")),
}
```

### 6.3 Process Firma

**Input adicional:** `contract_signed` ← AI Extract Firma

Mismo código que Docs pero con:
```python
objective_completed = str(input_data.get("contract_signed", "false")).lower() == "true"
```

### 6.4 Process Tablet

**Input adicional:** `tablet_activated` ← AI Extract Tablet

Mismo código que Docs pero con:
```python
objective_completed = str(input_data.get("tablet_activated", "false")).lower() == "true"
```

### 6.5 Process ROR

**Sin input adicional de objetivo** — ROR nunca se completa automáticamente.

```python
call_connected = str(input_data.get("call_connected", "false")).lower() == "true"
needs_escalation = str(input_data.get("needs_escalation", "false")).lower() == "true"
objective_completed = False

try:
    attempt_count = int(input_data.get("attempt_count", 0))
except:
    attempt_count = 0
try:
    max_retries = int(input_data.get("max_retries", 10))
except:
    max_retries = 10

if not call_connected:
    attempt_count = attempt_count + 1

if needs_escalation:
    new_status = "escalated"
elif not call_connected and attempt_count >= max_retries:
    new_status = "max_retries_reached"
else:
    new_status = "in_progress"

output = {
    "new_status": new_status,
    "attempt_count": str(attempt_count),
    "call_connected": "TRUE" if call_connected else "FALSE",
    "call_result": str(input_data.get("call_outcome", "unknown")),
    "objective_completed": "FALSE",
    "call_summary": str(input_data.get("call_summary", "Sin conversacion")),
    "merchant_sentiment": str(input_data.get("merchant_sentiment", "neutral")),
    "needs_escalation": "TRUE" if needs_escalation else "FALSE",
    "escalation_reason": str(input_data.get("escalation_reason", "")),
}
```

---

## 7. Sheet Update por rama (post-call)

Cada rama tiene su propio Google Sheets Update después del Python.

### Match column

| Campo | Valor |
|---|---|
| Match column | `merchant_uuid` |
| Match value | `{{ trigger.merchant_uuid }}` |

> **Cambio vs workflow antiguo:** Usa `{{ trigger.merchant_uuid }}` en vez de `{{ iteration_element.merchant_uuid }}`.

### Columnas a escribir (idénticas en las 4 ramas)

| Columna | Valor |
|---|---|
| `status` | `{{ process_[uc].new_status }}` |
| `attempt_count` | `{{ process_[uc].attempt_count }}` |

*(Donde `process_[uc]` es el nombre del nodo Python de cada rama)*

**Solo 2 columnas de escritura.** Todo lo demás va al backend vía callback.

---

## 8. Callback por rama

Cada rama tiene su propio Webhook POST al backend.

### URL

```
{{ trigger.callback_url }}
```

### Headers

```
Content-Type: application/json
X-Callback-Secret: <valor del secreto>
```

### Body

```json
{
  "campaign_id": "{{ trigger.campaign_id }}",
  "phone_number": "{{ trigger.contact_phone }}",
  "call_status": "{{ process_[uc].call_result }}",
  "call_connected": "{{ process_[uc].call_connected }}",
  "objective_completed": "{{ process_[uc].objective_completed }}",
  "call_summary": "{{ process_[uc].call_summary }}",
  "merchant_uuid": "{{ trigger.merchant_uuid }}",
  "funnel_stage": "{{ trigger.funnel_stage }}",
  "active_objective": "{{ trigger.active_objective }}",
  "needs_escalation": "{{ process_[uc].needs_escalation }}",
  "attempt_number": "{{ process_[uc].attempt_count }}",
  "merchant_sentiment": "{{ process_[uc].merchant_sentiment }}"
}
```

> **Cambio vs workflow antiguo:** `phone_number`, `merchant_uuid`, `funnel_stage` y `active_objective` ahora vienen de `{{ trigger.X }}` en vez de `{{ iteration_element.X }}`.

---

## 9. Columnas del Google Sheet

### Columnas INPUT nuevas (añadir al Sheet)

| Columna | UC | Descripción |
|---|---|---|
| `contract_sent_date` | Firma | Fecha de envío del contrato DocuSign |
| `tablet_credentials_email` | Tablet | Email de login para la tablet |
| `tablet_credentials_password` | Tablet | Password de login para la tablet |
| `current_ror` | ROR | ROR actual en % |

### Columnas que el workflow escribe

Solo `status` y `attempt_count`. No se crean columnas OUTPUT nuevas.

### Campos que van solo al callback (NO al Sheet)

Todo lo demás se envía al backend vía callback y queda en los logs.

---

## 10. Configuración del Caller workflow

### Multi-event behavior

Configurar el Caller workflow con **`parallel`** multi-event behavior. Así puede haber múltiples llamadas concurrentes (una por merchant). HappyRobot gestiona internamente los límites de llamadas simultáneas.

### Timeout

El Caller workflow debería tener un timeout suficiente para una llamada completa: **15 minutos** es razonable (max call duration 600s + procesamiento).

---

## 11. Checklist de verificación

### Dispatcher
- [ ] Webhook trigger recibe el payload correctamente
- [ ] Get Rows filtra solo pending + in_progress
- [ ] Webhook POST envía las rows al backend
- [ ] El backend recibe las rows en `/api/dispatch/:campaignId`

### Caller
- [ ] Webhook trigger recibe todos los datos del merchant
- [ ] Todas las variables `{{ trigger.X }}` son accesibles en el @picker
- [ ] Sheet Update pre-call marca `in_progress`
- [ ] Condition Paths enruta correctamente por `active_objective`
- [ ] Cada agent llama al número correcto (`{{ trigger.contact_phone }}`)
- [ ] Cada agent usa las variables del trigger en su prompt
- [ ] `provide_credentials` (Tablet) lee `{{ trigger.tablet_credentials_email/password }}`
- [ ] AI Extract extrae correctamente los campos
- [ ] Python calcula `new_status` y `attempt_count` correctamente
- [ ] Sheet Update post-call escribe status y attempt_count
- [ ] Callback llega al backend con todos los campos

### End-to-end
- [ ] `POST /api/trigger/uber-eats-onboarding` dispara Dispatcher
- [ ] Dispatcher → backend → Caller fan-out funciona
- [ ] `/api/dispatch-logs` muestra el ciclo de dispatch
- [ ] `/api/logs` muestra callbacks recibidos
- [ ] `/api/stats` muestra desglose por campaña
- [ ] Status "completed" excluye al merchant en siguientes ejecuciones
- [ ] Status "escalated" excluye al merchant
- [ ] ROR nunca marca "completed"

---

## 12. Variables de entorno (Railway)

```
# Nuevas
CAMPAIGN_UBER_EATS_DISPATCHER_WEBHOOK_URL=<webhook del Dispatcher workflow>
CAMPAIGN_UBER_EATS_CALLER_WEBHOOK_URL=<webhook del Caller workflow>
DISPATCH_SECRET=<secreto para auth Dispatcher→Backend>

# Existentes (sin cambios)
CAMPAIGN_UBER_EATS_API_KEY=<API key para ambos workflows>
CALLBACK_SECRET=<secreto para auth Caller→Backend callbacks>
BASE_URL=https://uber-eats-voice-recolection-production.up.railway.app
PORT=3000
```
