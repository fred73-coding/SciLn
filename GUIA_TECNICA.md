# SciLn — Technical Guide

## Architecture Overview

SciLn is a **pure client-side single-page application (SPA)** with no build step, no bundler, and no backend server. It runs entirely in the browser and communicates with Nostr relays via WebSocket.

### Core Principles
- **No backend**: all logic runs in the browser
- **No build step**: served as plain HTML/CSS/JS files
- **Nostr-native**: posts, comments, votes, and profiles are all Nostr events
- **Immutable by design**: nothing can be deleted from the relay; version chains handle updates

---

## Project Structure

```
├── index.html                # Single HTML entrypoint
├── package.json              # {"type": "module"} only — no npm deps
├── AGENTS.md                 # Agent guide (development context for AI assistants)
├── GUIA_USUARIO.md           # User guide
├── GUIA_TECNICA.md           # This file
├── PLANES_FUTUROS.md         # Future plans
├── futureplans.md            # Older future plans
├── .gitignore
│
├── src/
│   ├── css/
│   │   ├── styles.css        # Entry point: @imports 5 CSS layers
│   │   ├── base.css          # DOM reset, body/typography
│   │   ├── components.css    # DOM-level component styles
│   │   ├── animations.css    # Motion definitions
│   │   ├── print.css         # Print stylesheet
│   │   └── tokens/
│   │       ├── index.css     # Token entry point
│   │       ├── primitives.css    # Raw Solarized palette (16 colors)
│   │       ├── semantic.css      # Purpose-mapped vars (bg, text, accent)
│   │       └── components.css    # Component-scoped vars
│   │
│   └── js/
│       ├── app.js            # Entry point: imports, wires modules, router
│       ├── state.js          # Reactive store
│       ├── crypto.js         # Identity generation, session management
│       ├── network.js        # Nostr relay WebSocket, event signing/sending
│       ├── voting.js         # Kind 7 vote cache and logic
│       ├── comments.js       # Kind 1 comment cache and logic
│       ├── revisions.js      # Kind 30211 / Kind 1 version chains
│       ├── tags.js           # Scientific category taxonomy
│       ├── roles.js          # Academic role/position cascade
│       ├── router.js         # Hash-based SPA router (#/feed, #/post, etc.)
│       ├── theme.js          # Light/dark theme toggle and persistence
│       ├── toast.js          # Toast notification system
│       ├── parser.js         # Scientific content parsing
│       ├── diff.js           # Text diff for amendments
│       ├── exporter.js       # Markdown export
│       ├── bookmarks.js      # Kind 10003 bookmark list management
│       ├── feed-filters.js   # Data-driven feed filter state
│       ├── editor-toolbar.js # Markdown editor toolbar + keyboard shortcuts
│       ├── editor-images.js  # Image compression pipeline
│       ├── utils.js          # Shared helpers (escapeHtml, etc.)
│       ├── pyodide-manager.js # Pyodide WASM Python execution
│       │
│       └── worker/
│           └── pyodide.worker.js  # Web Worker for Python code execution
│
└── tests/
    ├── verify.mjs           # 417 file/pattern existence checks
    ├── contrast.mjs         # 38 WCAG contrast ratio checks
    └── test.html            # Browser-based test suite
```

---

## Key Technologies

All loaded via CDN `<script>` tags (no npm, no bundler):

| Library | Version | Purpose |
|---|---|---|
| [nostr-tools](https://github.com/nbd-wtf/nostr-tools) | 1.17.0 | Nostr key derivation, event hashing, signing |
| [marked](https://marked.js.org/) | latest | Markdown→HTML rendering |
| [DOMPurify](https://github.com/cure53/DOMPurify) | 3.0.9 | HTML sanitization |
| [KaTeX](https://katex.org/) | 0.16.9 | LaTeX math rendering |
| [Tailwind CSS](https://tailwindcss.com/) | Play CDN | Utility-first CSS framework |

---

## State Management

Cross-module state lives in `src/js/state.js` (a reactive store).

```js
import { State } from './state.js';

// Read
const session = State.get('session');

// Write
State.set('session', { pk, sk, mode });

// Subscribe
State.subscribe('session', (newVal) => { /* react */ });
```

### State Keys
| Key | Type | Description |
|---|---|---|
| `session` | `object|null` | Current identity session |
| `network` | `object|null` | `NostrNetwork` instance |
| `eventCache` | `Map` | Cached Nostr events |
| `cachePerfiles` | `Map` | Cached user profiles (from Kind 0) |
| `amendmentData` | `object[]` | Amendment version chain data |
| `amendmentNext` | `Map` | originalId → amendmentId mapping |
| `rollbackTarget` | `string|null` | Amendment rollback target |
| `currentPostId` | `string|null` | Currently viewed post ID |
| `editorDraft` | `string|null` | Editor draft content |

---

## Nostr Events

### Event Kinds Used

| Kind | NIP | Usage | Tag |
|---|---|---|---|
| 1 | NIP-01 | Scientific notes | `#t=sciln-eln` |
| 1 | NIP-01 | Comments | `#t=sciln-comment` |
| 7 | NIP-25 | Votes (reactions) | — |
| 30211 | NIP-41 | Revision/amendment | `#t=sciln-eln` |
| 10003 | NIP-51 | Bookmark list | `d:bookmarks` |
| 0 | NIP-01 | Profile metadata | — |

### Event Flow

```
Author Browser                    Relay                           Reader Browser
     │                              │                                   │
     ├── sign event (local/ext) ───>│                                   │
     │                              ├── broadcast to subscribers ──────>│
     │                              │                                   ├── process event
     │                              │                                   ├── update cache
     │                              │                                   └── render card
```

### Relay
- Default: `wss://relay.damus.io`
- Three subscriptions on connection:
  1. Posts: Kind 1, `#t=sciln-eln`, limit 50
  2. Comments: Kind 1, `#t=sciln-comment`, limit 500
  3. Reactions: Kind 7, limit 500

---

## CSS Token System

A 3-layer design system based on the Solarized palette.

### Layers

1. **Primitives** (`tokens/primitives.css`)
   - Raw Solarized colors: `--sol-base03` … `--sol-green`
   - Never used directly by app code

2. **Semantic** (`tokens/semantic.css`)
   - Purpose-mapped variables: `--bg-page`, `--text-body`, `--accent`
   - Redefined for light and dark modes
   - Dark mode triggered by `[data-theme="dark"]` or `@media (prefers-color-scheme: dark)`

3. **Component** (`tokens/components.css`)
   - Component-scoped: `--card-shadow`, `--vote-btn-up`, `--tag-theoretical`

### Quick Reference

| Purpose | Light | Dark |
|---|---|---|
| Page background | `#fdf6e3` | `#002b36` |
| Card background | `#ffffff` | `#073642` |
| Body text | `#4f6975` | `#93a1a1` |
| Heading | `#002b36` | `#eee8d5` |
| Accent | `#1d6fa8` | `#9aa1e3` |

All pairs validated by `tests/contrast.mjs` (WCAG AA 4.5:1 body, AAA 7:1 headings, 3:1 large text).

---

## Identity & Session

### Key Storage

| localStorage key | Content |
|---|---|
| `sciln_pk` | Public key (hex) |
| `sciln_sk` | Private key (hex) — local mode only |
| `sciln_mode` | `"local"` or `"extension"` |
| `sciln_*` | Profile metadata fields |

### Two Modes

**Local**: private key is stored in localStorage and used for signing in JavaScript. Convenient but less secure — any XSS could exfiltrate the key.

**Extension**: private key never touches the app. Signing delegated to `window.nostr.signEvent()` (NIP-07). More secure.

### Clearing Session
`clearSession()` removes all `sciln_*` keys from localStorage.

---

## Persistence (localStorage)

| Key | Content | Cap |
|---|---|---|
| `sciln_cache` | Event cache | 100 events |
| `sciln_votes` | Vote cache | 1000 entries |
| `sciln_comments` | Comment cache | 500 roots |
| `sciln_theme` | Theme preference | — |
| `sciln_bookmarks` | Bookmark list | — |
| `sciln_bookmarks_meta` | Bookmark metadata | — |
| `sciln_editor_draft` | Editor auto-save | 7 days |
| `sciln_pending_images` | Compressed image data | — |
| `sciln_feed_filters` | Feed filter state | — |

---

## Development

### Prerequisites
- Any static file server (Python, Node, etc.)

### Serve Locally
```bash
# Python 3
python3 -m http.server 8000

# Node (http-server)
npx http-server . -p 8000
```

Then open `http://localhost:8000` in your browser.

### Testing
```bash
# File existence, JS syntax, DOM IDs, patterns, CSS structure
node tests/verify.mjs

# WCAG contrast ratios (38 pairs)
node tests/contrast.mjs
```

### Code Conventions
- **No build step** — all changes are direct file edits
- **ESM modules** — `import`/`export` syntax throughout
- **JSDoc** on all public exports
- **No comments in code** unless absolutely necessary
- **Card event delegation** — use `data-action` attributes, not per-card listeners
- **Reactive state** — use `State.get()` / `State.set()` / `State.subscribe()`

---

## Deployment

Since SciLn is a static SPA, deployment is straightforward:

### Options
1. **GitHub Pages**: push to `gh-pages` branch or use Actions
2. **Netlify**: connect repo, publish from root
3. **Any static host**: S3, Nginx, Caddy, etc.

### Steps
1. Push the repository to your Git host
2. Configure the static host to serve `index.html` for all routes (for client-side routing)
3. No build step needed

---

## Testing Infrastructure

### verify.mjs (417 checks)
- File existence (every expected file must exist)
- JS syntax validation (each JS file is parsed by Node.js)
- DOM ID checks (expected IDs in `index.html`)
- Pattern checks (specific exports, variables, storage keys)
- CSS structure checks (expected `@import` cascade)
- WCAG reference checks (contrast pairs)

### contrast.mjs (38 pairs)
- Reads CSS semantic token files
- Extracts `--*` variable definitions with light/dark values
- Parses hex colors and computes relative luminance
- Validates each pair against WCAG 2.1 thresholds:
  - AA: 4.5:1 for body text
  - AAA: 7:1 for headings
  - AA: 3:1 for large text (18px+ bold or 24px+ regular)
