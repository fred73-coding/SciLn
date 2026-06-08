// src/js/diff.js
// Line-level LCS diff for revision comparison.

import { escapeHtml } from './utils.js';

function splitLines(text) {
    if (!text) return [];
    return String(text).split(/\r?\n/);
}

function buildLCS(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = [];
    for (let i = 0; i <= m; i++) {
        dp.push(new Uint32Array(n + 1));
    }
    for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
            if (a[i] === b[j]) {
                dp[i][j] = dp[i + 1][j + 1] + 1;
            } else {
                dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
            }
        }
    }
    return dp;
}

/**
 * Compute a line-level diff using LCS.
 * @param {string} oldText
 * @param {string} newText
 * @returns {Array<{type:'eq'|'add'|'del', text:string}>}
 */
export function diffLines(oldText, newText) {
    const a = splitLines(oldText);
    const b = splitLines(newText);
    const dp = buildLCS(a, b);
    const out = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            out.push({ type: 'eq', text: a[i] });
            i++;
            j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            out.push({ type: 'del', text: a[i] });
            i++;
        } else {
            out.push({ type: 'add', text: b[j] });
            j++;
        }
    }
    while (i < a.length) {
        out.push({ type: 'del', text: a[i++] });
    }
    while (j < b.length) {
        out.push({ type: 'add', text: b[j++] });
    }
    return out;
}

/**
 * Count adds/dels/same in a diff result.
 * @param {Array<{type:string}>} diff
 * @returns {{adds:number, dels:number, same:number}}
 */
export function summarizeDiff(diff) {
    let adds = 0;
    let dels = 0;
    for (const line of diff) {
        if (line.type === 'add') adds++;
        else if (line.type === 'del') dels++;
    }
    return { adds, dels, same: diff.length - adds - dels };
}

/**
 * Render a diff result as HTML. Lines go through `parseScientificContent`
 * when provided (so $math$ still renders) or plain escaping otherwise.
 * @param {Array<{type:string, text:string}>} diff
 * @param {((text:string) => string)|null} parseScientificContent
 * @returns {string} HTML
 */
export function renderDiffHTML(diff, parseScientificContent) {
    if (!diff || !diff.length) {
        return '<div class="diff-empty text-slate-400 font-mono text-xs">Sin diferencias.</div>';
    }
    const render = (line, type) => {
        const safe = line.length > 0 ? (parseScientificContent ? parseScientificContent(line) : escapeHtml(line)) : '&nbsp;';
        return `<div class="diff-line diff-line-${type}"><span class="diff-marker">${type === 'add' ? '+' : (type === 'del' ? '−' : ' ')}</span><span class="diff-content">${safe}</span></div>`;
    };
    return `<div class="diff-render font-mono">${diff.map(d => render(d.text, d.type)).join('')}</div>`;
}
