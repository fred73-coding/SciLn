# Future Plans — SciLn (Revisado 2026-06-06)

> Foco de esta revisión: **funcionalidad Nostr/p2p**

## Estado actual de Nostr/p2p

| Capacidad | Estado | Archivo |
|---|---|---|
| WebSocket a 1 relay (damus.io) | ✅ | `src/js/network.js:15` |
| 3 suscripciones (posts/comments/reactions) | ✅ | `src/js/network.js:73-85` |
| Reconnect automático (5s) | ✅ | `src/js/network.js:36` |
| Firma local (nsec) + extensión (NIP-07) | ✅ | `src/js/crypto.js` |
| Búsqueda sobre relay | ❌ solo DOM | `src/js/app.js:472-480` |
| Multi-relay | ❌ hardcoded | `src/js/network.js:15` |
| Notificaciones in-app | ❌ | — |
| Zaps (NIP-57) | ❌ lud16 en perfil pero no usado | `src/js/app.js:64` |
| Limpieza de suscripciones al cambiar página | ❌ | — |
| Verificación NIP-05 | ❌ | — |
| Identificadores NIP-19 (npub/note) | ❌ | — |

## ✅ DONE

### Feed deduplication (version chain)
- Feed only shows the latest version of each post (intermediate amendment cards hidden)
- Tracks chains via `amendmentNext` map: original → v1 → v2 → latest
- Handles out-of-order arrivals (A2 before A1 → A2 shows, A1 auto-hidden when it arrives)
- Hides/removes cards in both `#feed-container` and `#lab-experiments`

### Compact amendment badge
- Removed the full-width ámbar banner from feed cards
- Replaced with a small `📝 Enmienda` badge alongside category tags (Física, Química, etc.)
- Post-detail: badge in tags area + compact "📜 Ver original" button in actions bar

### Amendment reference display
- Post-detail: "📜 Ver original" button navigates to the original post
- Navigate from an amendment to its parent post with one click

### Comment LaTeX preview
- Real-time preview below the comment textarea
- Uses `parseScientificContent()` to render Markdown + LaTeX
- Toggle preview on/off with a button
- Reply textareas also have a live preview toggle

### Toast notifications
- Replaced all `alert()` calls with in-page toasts
- Animated slide-in from top-right, auto-dismiss after 3.5s
- Stack multiple toasts; success (green), error (red), info (blue)

### Score inheritance + Cross-author amendments
- **Same-author amendments**: new version inherits the score from the superseded version (cumulative reputation)
- **Cross-author amendments**: treated as a fork, not a replacement — both versions show in the feed (no deduplication), scores are independent, no inheritance
- Authorship detected by comparing `event.pubkey` of amendment vs original
- Visual distinction: same-author = `📝 Enmienda vN` badge; cross-author = `🔀 fork de ...` badge
- Local vote transfer (no fake Kind 7 events published)

## 🎯 Backlog priorizado (4 sprints)

### Sprint 1 — Score inheritance + Cross-author amendments 🔥
*Fundación Nostr. Desbloquea trending y notifs.*
**Estado:** ✅ completado en esta revisión

### Sprint 5 — Revisions v2 (Kind 30211) 🔀
*Sistema de versiones Git-like con promoción democrática de forks.*
- Nuevo Kind `30211` dedicado a revisiones (no choca con Kind 1)
- Tag `commit` obligatorio en cada revisión (estilo git commit message)
- Tag `version` auto-calculado, `base` apunta a la raíz del árbol
- Cadenas lineales same-author + ramas fork cross-author (cada fork puede tener su propia cadena)
- **Panel expandible** en cada card con timeline de versiones (mismo autor + forks)
- **Diff línea-a-línea** con markdown renderizado en post-detail (`src/js/diff.js`, LCS, ~70 líneas sin dependencias)
- **Selector de versión a comparar** + botón "Ver diff"
- **Navegación prev/next** entre versiones de la misma cadena
- **Botón "Rollback"** para el autor: pre-llena el editor con la versión anterior
- **Promoción democrática**: el fork con más votos supera al original y se muestra como canónico
- **Badge `✨ promovida`** en el card canónico si es un fork ganador
- **Stat `🧬 N forks promovidos`** en el perfil del autor original
- **Pestaña `Mis Revisiones`** en My Lab con vista de cadenas propias + forks recibidos
- **Backward compat**: Kind 1 con `e+reply` (legacy amendments) sigue funcionando con UI antigua
- 47 nuevos tests en `verify.mjs` (186/186 pasando)

**Esfuerzo:** L | **Impacto:** Alto | **Riesgo:** medio (nuevo modelo de datos)

### Sprint 2 — Search over relay (NIP-50) 🔍
*Bajo esfuerzo, alto valor de descubrimiento.*
- Nuevo método `searchEvents(query)` en `network.js` que envía `REQ` con filtro `search`
- Debounce 300ms en `searchInput` (ya existe listener en `app.js:758`)
- Mantener `search` como **segunda capa**: primero filtra DOM, luego REQ al relay si hay internet
- Merge con cache local, dedup por `event.id`
- Verificar soporte NIP-50 del relay; fallback silencioso si no

**Esfuerzo:** S | **Impacto:** Alto | **Riesgo:** bajo

### Sprint 3 — In-app notifications 🔔
*Convierte SciLn de "publicador" a "red social".*
- Reutilizar suscripciones existentes — solo añadir tracking:
  - `event.pubkey === session.pk` → guardar como "mi contenido"
  - Filtrar Kind 7 (votes) y Kind 1 `#t=sciln-comment` que apunten a mis posts
- Badge numérico en nav (al lado de avatar)
- Dropdown con últimos 10 eventos (timestamp + "X votó tu post Y" / "X comentó Z")
- Persistir `lastSeenAt` en localStorage para no inundar al login
- Enganchar en `onEventReceived` que ya existe en `network.js:9`

**Esfuerzo:** M | **Impacto:** Alto | **Depende de:** Sprint 1 (reputation)

### Sprint 4 — Lightning zaps (NIP-57) ⚡
*Cierra el loop económico p2p.*
- Botón ⚡ en cada card (al lado de vote)
- Leer `lud16` del Kind 0 del autor (ya en perfil, `app.js:64`)
- Si `window.webln` existe → usar `webln.sendPayment()` directo
- Si no → fallback: construir URI `lightning:lnurl...` y abrir WebLN-compatible
- Flow NIP-57: pedir invoice al LNURL endpoint del destinatario, publicar Kind 9735
- Toast de confirmación: "⚡ Zap enviado (XX sats)"

**Esfuerzo:** M | **Impacto:** Alto | **Riesgo:** medio (LNURL servers variados)

## ➕ Items nuevos sugeridos

| # | Item | Por qué importa | Esfuerzo |
|---|---|---|---|
| 1 | **Multi-relay support** | damus.io cae y la app muere. Hardcoded en `network.js:15` | M |
| 2 | **Subscription cleanup al cambiar ruta** | Cada `navigate()` deja suscripciones abiertas, memory leak | S |
| 3 | **NIP-19 identifiers (npub/note)** | Compartir posts/perfiles como `nostr:npub1...` o URLs canónicas | S |
| 4 | **NIP-05 verification** | Tick azul en perfiles, confianza | S |
| 5 | **Deduplicación de eventos cross-relay** | Precondición de multi-relay | S |
| 6 | **Long-form Kind 30023** | Posts largos (papers, preprints) vs Kind 1 cortos | M |
