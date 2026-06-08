// src/js/tags.js
// Category taxonomy and helpers for the `t` tags on posts.
// Hierarchical: top-level discipline (`fisica`) and nested subfield
// (`fisica/mecanica-clasica`). Both are stored as separate `t` tags.

/** @type {Array<{id:string, label:string, icon:string, children:Array<{id:string, label:string}>}>} */
export const TAXONOMY = [
  {
    id: "fisica",
    label: "Física",
    icon: "⚛️",
    children: [
      { id: "fisica/mecanica-clasica", label: "Mecánica Clásica" },
      { id: "fisica/termodinamica", label: "Termodinámica" },
      { id: "fisica/electromagnetismo", label: "Electromagnetismo" },
      { id: "fisica/optica", label: "Óptica" },
      { id: "fisica/mecanica-cuantica", label: "Mecánica Cuántica" },
      { id: "fisica/relatividad", label: "Relatividad" },
    ]
  },
  {
    id: "quimica",
    label: "Química",
    icon: "🧪",
    children: [
      { id: "quimica/organica", label: "Orgánica" },
      { id: "quimica/inorganica", label: "Inorgánica" },
      { id: "quimica/bioquimica", label: "Bioquímica" },
      { id: "quimica/analitica", label: "Analítica" },
    ]
  },
  {
    id: "biologia",
    label: "Biología",
    icon: "🧬",
    children: [
      { id: "biologia/celular", label: "Celular" },
      { id: "biologia/genetica", label: "Genética" },
      { id: "biologia/ecologia", label: "Ecología" },
      { id: "biologia/microbiologia", label: "Microbiología" },
    ]
  },
  {
    id: "matematicas",
    label: "Matemáticas",
    icon: "📐",
    children: [
      { id: "matematicas/algebra", label: "Álgebra" },
      { id: "matematicas/calculo", label: "Cálculo" },
      { id: "matematicas/estadistica", label: "Estadística" },
      { id: "matematicas/geometria", label: "Geometría" },
    ]
  },
  {
    id: "metodos",
    label: "Métodos",
    icon: "🔬",
    children: [
      { id: "metodos/espectroscopia", label: "Espectroscopía" },
      { id: "metodos/cromatografia", label: "Cromatografía" },
      { id: "metodos/microscopia", label: "Microscopía" },
    ]
  },
];

/**
 * @param {string} path category path like "fisica/mecanica-clasica"
 * @returns {string|null} the top-level parent id, or null
 */
export function getParent(path) {
  if (!path) return null;
  const i = path.indexOf("/");
  return i === -1 ? null : path.substring(0, i);
}

/**
 * @param {string} path
 * @returns {string} the human label, or the path itself if not found
 */
export function getLabel(path) {
  if (!path) return null;
  for (const p of TAXONOMY) {
    if (p.id === path) return p.label;
    for (const c of p.children) {
      if (c.id === path) return c.label;
    }
  }
  return path;
}

/**
 * @param {string} path
 * @returns {string} the icon emoji (📁 if not found)
 */
export function getIcon(path) {
  if (!path) return "📁";
  for (const p of TAXONOMY) {
    if (p.id === path) return p.icon || "📁";
    for (const c of p.children) {
      if (c.id === path) return "";
    }
  }
  return "📁";
}

const CATEGORY_COLORS = {
    fisica: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
    quimica: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    biologia: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
    matematicas: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
    metodos: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
};

/**
 * Tailwind classes for a category badge.
 * @param {string} path
 * @returns {string}
 */
export function getCategoryBadgeClass(path) {
    const parent = path ? path.split('/')[0] : null;
    const c = CATEGORY_COLORS[parent];
    return c ? `${c.bg} ${c.text} ${c.border}` : 'bg-indigo-50 text-indigo-600 border-indigo-100';
}

/**
 * Tailwind border class for a category.
 * @param {string} path
 * @returns {string}
 */
export function getCategoryBorderClass(path) {
    const parent = path ? path.split('/')[0] : null;
    const c = CATEGORY_COLORS[parent];
    return c ? c.border : 'border-indigo-100';
}

/**
 * Raw color tokens for a category.
 * @param {string} path
 * @returns {{bg:string, text:string, border:string}}
 */
export function getCategoryColors(path) {
    const parent = path ? path.split('/')[0] : null;
    return CATEGORY_COLORS[parent] || { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100' };
}

/**
 * True if any of the card's category paths equals `filterPath` or is nested under it.
 * @param {string[]} cardPaths
 * @param {string} filterPath
 * @returns {boolean}
 */
export function matchesFilter(cardPaths, filterPath) {
  if (!filterPath) return true;
  return cardPaths.some(cp => cp === filterPath || cp.startsWith(filterPath + "/"));
}

/**
 * Build the `t` tag array for a Nostr event from a list of selected paths.
 * Includes parent paths automatically.
 * @param {string[]} selectedPaths
 * @returns {string[][]}
 */
export function buildCategoryTags(selectedPaths) {
  const tags = [];
  const seen = new Set();
  for (const path of selectedPaths) {
    if (!seen.has(path)) {
      tags.push(["t", path]);
      seen.add(path);
    }
    const parent = getParent(path);
    if (parent && !selectedPaths.includes(parent) && !seen.has(parent)) {
      tags.push(["t", parent]);
      seen.add(parent);
    }
  }
  return tags;
}

/**
 * Extract human category paths (excluding the `sciln-eln` marker) from an event.
 * @param {{tags?:string[][]}} event
 * @returns {string[]}
 */
export function extractCategories(event) {
  return (event.tags || [])
    .filter(t => t[0] === "t" && t[1] !== "sciln-eln")
    .map(t => t[1]);
}
