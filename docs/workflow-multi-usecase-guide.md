# Guía de configuración del workflow multi-caso de uso en HappyRobot

> Esta guía detalla paso a paso cómo modificar el workflow v5 existente
> para soportar los 4 casos de uso: Docs, Firma, Tablet y ROR.

---

## 1. Visión general del cambio

El workflow pasa de tener un único flujo lineal a tener **4 ramas condicionales** dentro del loop, seleccionadas por el campo `active_objective` del Sheet.

### Antes (v5 actual)

```
Webhook → Get Rows → Loop → [Mark status → Agent Docs → AI Extract → Process → Mark status] → Callback
```

### Después (v6 multi-UC)

Cada rama es **autocontenida**: tiene su propio Agent, AI Extract, Python processing, Sheet Update y Callback. No hay nodo unificado post-paths — cada rama completa el flujo completo.

```
Webhook → Get Rows → Loop → Mark status (pre-call) → CONDITION PATHS →
  ├── Docs   → Agent → AI Extract → Process Docs   → Sheet Update → Callback
  ├── Firma  → Agent → AI Extract → Process Firma  → Sheet Update → Callback
  ├── Tablet → Agent → AI Extract → Process Tablet → Sheet Update → Callback
  └── ROR    → Agent → AI Extract → Process ROR    → Sheet Update → Callback
→ Loop End
```

**Por qué ramas autocontenidas:** En HappyRobot, un input de un Custom Code solo puede mapearse a una variable. Si convergieran en un nodo unificado, habría que crear inputs duplicados por rama (ej: `call_outcome_docs`, `call_outcome_firma`...) y mergearlos en Python — frágil y verboso. Con ramas autocontenidas, cada Python solo mapea los campos de SU AI Extract.

---

## 2. Nodo Webhook Trigger (sin cambios)

El payload del trigger es el mismo de siempre:

```json
{
  "campaign_id": "uber-eats-onboarding",
  "campaign_name": "Uber Eats - Onboarding (all use cases)",
  "triggered_at": "2026-03-08T11:30:00.000Z",
  "callback_url": "https://uber-eats-voice-recolection-production.up.railway.app/api/callbacks/uber-eats-onboarding",
  "max_retries": 10
}
```

No se envía `target_objective` — el workflow lee `active_objective` directamente del Sheet para cada merchant.

---

## 3. Cambios en Google Sheets — Get Rows (nodo 2)

### Filtros actualizados

El filtro solo necesita `status`. El `active_objective` lo usa el Condition Paths dentro del loop para enrutar cada merchant.


| Campo    | Operador | Valor         |
| -------- | -------- | ------------- |
| `status` | equals   | `pending`     |
| `status` | equals   | `in_progress` |


**Lógica:** status = pending OR status = in_progress

El campo `active_objective` debe estar mapeado en el conector para que esté disponible como variable dentro del loop.

Esto asegura que cada campaña solo procesa los merchants cuyo objetivo activo coincide con el trigger.

---

## 4. Nuevo nodo: Condition Paths (nodo 3b)

### Ubicación

Después de "Mark agent status" (3a) y antes de los Agent nodes.

### Configuración

- **Tipo:** Condition → Paths
- **Variable a evaluar:** `{{ iteration_element.active_objective }}`
- **Política de evaluación:** "Use first evaluated" (primera coincidencia)

### Paths


| Path   | Condición                          | Nodo destino              |
| ------ | ---------------------------------- | ------------------------- |
| Path 1 | `active_objective` equals `Docs`   | Voice Agent: Lucas-Docs   |
| Path 2 | `active_objective` equals `Firma`  | Voice Agent: Lucas-Firma  |
| Path 3 | `active_objective` equals `Tablet` | Voice Agent: Lucas-Tablet |
| Path 4 | `active_objective` equals `ROR`    | Voice Agent: Lucas-ROR    |


---

## 5. Configuración de cada Voice Agent

### 5.1 Lucas-Docs (existente — mover a Path 1)

Sin cambios. Mover el nodo existente "Call Client Regarding Matter" bajo Path 1 del Condition. Mantener el prompt, tools y AI Extract actuales.

### 5.2 Lucas-Firma (nuevo — Path 2)

**Tipo nodo:** AI Agent → Outbound voice agent with callback


| Campo              | Valor                                   |
| ------------------ | --------------------------------------- |
| Agent name         | Lucas                                   |
| Voice              | Pablo HR (es-ES)                        |
| Language           | Spanish                                 |
| Accent             | Spanish                                 |
| Model              | gpt-4.1-fast                            |
| Max call duration  | 600s                                    |
| Voicemail handling | hangup                                  |
| To                 | `{{ iteration_element.contact_phone }}` |
| From (prod)        | +34911671042                            |
| From (dev)         | +34911675195                            |


**Prompt:** Copiar contenido completo de `prompt-lucas-firma.md`

**Nota sobre variables:** Los placeholders `{{ index . "019cb99a-..." }}` del prompt deben mapearse a las variables reales del workflow. Al pegar el prompt en HappyRobot, reemplazar cada referencia con la variable correcta usando el picker (@).

**Tool: `mark_contract_status`**


| Campo       | Valor                                                                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nombre      | mark_contract_status                                                                                                                                 |
| Descripción | Usar cuando el merchant confirma haber firmado, se compromete a firmar, o necesita que le reenvíen el contrato. NO usar si solo dice "ya lo miraré". |
| AI message  | "Confirma al merchant que tomas nota de su respuesta sobre el contrato."                                                                             |


Parámetros:


| Nombre             | Tipo    | Required | Descripción                                                 |
| ------------------ | ------- | -------- | ----------------------------------------------------------- |
| `contract_signed`  | boolean | sí       | true si el merchant confirmó haber firmado                  |
| `signing_timeline` | string  | no       | Cuándo dice que va a firmar: "ahora", "hoy", "mañana", etc. |
| `needs_resend`     | boolean | sí       | true si el merchant no encontró el email y necesita reenvío |


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

### 5.3 Lucas-Tablet (nuevo — Path 3)

**Tipo nodo:** AI Agent → Outbound voice agent with callback

Misma configuración base que Lucas-Firma (voice, model, phone numbers).

**Prompt:** Copiar contenido completo de `prompt-lucas-tablet.md`

**Tool 1: `mark_tablet_activated`**


| Campo       | Valor                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------- |
| Nombre      | mark_tablet_activated                                                                         |
| Descripción | Usar cuando se completa un paso de activación o la tablet queda operativa con estado ABIERTO. |
| AI message  | "Confirma al merchant que registras el progreso de la activación."                            |


Parámetros:


| Nombre             | Tipo    | Required | Descripción                                                             |
| ------------------ | ------- | -------- | ----------------------------------------------------------------------- |
| `tablet_activated` | boolean | sí       | true si la tablet quedó en estado "Abierto"                             |
| `step_reached`     | string  | sí       | Último paso completado: "power", "wifi", "login", "permissions", "open" |


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


| Campo       | Valor                                                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nombre      | provide_credentials                                                                                                                                   |
| Descripción | Usar cuando el merchant necesita sus credenciales de acceso a la app Uber Eats Orders. Llamar a este tool ANTES de proporcionar cualquier credencial. |
| AI message  | "Un momento, obtengo las credenciales de acceso."                                                                                                     |


Parámetros del tool: **ninguno** (el agente no tiene las credenciales — las obtiene del Sheet)

**Code hijo (Get Credentials):**

Los inputs del code se mapean desde el **variable picker del workflow** (no desde parámetros del tool, ya que no tiene):


| Input del code | Mapeado a (variable del workflow)                     |
| -------------- | ----------------------------------------------------- |
| `email`        | `{{ iteration_element.tablet_credentials_email }}`    |
| `password`     | `{{ iteration_element.tablet_credentials_password }}` |


```python
email = str(input_data.get("email", ""))
password = str(input_data.get("password", ""))

output = {
    "email": email,
    "password": password,
    "has_credentials": "TRUE" if email and password else "FALSE"
}
```

Así el code recibe los datos reales del Sheet via el iteration element del loop.

### 5.4 Lucas-ROR (nuevo — Path 4)

**Tipo nodo:** AI Agent → Outbound voice agent with callback

Misma configuración base (voice, model, phone numbers).

**Prompt:** Copiar contenido completo de `prompt-lucas-ror.md`

**Tool: `mark_ror_commitment`**


| Campo       | Valor                                                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Nombre      | mark_ror_commitment                                                                                                                            |
| Descripción | Usar cuando el merchant se compromete a mantener la tablet activa o se identifica la causa del bajo ROR. NO usar si no hubo conversación real. |
| AI message  | "Confirma al merchant que tomas nota de su compromiso."                                                                                        |


Parámetros:


| Nombre               | Tipo    | Required | Descripción                                                                                       |
| -------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------- |
| `merchant_committed` | boolean | sí       | true si el merchant se compromete a mejorar                                                       |
| `issue_category`     | string  | sí       | Causa identificada: "tablet_off", "app_background", "wifi", "technical", "disinterest", "unaware" |


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

## 6. AI Extract por rama

Cada rama necesita su propio nodo AI Extract después del Voice Agent. Las descripciones de cada parámetro deben ser lo más específicas posible con ejemplos concretos para que la extracción sea precisa.

### 6.1 AI Extract: Docs

**Modelo:** gpt-4.1
**Input:** Transcript de la llamada
**Prompt:**

```
Analiza la transcripción de una llamada outbound de Uber Eats cuyo objetivo era conseguir que el merchant envíe la documentación pendiente para completar su alta en la plataforma.

El agente (Lucas) llama para hacer push de que el merchant envíe documentos de identidad, documentación fiscal, bancaria, y/o el menú con horario del restaurante. No procesa documentos él mismo — solo pide que los envíen al AE por correo o WhatsApp.

Extrae los siguientes datos basándote EXCLUSIVAMENTE en lo que se dijo explícitamente en la conversación. No asumas ni inferiras datos que no estén en el transcript.
```

**Parámetros:**


| Nombre                    | Tipo    | Required | Descripción                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `call_connected`          | boolean | sí       | true SOLO si hubo una conversación real con una persona que respondió y habló. false si saltó buzón de voz, no contestaron, línea ocupada, error de conexión, o solo se escuchó un tono. Ejemplo true: "Sí, soy yo" / "Dígame" / "Hola". Ejemplo false: "Deje su mensaje después de la señal" / silencio total / tonos sin respuesta.                                                                                                                                                                                                                                                                  |
| `documentation_confirmed` | boolean | sí       | true SOLO si el merchant confirmó explícitamente que va a enviar la documentación pendiente o que ya la envió. No marcar true si solo dijo "lo miraré" o "ya veré". Ejemplo true: "Sí, se lo envío hoy" / "Ya lo mandé ayer por correo" / "Ahora mismo le hago fotos y se las mando". Ejemplo false: "Luego lo miro" / "Ya veré" / "No tengo tiempo ahora" / "No sé qué documentos necesito".                                                                                                                                                                                                          |
| `call_outcome`            | string  | sí       | Resultado principal de la llamada. Debe ser EXACTAMENTE uno de: "connected_committed" (el merchant se conectó y se comprometió a enviar la documentación), "connected_refused" (se conectó pero rechazó o no quiso enviar nada), "connected_more_time" (se conectó pero pidió más tiempo sin comprometerse a una fecha), "connected_already_sent" (dice que ya envió la documentación previamente), "connected_other" (se conectó pero el resultado no encaja en las categorías anteriores), "voicemail" (saltó buzón de voz), "no_answer" (no contestó nadie), "error" (error técnico en la llamada). |
| `call_summary`            | string  | sí       | Resumen objetivo de la llamada en 1-2 frases en español. Debe incluir: si se conectó, qué documentos se mencionaron como pendientes (si se mencionaron), y cuál fue el resultado. Ejemplo: "El merchant confirmó que es autónomo y se comprometió a enviar el DNI y el modelo 036 por correo hoy." / "No contestó nadie tras varios tonos." / "El merchant dice que ya envió todo la semana pasada. Verificar recepción." / "El merchant pidió que le llamen la próxima semana porque está de vacaciones."                                                                                             |
| `merchant_sentiment`      | string  | sí       | Actitud general del merchant durante la conversación. Debe ser EXACTAMENTE uno de: "positive" (colaborativo, dispuesto, agradecido, proactivo), "neutral" (ni positivo ni negativo, respuestas escuetas, sin emoción clara), "negative" (molesto, frustrado, desinteresado, quejoso, hostil). Si no hubo conversación (voicemail/no_answer), usar "neutral".                                                                                                                                                                                                                                           |
| `needs_escalation`        | boolean | sí       | true si durante la llamada surgió una situación que requiere intervención humana del Account Executive: el merchant rechaza enviar documentación, tiene dudas comerciales o contractuales, pide hablar con alguien, muestra hostilidad, o plantea un tema que va más allá de la documentación (firma, tablet, etc.). false en todos los demás casos. Ejemplo true: "No pienso enviar nada" / "Quiero hablar con quien me llamó antes" / "Tengo dudas sobre el contrato". Ejemplo false: "Lo envío mañana" / "No tengo tiempo ahora pero lo haré esta semana".                                          |
| `escalation_reason`       | string  | no       | Motivo específico por el que se necesita escalación, con contexto suficiente para que el AE entienda la situación y actúe. Dejar vacío si needs_escalation es false. Ejemplo: "El merchant rechaza enviar documentación porque dice que no va a seguir con el proceso" / "Pide hablar con su Account Executive para aclarar dudas sobre comisiones antes de enviar nada" / "El merchant dice que ya envió los documentos 3 veces y está frustrado porque nadie le confirma".                                                                                                                           |


### 6.2 AI Extract: Firma

**Modelo:** gpt-4.1
**Input:** Transcript de la llamada
**Prompt:**

```
Analiza la transcripción de una llamada outbound de Uber Eats cuyo objetivo era conseguir que el merchant firme un acuerdo comercial pendiente en DocuSign.

El agente (Lucas) llama para recordar al merchant que tiene un contrato sin firmar en su correo electrónico. No reenvía el contrato ni explica cláusulas — solo hace push para que lo firme.

Extrae los siguientes datos basándote EXCLUSIVAMENTE en lo que se dijo explícitamente en la conversación. No asumas ni inferiras datos que no estén en el transcript.
```

**Parámetros:**


| Nombre               | Tipo    | Required | Descripción                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `call_connected`     | boolean | sí       | true SOLO si hubo una conversación real con una persona que respondió y habló. false si saltó buzón de voz, no contestaron, línea ocupada, error de conexión, o solo se escuchó un tono. Ejemplo true: "Sí, soy yo" / "Dígame". Ejemplo false: "Deje su mensaje después de la señal" / silencio total / tonos sin respuesta.                                                                                                                                                                              |
| `contract_found`     | boolean | sí       | true si el merchant confirmó que ha visto o localizado el email de DocuSign con el contrato. false si dice que no le ha llegado, no lo encuentra, o no revisó su correo. Ejemplo true: "Sí, lo tengo en el correo" / "Lo vi ayer pero no lo abrí". Ejemplo false: "No me ha llegado nada" / "No sé de qué me habla" / "Déjeme revisar... no lo veo".                                                                                                                                                      |
| `contract_signed`    | boolean | sí       | true SOLO si el merchant confirmó explícitamente que completó la firma del contrato DURANTE la llamada o ANTES de la llamada. No marcar true si solo dijo que "lo va a firmar" o "lo mira luego". Ejemplo true: "Ya lo acabo de firmar" / "Lo firmé ayer". Ejemplo false: "Lo firmo esta tarde" / "Ahora no puedo" / "Lo miro luego".                                                                                                                                                                     |
| `signing_commitment` | string  | no       | Momento concreto en que el merchant se comprometió a firmar, usando sus palabras exactas o lo más cercano posible. Dejar vacío si no hubo compromiso temporal. Ejemplo: "hoy por la tarde", "mañana a primera hora", "ahora mismo", "esta semana", "cuando tenga un momento".                                                                                                                                                                                                                             |
| `needs_resend`       | boolean | sí       | true si el merchant buscó el email (en bandeja de entrada Y spam) y no lo encontró, indicando que necesita que se lo reenvíen. false si no buscó, si lo encontró, o si la llamada no llegó a ese punto. Ejemplo true: "He mirado en spam también y no está" / "No me ha llegado nunca". Ejemplo false: "No he mirado todavía" / "Sí, lo tengo aquí".                                                                                                                                                      |
| `needs_escalation`   | boolean | sí       | true si durante la llamada surgió una situación que requiere intervención humana del Account Executive: el merchant tiene dudas legales sobre el contrato, rechaza firmarlo, pide hablar con alguien, o muestra hostilidad. false en todos los demás casos. Ejemplo true: "No estoy de acuerdo con las condiciones" / "Quiero hablar con mi contacto" / "No pienso firmar esto". Ejemplo false: "Lo firmo mañana" / "No me ha llegado".                                                                   |
| `escalation_reason`  | string  | no       | Motivo específico por el que se necesita escalación, con contexto suficiente para que el AE entienda la situación. Dejar vacío si needs_escalation es false. Ejemplo: "El merchant tiene dudas sobre las comisiones del contrato y quiere que se las explique un responsable" / "Rechaza firmar porque dice que las condiciones no son las que acordó" / "Pide hablar directamente con su Account Executive por un tema que no quiso detallar".                                                           |
| `call_outcome`       | string  | sí       | Resultado principal de la llamada. Debe ser EXACTAMENTE uno de estos valores: "signed" (firmó durante o antes de la llamada), "will_sign_today" (se comprometió a firmar hoy), "will_sign_later" (se comprometió a firmar en otro momento), "needs_resend" (no encuentra el email, necesita reenvío), "has_doubts" (tiene dudas sobre el contrato, escalado al AE), "refused" (rechaza firmar), "voicemail" (saltó buzón de voz), "no_answer" (no contestó nadie), "error" (error técnico en la llamada). |
| `call_summary`       | string  | sí       | Resumen objetivo de la llamada en 1-2 frases en español. Debe incluir: quién contestó (si contestó), qué se habló, y cuál fue el resultado. Ejemplo: "El merchant confirmó que recibió el contrato pero no ha tenido tiempo de revisarlo. Se comprometió a firmarlo hoy por la tarde." / "No contestó nadie tras varios tonos." / "El merchant encontró el contrato en spam y lo firmó durante la llamada."                                                                                               |
| `merchant_sentiment` | string  | sí       | Actitud general del merchant durante la conversación. Debe ser EXACTAMENTE uno de: "positive" (colaborativo, amable, dispuesto a firmar, agradecido), "neutral" (ni positivo ni negativo, respuestas escuetas, sin emoción clara), "negative" (molesto, hostil, frustrado, quejoso, desinteresado). Si no hubo conversación (voicemail/no_answer), usar "neutral".                                                                                                                                        |


### 6.3 AI Extract: Tablet

**Modelo:** gpt-4.1
**Input:** Transcript de la llamada
**Prompt:**

```
Analiza la transcripción de una llamada outbound de Uber Eats cuyo objetivo era guiar al merchant paso a paso en la activación de su tablet para recibir pedidos.

El agente (Lucas) llama para ayudar al merchant a: enchufar la tablet, conectarla al WiFi, abrir la app Uber Eats Orders, iniciar sesión con sus credenciales, y verificar que aparece como "Abierto" (online).

Extrae los siguientes datos basándote EXCLUSIVAMENTE en lo que se dijo explícitamente en la conversación. No asumas ni inferiras datos que no estén en el transcript.
```

**Parámetros:**


| Nombre                    | Tipo    | Required | Descripción                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `call_connected`          | boolean | sí       | true SOLO si hubo una conversación real con una persona que respondió y habló. false si saltó buzón de voz, no contestaron, línea ocupada, o error de conexión. Ejemplo true: "Sí, soy yo" / "Dígame". Ejemplo false: "Deje su mensaje después de la señal" / silencio / tonos sin respuesta.                                                                                                                                                                                                                                                                                                          |
| `tablet_activated`        | boolean | sí       | true SOLO si al final de la llamada se confirmó que la tablet muestra el estado "Abierto" (o "Open") en verde en la esquina superior derecha de la app Uber Eats Orders. false en cualquier otro caso, incluso si se avanzó en varios pasos pero no se llegó a verificar "Abierto". Ejemplo true: "Sí, pone Abierto arriba a la derecha" / "Ya lo veo en verde". Ejemplo false: "No me aparece" / "Se quedó en la pantalla de login" / no se llegó a ese paso.                                                                                                                                         |
| `activation_step_reached` | string  | sí       | El ÚLTIMO paso que se completó con éxito durante la llamada. Debe ser EXACTAMENTE uno de: "power" (la tablet se encendió), "wifi" (se conectó al WiFi), "login" (inició sesión en la app), "permissions" (aceptó los permisos), "open" (verificó estado Abierto), "none" (no se completó ningún paso, ej: el merchant no tiene la tablet a mano). Ejemplo: si el merchant conectó WiFi pero falló el login, el valor es "wifi". Si completó todo, el valor es "open".                                                                                                                                  |
| `technical_issue_type`    | string  | no       | Tipo de problema técnico encontrado durante la activación, si hubo alguno. Debe ser EXACTAMENTE uno de: "wifi" (no se conecta a la red WiFi del local), "credentials" (credenciales incorrectas, no las tiene, o aparece código de 4 dígitos), "power" (la tablet no enciende o no tiene batería), "app_not_found" (no encuentra la app Uber Eats Orders en la tablet), "none" (no hubo ningún problema técnico). Ejemplo: si el merchant puso el email mal y apareció un código de 4 dígitos → "credentials". Si la tablet no se conecta al WiFi del restaurante → "wifi".                            |
| `needs_escalation`        | boolean | sí       | true si durante la llamada surgió un problema que el agente no pudo resolver y requiere intervención del Account Executive: problema técnico persistente tras 2 intentos, tablet defectuosa o ausente, error que no se puede diagnosticar por teléfono, o el merchant pide hablar con alguien. false si se resolvió todo o si el problema es menor. Ejemplo true: "La tablet no enciende aunque está enchufada" (tras 2 intentos) / "No me ha llegado la tablet" / "Quiero hablar con mi contacto". Ejemplo false: "Ya pone Abierto" / "El WiFi no conectaba pero cambiamos la contraseña y funcionó". |
| `escalation_reason`       | string  | no       | Motivo específico de la escalación con contexto suficiente para que el AE entienda qué hacer. Dejar vacío si needs_escalation es false. Ejemplo: "La tablet no enciende tras verificar que está enchufada y mantener pulsado el botón de encendido — posible tablet defectuosa" / "El merchant dice que no ha recibido la tablet, necesita que se verifique el envío" / "Error persistente de login: las credenciales proporcionadas no funcionan tras 2 intentos".                                                                                                                                    |
| `call_outcome`            | string  | sí       | Resultado principal de la llamada. Debe ser EXACTAMENTE uno de: "fully_activated" (la tablet quedó en estado Abierto y operativa), "partial_progress" (se avanzó en algunos pasos pero no se completó la activación), "no_tablet" (el merchant no tiene la tablet a mano o no la ha recibido), "needs_credentials" (faltaban credenciales y no se pudieron obtener), "technical_issue" (un problema técnico impidió completar la activación), "voicemail" (saltó buzón de voz), "no_answer" (no contestó nadie), "error" (error técnico en la llamada).                                                |
| `call_summary`            | string  | sí       | Resumen objetivo de la llamada en 1-2 frases en español. Debe incluir: si se conectó, hasta dónde se llegó en la activación, y si quedó algo pendiente. Ejemplo: "El merchant completó todos los pasos de activación y la tablet quedó en estado Abierto. Se le recordó mantenerla siempre enchufada." / "Se conectó al WiFi pero las credenciales no funcionaron. Se escaló al AE para que verifique las credenciales." / "El merchant no tiene la tablet en el local, se le volverá a llamar mañana."                                                                                                |
| `merchant_sentiment`      | string  | sí       | Actitud general del merchant durante la conversación. Debe ser EXACTAMENTE uno de: "positive" (colaborativo, paciente, agradecido por la ayuda), "neutral" (ni positivo ni negativo, sigue instrucciones sin emoción particular), "negative" (frustrado, impaciente, molesto por problemas técnicos, quejoso). Si no hubo conversación, usar "neutral".                                                                                                                                                                                                                                                |


### 6.4 AI Extract: ROR

**Modelo:** gpt-4.1
**Input:** Transcript de la llamada
**Prompt:**

```
Analiza la transcripción de una llamada outbound de Uber Eats cuyo objetivo era mejorar el ratio de conexión online (ROR) del merchant. El restaurante no está apareciendo como disponible en la app durante todo su horario de apertura, lo que significa que pierde pedidos.

El agente (Lucas) llama para identificar por qué el restaurante no está conectado, resolver problemas sencillos, y construir el hábito de verificar la tablet cada mañana.

Extrae los siguientes datos basándote EXCLUSIVAMENTE en lo que se dijo explícitamente en la conversación. No asumas ni inferiras datos que no estén en el transcript.
```

**Parámetros:**


| Nombre                 | Tipo    | Required | Descripción                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `call_connected`       | boolean | sí       | true SOLO si hubo una conversación real con una persona que respondió y habló. false si saltó buzón de voz, no contestaron, línea ocupada, o error de conexión. Ejemplo true: "Sí, soy yo" / "Dígame". Ejemplo false: "Deje su mensaje después de la señal" / silencio / tonos sin respuesta.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ror_issue_identified` | boolean | sí       | true si durante la conversación se identificó una causa concreta de por qué el restaurante no está conectado. false si el merchant no supo explicar el motivo, o la conversación no llegó a diagnosticar el problema. Ejemplo true: "Se me olvida encender la tablet" / "El WiFi del local no funciona bien" / "No sabía que tenía que estar siempre abierta". Ejemplo false: "No sé por qué no aparezco" / no se habló del tema / no hubo conversación.                                                                                                                                                                                                                                                                                                                          |
| `issue_category`       | string  | sí       | Categoría de la causa raíz del bajo ROR identificada en la conversación. Debe ser EXACTAMENTE uno de: "tablet_off" (la tablet estaba apagada o desenchufada — el merchant se olvida de encenderla o la desenchufa), "app_background" (la tablet está encendida pero la app Uber Eats Orders no estaba en primer plano — se minimizó o se cerró), "wifi" (problemas de conexión WiFi en el local), "technical" (otro problema técnico: error de la app, tablet defectuosa, pantalla rota, etc.), "disinterest" (el merchant no tiene interés en estar conectado, no le ve valor, quiere dejar de usar el servicio), "unaware" (el merchant no sabía que tenía que estar conectado o no entendía cómo funciona), "unknown" (no se pudo determinar la causa o no hubo conversación). |
| `merchant_committed`   | boolean | sí       | true SOLO si el merchant expresó un compromiso verbal de mejorar su conexión: dijo que va a mantener la tablet encendida, que va a crear el hábito de verificarla, que va a enchufar la tablet, etc. false si solo escuchó la explicación sin comprometerse, mostró desinterés, o no hubo conversación. Ejemplo true: "Sí, la voy a dejar siempre enchufada" / "Entendido, lo haré cada mañana" / "Vale, ahora mismo la enciendo". Ejemplo false: "Ya veré" / "No sé si me merece la pena" / solo dijo "de acuerdo" sin compromiso claro.                                                                                                                                                                                                                                         |
| `needs_escalation`     | boolean | sí       | true si surgió una situación que requiere intervención del Account Executive: problema técnico que no se resolvió con troubleshooting básico (WiFi persistente, tablet defectuosa), merchant muy frustrado, merchant quiere dejar el servicio, o pide hablar con alguien. false en todos los demás casos, incluyendo desinterés leve. Ejemplo true: "La tablet no se conecta al WiFi desde hace una semana" / "Quiero darme de baja" / "Quiero hablar con quien me atendió antes". Ejemplo false: "Se me olvida encenderla, lo intentaré" / "No sabía, ahora lo entiendo".                                                                                                                                                                                                        |
| `escalation_reason`    | string  | no       | Motivo específico de la escalación con contexto suficiente para que el AE entienda la situación y actúe. Dejar vacío si needs_escalation es false. Ejemplo: "El merchant reporta que el WiFi del local no funciona bien desde hace una semana y la tablet no se conecta — necesita soporte técnico presencial" / "El merchant dice que no le compensa estar en la plataforma y quiere hablar con alguien sobre sus opciones" / "Frustración alta: dice que ya ha llamado 3 veces por el mismo problema y nadie lo resolvió".                                                                                                                                                                                                                                                      |
| `call_outcome`         | string  | sí       | Resultado principal de la llamada. Debe ser EXACTAMENTE uno de: "issue_resolved" (se identificó el problema Y se resolvió durante la llamada — ej: el merchant encendió la tablet y está conectado), "committed" (se identificó el problema, el merchant entendió qué hacer y se comprometió a mejorar, pero no se verificó en el momento), "disinterested" (el merchant no muestra interés en mejorar su conexión), "needs_help" (hay un problema técnico o situación que requiere escalación al AE), "voicemail" (saltó buzón de voz), "no_answer" (no contestó nadie), "error" (error técnico en la llamada).                                                                                                                                                                  |
| `call_summary`         | string  | sí       | Resumen objetivo de la llamada en 1-2 frases en español. Debe incluir: si se conectó, qué problema se identificó (si se identificó), qué se hizo al respecto, y cuál fue el resultado. Ejemplo: "El merchant tenía la tablet desenchufada. Se le explicó que debe estar siempre conectada y se comprometió a enchufar la cada mañana." / "No contestó nadie tras varios tonos." / "El merchant reporta problemas de WiFi recurrentes. Se escaló al AE para soporte técnico." / "El merchant dice que no le compensa tener la tablet encendida. Se le explicaron los beneficios pero no mostró interés."                                                                                                                                                                           |
| `merchant_sentiment`   | string  | sí       | Actitud general del merchant durante la conversación. Debe ser EXACTAMENTE uno de: "positive" (receptivo, agradecido, dispuesto a mejorar, colaborativo), "neutral" (ni positivo ni negativo, escucha sin emoción particular, respuestas escuetas), "negative" (frustrado, molesto, desinteresado, quejoso, hostil). Si no hubo conversación (voicemail/no_answer), usar "neutral".                                                                                                                                                                                                                                                                                                                                                                                               |


---

## 7. Post-Call Processing por rama (Custom Code)

Cada rama tiene su propio Custom Code que procesa los resultados de SU AI Extract. La lógica de status es la misma en los 4, pero cada uno solo mapea los campos de su propio AI Extract.

### 7.1 Inputs comunes (iguales en los 4 nodos)


| Input name       | Source                                  |
| ---------------- | --------------------------------------- |
| `call_connected` | AI Extract de la misma rama             |
| `attempt_count`  | `{{ iteration_element.attempt_count }}` |
| `max_retries`    | `{{ trigger.max_retries }}`             |


Los campos del AI Extract (`call_connected`, `call_outcome`, `call_summary`, `merchant_sentiment`, `needs_escalation`, `escalation_reason`) se mapean desde el AI Extract **de la misma rama**.

**Lógica de reintentos:** `attempt_count` solo se incrementa cuando `call_connected = false` (voicemail, no_answer, error). Si hubo conversación real, el resultado queda registrado pero no cuenta como "intento fallido" — la lógica de status se basa en el resultado de la conversación.

### 7.2 Process Docs (rama Docs)

**Inputs adicionales:** `documentation_confirmed` ← AI Extract Docs

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

# Solo incrementar intentos si NO se conectó (voicemail, no_answer, error)
if not call_connected:
    attempt_count = attempt_count + 1

# Calcular nuevo status
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

### 7.3 Process Firma (rama Firma)

**Inputs adicionales:** `contract_signed` ← AI Extract Firma

```python
call_connected = str(input_data.get("call_connected", "false")).lower() == "true"
needs_escalation = str(input_data.get("needs_escalation", "false")).lower() == "true"
objective_completed = str(input_data.get("contract_signed", "false")).lower() == "true"

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

### 7.4 Process Tablet (rama Tablet)

**Inputs adicionales:** `tablet_activated` ← AI Extract Tablet

Mismo código que Firma pero con `tablet_activated`:

```python
objective_completed = str(input_data.get("tablet_activated", "false")).lower() == "true"
```

(el resto del código es idéntico — incluye `call_connected`, retry logic, y `call_connected` en output)

### 7.5 Process ROR (rama ROR)

**Inputs adicionales:** ninguno extra — ROR nunca se completa automáticamente.

```python
call_connected = str(input_data.get("call_connected", "false")).lower() == "true"
needs_escalation = str(input_data.get("needs_escalation", "false")).lower() == "true"
objective_completed = False  # ROR nunca se completa automaticamente

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

## 8. Sheet Update por rama

Cada rama tiene su propio nodo Google Sheets - Update Columns después del Python.

**Límite de 24 columnas en el conector de Google Sheets.** Las 24 columnas del Sheet están ocupadas (20 existentes + 4 nuevas INPUT). Solo se pueden escribir columnas que ya existen: `status` y `attempt_count`. Todo lo demás va al backend vía callback.

### Match column

| Campo | Valor |
|---|---|
| Match column | `contact_phone` |
| Match value | `{{ iteration_element.contact_phone }}` |

### Columnas a escribir (idénticas en las 4 ramas)

| Columna | Valor |
|---|---|
| `status` | `{{ process_[uc].new_status }}` |
| `attempt_count` | `{{ process_[uc].attempt_count }}` |

*(Donde `process_[uc]` es el nombre del nodo Python de cada rama)*

**Solo 2 columnas de escritura.** Son las únicas necesarias para la retry logic (el filtro Get Rows usa `status`, y el Python usa `attempt_count`).

**Todo lo demás va al callback:** `call_connected`, `call_result`, `objective_completed`, `call_summary`, `needs_escalation`, `escalation_reason`, `merchant_sentiment`, y todos los campos UC-específicos se envían al backend y quedan en el log.

---

## 9. Callback por rama

Cada rama tiene su propio nodo Webhook POST al backend. El body es idéntico en las 4 ramas (solo cambia la referencia al nodo Python de su rama).

### URL

```
{{ trigger.callback_url }}
```

### Headers

```
X-Callback-Secret: {{ env.CALLBACK_SECRET }}
```

### Body

```json
{
  "campaign_id": "{{ trigger.campaign_id }}",
  "phone_number": "{{ iteration_element.contact_phone }}",
  "call_status": "{{ process_[uc].call_result }}",
  "call_connected": "{{ process_[uc].call_connected }}",
  "objective_completed": "{{ process_[uc].objective_completed }}",
  "call_summary": "{{ process_[uc].call_summary }}",
  "merchant_uuid": "{{ iteration_element.merchant_uuid }}",
  "funnel_stage": "{{ iteration_element.funnel_stage }}",
  "active_objective": "{{ iteration_element.active_objective }}",
  "needs_escalation": "{{ process_[uc].needs_escalation }}",
  "attempt_number": "{{ process_[uc].attempt_count }}",
  "merchant_sentiment": "{{ process_[uc].merchant_sentiment }}"
}
```

*(Donde `process_[uc]` es `process_docs`, `process_firma`, `process_tablet`, o `process_ror` según la rama)*

---

## 10. Columnas nuevas a añadir al Google Sheet

Añadir estas columnas INPUT al Sheet existente (`Test Uber Eats - Onboarding Agent - Document and menu` → `Sheet1`):

| Columna | UC | Descripción |
|---|---|---|
| `contract_sent_date` | Firma | Fecha de envío del contrato DocuSign |
| `tablet_credentials_email` | Tablet | Email de login para la tablet |
| `tablet_credentials_password` | Tablet | Password de login para la tablet |
| `current_ror` | ROR | ROR actual en % |

**Solo 4 columnas nuevas.** Todas de entrada (INPUT), pobladas externamente. El workflow las lee pero no las modifica.

### Columnas que el workflow escribe (ya existentes en el Sheet)

Solo `status` y `attempt_count`. No se crean columnas OUTPUT nuevas.

### Campos que van solo al callback (NO al Sheet)

**Todo lo demás** se envía al backend vía callback: `call_connected`, `call_result`, `objective_completed`, `call_summary`, `needs_escalation`, `escalation_reason`, `merchant_sentiment`, y todos los UC-específicos. **No se escriben en el Sheet** — las 24 columnas están ocupadas.

- **Docs:** `documentation_confirmed`
- **Firma:** `contract_signed`, `needs_resend`, `signing_commitment`, `contract_found`
- **Tablet:** `tablet_activated`, `activation_step_reached`, `technical_issue_type`
- **ROR:** `ror_issue_identified`, `issue_category`, `merchant_committed`

Estos datos quedan en el log del backend y en los Runs de HappyRobot.

---

## 11. Checklist de verificación

- Get Rows filtra por `status` (pending + in_progress)
- Condition Paths evalúa `active_objective` correctamente
- Path Docs: agente funciona como antes (no regresión)
- Path Docs: AI Extract + Python + Sheet Update + Callback funcionan
- Path Firma: agente llama, tool funciona, AI Extract extrae correctamente
- Path Firma: Python + Sheet Update + Callback funcionan
- Path Tablet: agente llama, ambos tools funcionan (mark + credentials)
- Path Tablet: Python + Sheet Update + Callback funcionan
- Path ROR: agente llama, tool funciona
- Path ROR: Python + Sheet Update + Callback funcionan
- Sheet Update: escribe columnas comunes + UC-específicas correctamente
- Callback: llega al backend con todos los campos, aparece en /api/logs
- Status "escalated": excluye al merchant del loop en siguientes ejecuciones
- Status "completed": excluye al merchant del loop
- ROR: nunca marca "completed", solo in_progress o max_retries_reached

