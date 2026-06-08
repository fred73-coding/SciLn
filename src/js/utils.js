// src/js/utils.js
// Shared utilities for HTML escaping, title extraction, and formatting.

const HTML_ESCAPES = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
};

/**
 * Escape a string for safe inclusion in HTML body text.
 * @param {*} s
 * @returns {string}
 */
export function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
}

/**
 * Escape a string for safe inclusion in an HTML attribute value.
 * Currently identical to escapeHtml, but kept separate for future divergence
 * (e.g. quote-only escaping when the value is wrapped in single quotes).
 * @param {*} s
 * @returns {string}
 */
export function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
}

/**
 * Extract a human-readable title from a post's markdown content.
 * Looks for the first heading (`# …`, `## …`, etc.); falls back to the
 * first 100 characters of the first line.
 * @param {{content?: string}} event
 * @returns {string}
 */
export function extractTitle(event) {
    if (!event || !event.content) return '(sin título)';
    const lines = event.content.split('\n');
    for (const line of lines) {
        const m = line.match(/^#{1,6}\s+(.+)/);
        if (m) return m[1].trim();
    }
    return lines[0].slice(0, 100);
}

/**
 * Format a duration in milliseconds as a short human-readable age
 * (e.g. "hace unos segundos", "hace 5 min", "hace 2 h", "hace 3 días").
 * @param {number} ms
 * @returns {string}
 */
export function formatDraftAge(ms) {
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return "hace unos segundos";
    if (sec < 3600) return `hace ${Math.floor(sec / 60)} min`;
    if (sec < 86400) return `hace ${Math.floor(sec / 3600)} h`;
    return `hace ${Math.floor(sec / 86400)} días`;
}
