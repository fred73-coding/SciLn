// tests/contrast.mjs — WCAG 2.1 contrast checks for SciLn semantic tokens.
// Parses src/css/tokens/semantic.css for var definitions in both light and
// dark blocks, then asserts that predefined (fg, bg) pairs meet the
// minimum contrast ratio (4.5 for body AA, 7.0 for AAA, 3.0 for large text).
//
// Exit 0 on pass, exit 1 on any failure.

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS_CSS = readFileSync(join(ROOT, 'src/css/tokens/semantic.css'), 'utf-8');

// ─── WCAG color math ──────────────────────────────────────────────────

function hexToRgb(hex) {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) throw new Error(`bad hex: ${hex}`);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function channelToLinear(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }) {
  return 0.2126 * channelToLinear(r)
       + 0.7152 * channelToLinear(g)
       + 0.0722 * channelToLinear(b);
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker  = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── Token extraction ─────────────────────────────────────────────────

/** Extract a map of var-name -> hex for a given CSS block (light or dark). */
function extractVars(block) {
  const vars = {};
  const re = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m;
  while ((m = re.exec(block)) !== null) {
    const val = m[2].trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(val)) {
      vars[m[1]] = val.toLowerCase();
    }
  }
  return vars;
}

const lightMatch = TOKENS_CSS.match(/:root\s*\{([\s\S]*?)\n\}/);
const darkMatch  = TOKENS_CSS.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);
if (!lightMatch) throw new Error('Could not find :root block in semantic.css');
if (!darkMatch)  throw new Error('Could not find [data-theme="dark"] block in semantic.css');

const LIGHT = extractVars(lightMatch[1]);
const DARK  = extractVars(darkMatch[1]);

// ─── Pair definitions ──────────────────────────────────────────────────
// Each pair references semantic token names (not raw hex).
// min: 4.5 = WCAG AA body, 7.0 = AAA body, 3.0 = AA large text (>=18pt or 14pt bold).

const PAIRS = [
  // Body text on the most common surfaces (AA required)
  { name: 'text-body / bg-page',   fg: 'text-body',   bg: 'bg-page',   min: 4.5 },
  { name: 'text-body / bg-card',   fg: 'text-body',   bg: 'bg-card',   min: 4.5 },
  { name: 'text-body / bg-canvas', fg: 'text-body',   bg: 'bg-canvas', min: 4.5 },
  { name: 'text-body / bg-code',   fg: 'text-body',   bg: 'bg-code',   min: 4.5 },
  { name: 'text-body / bg-input',  fg: 'text-body',   bg: 'bg-input',  min: 4.5 },
  // Headings (AAA preferred for SciLn)
  { name: 'text-heading / bg-page', fg: 'text-heading', bg: 'bg-page', min: 7.0 },
  { name: 'text-heading / bg-card', fg: 'text-heading', bg: 'bg-card', min: 7.0 },
  // Muted text (AA at minimum, often 3.0 acceptable for captions)
  { name: 'text-muted / bg-page',  fg: 'text-muted',  bg: 'bg-page',  min: 3.0 },
  { name: 'text-muted / bg-card',  fg: 'text-muted',  bg: 'bg-card',  min: 3.0 },
  // Links (AA for text)
  { name: 'text-link / bg-page',   fg: 'text-link',   bg: 'bg-page',   min: 4.5 },
  { name: 'text-link / bg-card',   fg: 'text-link',   bg: 'bg-card',   min: 4.5 },
  // Accent (CTA buttons)
  { name: 'accent-text / accent',  fg: 'accent-text', bg: 'accent',    min: 4.5 },
  { name: 'accent / bg-page',      fg: 'accent',      bg: 'bg-page',   min: 3.0 },
  { name: 'accent / bg-card',      fg: 'accent',      bg: 'bg-card',   min: 3.0 },
  // Nav bar (high contrast needed — appears at every page)
  { name: 'nav-text / nav-bg',     fg: 'nav-text',    bg: 'nav-bg',    min: 7.0 },
  // Editor chrome
  { name: 'editor-text / editor-bg', fg: 'editor-text', bg: 'editor-bg', min: 7.0 },
  // Status (large / icon usage only — 3.0 acceptable)
  { name: 'success / bg-page',     fg: 'success',     bg: 'bg-page',   min: 3.0 },
  { name: 'danger / bg-page',      fg: 'danger',      bg: 'bg-page',   min: 3.0 },
  { name: 'warning / bg-page',     fg: 'warning',     bg: 'bg-page',   min: 3.0 },
];

// ─── Run ───────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;
const rows = [];

function runForTheme(name, vars) {
  for (const p of PAIRS) {
    const fg = vars[p.fg];
    const bg = vars[p.bg];
    if (!fg) { console.log(`  ⚠  ${name}  ${p.name}: missing var --${p.fg}`); fail++; continue; }
    if (!bg) { console.log(`  ⚠  ${name}  ${p.name}: missing var --${p.bg}`); fail++; continue; }
    const ratio = contrastRatio(fg, bg);
    const ok = ratio >= p.min;
    rows.push({ theme: name, pair: p.name, fg, bg, ratio, min: p.min, ok });
    if (ok) pass++; else fail++;
  }
}

console.log('\n── WCAG contrast (SciLn semantic tokens) ──────────────────\n');
runForTheme('light', LIGHT);
runForTheme('dark',  DARK);

// Pretty print
const W = 70;
console.log('  ' + 'theme'.padEnd(7) + 'pair'.padEnd(38) + 'ratio'.padStart(8) + '   min  result');
console.log('  ' + '─'.repeat(W));
for (const r of rows) {
  const mark = r.ok ? '✅' : '❌';
  const ratioStr = r.ratio.toFixed(2) + ':1';
  console.log(`  ${r.theme.padEnd(7)}${r.pair.padEnd(38)}${ratioStr.padStart(8)}   ${String(r.min).padEnd(5)} ${mark}`);
}
console.log('');
console.log(`  Total: ${pass + fail} pairs · ${pass} passed · ${fail} failed\n`);

if (fail > 0) {
  console.error(`  ❌ ${fail} pair(s) below WCAG minimum. Fix the semantic tokens.\n`);
  process.exit(1);
}
console.log(`  ✅ All pairs meet their WCAG threshold.\n`);
