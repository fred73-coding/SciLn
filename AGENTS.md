# SciLn — Agent Guide

## TL;DR
- Pure client-side SPA (no build step, no bundler). Serve `index.html` locally.
- CDN deps: Tailwind, marked, DOMPurify, KaTeX, nostr-tools (all loaded via `<script>` tags).
- `package.json` only has `{"type": "module"}` for Node.js scripts.
- Test: `node tests/verify.mjs` (417 checks — file existence, JS syntax, DOM IDs, patterns, CSS structure, WCAG).
- Contrast: `node tests/contrast.mjs` (38 WCAG pairs — AA body 4.5, AAA heading 7, AA large 3).

## Architecture (working code only)

| Layer | Files | Role |
|---|---|---|
| **Entrypoint** | `src/js/app.js` | Imports everything, wires modules, sets up router |
| **State** | `src/js/state.js` | Reactive store: `session`, `network`, `eventCache`, `cachePerfiles`, `amendmentData`, `amendmentNext`, `rollbackTarget`, `currentPostId`, `editorDraft`. Replaces legacy `window.__*` globals. |
| **Domain** | `voting.js`, `comments.js`, `network.js`, `tags.js`, `roles.js`, `router.js`, `theme.js`, `toast.js`, `parser.js`, `crypto.js`, `revisions.js`, `diff.js`, `exporter.js`, `bookmarks.js`, `feed-filters.js`, `editor-images.js`, `editor-toolbar.js` | Each is an independent ESM module with JSDoc on public exports |
| **Utils** | `src/js/utils.js` | `escapeHtml`, `escapeAttr`, `extractTitle`, `formatDraftAge` — shared helpers |
| **Views** | `src/views/post-detail.js`, `src/views/profile.js`, `src/views/my-lab.js` | Page-level render functions |
| **CSS tokens** | `src/css/tokens/primitives.css`, `tokens/semantic.css`, `tokens/components.css`, `tokens/index.css` | 3-layer token system: raw Solarized palette → purpose-mapped vars → component-scoped vars |
| **CSS core** | `src/css/base.css`, `components.css`, `animations.css`, `print.css` | DOM styles, body/typography, motion, print |
| **CSS entry** | `src/css/styles.css` | 5 `@import`s in cascade order |

Legacy directories (`src/core/`, `src/network/`, `src/ui/`, `src/utils/`, `src/components/`, `src/app.js`) were removed in refactor 2026-06-06.

## Critical patterns

### Card event delegation (DO NOT add per-card listeners)
Post cards are created dynamically via `card.cloneNode(true)`, which loses JS-bound listeners. Instead, `setupCardDelegation()` in `app.js:279` installs one click handler per container (`#feed-container`, `#lab-experiments`) that dispatches via `e.target.closest('[data-action="..."]')`.
- Navigate: `data-action="navigate"` with `data-event-id`
- Profile modal: `data-action="modal"` with `data-pubkey`
- Edit/enmienda: `data-action="edit"` with `data-edit-id`
- Vote: `.vote-btn` inside `[data-vote-target]`

### Amendment version chain
- `amendmentNext` map (originalId → amendmentId) tracks the chain.
- `registerAmendment(event)` removes superseded cards from DOM via `querySelectorAll('[id="card-xxx"]')`.
- `cargarDesdeCache()` does **two passes**: first builds `amendmentNext` from all cached events, then renders only non-superseded events.
- `isSuperseded()` checks `amendmentNext.has()`.
- Amendments use Kind 1 with tag `["e", parentId, "", "reply"]`.

### Theme system
- **Palette**: Solarized (Ethan Schoonover) — 16 base + 8 accent colors, symmetric light/dark.
- **3-layer token system**:
  - `tokens/primitives.css` — raw `--sol-base03`...`--sol-green` (16 colors, never used by app code)
  - `tokens/semantic.css` — `--bg-page`, `--text-body`, `--accent`, etc. (light + dark redefinitions)
  - `tokens/components.css` — `--card-shadow`, `--vote-btn-up`, `--tag-theoretical` (component-scoped)
- **Dark mode**: TWO triggers re-define the same semantic vars:
  - `@media (prefers-color-scheme: dark)` with `:not([data-theme="light"])` guard — system preference
  - `[data-theme="dark"]` — manual override, always wins
- **No `[data-theme="dark"] .X` overrides in `components.css`** — Tailwind utility classes (`.bg-slate-50`, etc.) are remapped ONCE to `var(--semantic-token)`, and dark mode is automatic via var redefinition.
- **Toggle**: `initTheme()` / `toggleTheme()` in `theme.js`. Persists to `localStorage.sciln_theme`.
- **a11y**: `color-scheme: light dark` declared in `:root` + `<meta name="color-scheme">` for native form controls. `prefers-reduced-motion` guard in `base.css`.
- **UI button**: `#theme-toggle-btn`, label = ☀️ when dark, 🌙 when light.

### CSS token quick reference
| Purpose | Token | Light | Dark |
|---|---|---|---|
| Page background | `--bg-page` | `#fdf6e3` | `#002b36` |
| Card background | `--bg-card` | `#ffffff` | `#073642` |
| Body text | `--text-body` | `#4f6975` | `#93a1a1` |
| Heading | `--text-heading` | `#002b36` | `#eee8d5` |
| Muted text | `--text-muted` | `#7d8e8e` | `#94a1a1` |
| Accent (links/buttons) | `--accent` | `#1d6fa8` | `#9aa1e3` |
| Success | `--success` | `#6d7a00` | `#a3b300` |
| Warning | `--warning` | `#946c00` | `#d4a000` |
| Danger | `--danger` | `#b32623` | `#ef5350` |
| Nav background | `--nav-bg` | `#002b36` | `#001e26` |

All pairs validated by `tests/contrast.mjs` (WCAG AA 4.5:1 body, AAA 7:1 headings, 3:1 large/icon).

### Voting (Kind 7, NIP-25)
- `applyVote(eventId, direction, voterPk)` toggles: same direction removes vote, opposite switches. Returns `'+'`, `'-'`, or `null` (no-op / removal).
- Cache persisted in localStorage under `sciln_votes`.
- Reputation = sum of scores across all events authored by a pubkey (`getReputation()`).

### Comments
- Kind 1 with `#t=sciln-comment`. Root tag: `["e", postId, "", "root"]`, reply tag: `["e", parentCommentId, "", "reply"]`.
- `buildCommentTree()` sorts roots then children by `created_at`.
- Max 3 levels of nesting in the UI.
- Comment textarea preview toggled via `#btn-toggle-comment-preview` using `parseScientificContent()`.

### Cross-module state
- All cross-module state lives in `src/js/state.js` (reactive store, refactor 2026-06-07).
- Use `State.get('session')` / `State.set('network', ...)`. Subscribe via `State.subscribe('key', cb)`.
- Legacy `window.__*` globals were removed — do not reintroduce them.

### Nostr network
- Relay: `wss://relay.damus.io` (hardcoded in `app.js:15`)
- Three subscriptions on connect: posts (Kind 1, `#t=sciln-eln`, limit 50), comments (Kind 1, `#t=sciln-comment`, limit 500), reactions (Kind 7, limit 500).
- Events sent via `network.sendEvent(kind, content, tags, pk, sk, mode)`.

### Router
- Hash-based: `#/feed`, `#/post/{id}`, `#/profile/{pk}`, `#/my-lab`, `#/editor`.
- `setOnPageChange(callback)` for page-entry logic (post-detail rendering, editor amendment prepopulation).

### Persistence (localStorage keys)
`sciln_cache` (100 events), `sciln_votes` (1000 entries), `sciln_comments` (500 roots), `sciln_theme`, `sciln_identity` (pk/sk/mode), `sciln_*` (profile fields).

## Commands
- **Test**: `node tests/verify.mjs`
- **Contrast**: `node tests/contrast.mjs`
- **Serve**: any static server pointed at repo root (e.g. `python3 -m http.server`)

## Profile form fields
Role → Position cascade in `roles.js`. "Otro" for position shows a text input. Country list is Latin American + major research nations.
