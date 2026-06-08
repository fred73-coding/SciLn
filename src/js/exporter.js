// Exporter - Exporta posts/revisiones/hilos a Markdown y PDF
// Markdown: descarga .md puro con frontmatter YAML
// PDF: window.print() con @media print CSS que oculta chrome y muestra solo .print-area

import { parseScientificContent } from './parser.js';
import { extractTitle } from './utils.js';
import * as Revisions from './revisions.js';
import * as Voting from './voting.js';
import * as Comments from './comments.js';

function escapeYaml(s) {
    if (s == null) return '';
    return String(s).replace(/"/g, '\\"');
}

function getCategoryNames(event) {
    if (!event || !event.tags) return [];
    const out = [];
    for (const tag of event.tags) {
        if (tag[0] === 't' && tag[1] && tag[1] !== 'sciln-eln' && tag[1] !== 'sciln-comment') {
            out.push(tag[1]);
        }
    }
    return out;
}

function formatDate(unix) {
    if (!unix) return 'unknown';
    try {
        return new Date(unix * 1000).toISOString();
    } catch (e) {
        return 'unknown';
    }
}

function displayName(profile, pubkey) {
    if (!profile) return pubkey ? `Científico...${pubkey.substring(0, 6)}` : 'Anónimo';
    return profile.display_name || profile.name || `Científico...${(pubkey || '').substring(0, 6)}`;
}

function buildFrontmatter(meta) {
    const lines = ['---'];
    if (meta.title) lines.push(`title: "${escapeYaml(meta.title)}"`);
    if (meta.author) lines.push(`author: "${escapeYaml(meta.author)}"`);
    if (meta.pubkey) lines.push(`pubkey: "${meta.pubkey}"`);
    if (meta.date) lines.push(`date: ${meta.date}`);
    if (meta.tags && meta.tags.length) lines.push(`tags: [${meta.tags.map(t => `"${escapeYaml(t)}"`).join(', ')}]`);
    if (meta.version) lines.push(`version: ${meta.version}`);
    if (meta.commit) lines.push(`commit: "${escapeYaml(meta.commit)}"`);
    if (typeof meta.canonical === 'boolean') lines.push(`canonical: ${meta.canonical}`);
    if (typeof meta.score === 'number') lines.push(`score: ${meta.score >= 0 ? '+' : ''}${meta.score}`);
    if (meta.id) lines.push(`id: "${meta.id}"`);
    lines.push('---');
    return lines.join('\n');
}

/**
 * Build a standalone Markdown document for a single post, with YAML frontmatter.
 * @param {{id:string, pubkey:string, created_at:number, content:string, tags:string[][]}} event
 * @param {object} profile
 * @returns {string}
 */
export function toStandaloneMarkdown(event, profile) {
    if (!event) return '';
    const title = extractTitle(event);
    const date = formatDate(event.created_at);
    const author = displayName(profile, event.pubkey);
    const tags = getCategoryNames(event);
    const version = Revisions.getVersionNumber ? Revisions.getVersionNumber(event.id, new Map([[event.id, event]])) : 1;
    const score = Voting.getScore ? Voting.getScore(event.id) : 0;
    const commit = Revisions.getCommitMessage ? Revisions.getCommitMessage(event) : '';
    const meta = { title, author, pubkey: event.pubkey, date, tags, version, score, id: event.id, commit };
    const frontmatter = buildFrontmatter(meta);
    return `${frontmatter}\n\n# ${title}\n\n${event.content}\n`;
}

/**
 * Build a Markdown document for a thread: root + revisions + forks + comments.
 * @param {string} rootId
 * @param {Map} eventCache
 * @param {Object<string,object>} cachePerfiles
 * @param {object} session
 * @returns {string}
 */
export function toThreadMarkdown(rootId, eventCache, cachePerfiles, session) {
    if (!rootId) return '';
    const rootEvent = eventCache.get(rootId);
    if (!rootEvent) return '';
    const rootAuthor = cachePerfiles[rootEvent.pubkey] || {};
    const out = [];
    out.push(toStandaloneMarkdown(rootEvent, rootAuthor));
    out.push('\n---\n');
    const linear = Revisions.getChain(rootId);
    const allVersions = [rootId, ...linear];
    for (const id of allVersions) {
        const ev = eventCache.get(id);
        if (!ev || ev.id === rootId) continue;
        const author = cachePerfiles[ev.pubkey] || {};
        const version = Revisions.getVersionNumber(id, eventCache);
        const commit = Revisions.getCommitMessage(ev) || '(sin resumen)';
        out.push(`\n## Revisión v${version}\n\n*por ${displayName(author, ev.pubkey)} — ${formatDate(ev.created_at)}*\n`);
        if (commit) out.push(`> 📝 ${commit}\n`);
        out.push(`\n${ev.content}\n`);
    }
    const forks = Revisions.getForks(rootId);
    if (forks.length) {
        out.push('\n---\n\n# 🔀 Forks\n');
        for (const forkRoot of forks) {
            const chain = Revisions.getForkChain(forkRoot);
            const forkHead = chain[chain.length - 1];
            const headEv = eventCache.get(forkHead);
            if (!headEv) continue;
            const author = cachePerfiles[headEv.pubkey] || {};
            const isCanonical = headEv.id === Revisions.getCanonicalVersion(rootId);
            out.push(`\n## Fork por ${displayName(author, headEv.pubkey)}${isCanonical ? ' ✨ (CANÓNICA)' : ''}\n`);
            out.push(`\n*${chain.length} versión${chain.length === 1 ? '' : 'es'} — ${formatDate(headEv.created_at)}*\n\n`);
            out.push(`${headEv.content}\n`);
        }
    }
    const commentList = Comments.getComments(rootId);
    if (commentList && commentList.length) {
        out.push('\n---\n\n# 💬 Comentarios\n');
        for (const c of commentList) {
            const author = cachePerfiles[c.pubkey] || {};
            out.push(`\n**${displayName(author, c.pubkey)}** — ${formatDate(c.created_at)}\n\n`);
            out.push(`${c.content}\n`);
        }
    }
    return out.join('\n');
}

/**
 * Trigger a browser download for a Markdown string.
 * @param {string} content
 * @param {string} [filename]
 * @returns {boolean} false if content was empty
 */
export function downloadMarkdown(content, filename) {
    if (!content) return false;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'sciln-export.md';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
    return true;
}

function safeFilename(s) {
    if (!s) return 'sciln';
    return String(s)
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 60) || 'sciln';
}

/**
 * Convenience: render `event` to Markdown and trigger download.
 * @param {object} event
 * @param {object} profile
 * @returns {boolean}
 */
export function downloadPostMarkdown(event, profile) {
    const md = toStandaloneMarkdown(event, profile);
    const title = safeFilename(extractTitle(event));
    const dateStr = formatDate(event.created_at).split('T')[0];
    return downloadMarkdown(md, `${dateStr}-${title}.md`);
}

/**
 * Convenience: render the full thread to Markdown and trigger download.
 * @param {string} rootId
 * @param {Map} eventCache
 * @param {Object<string,object>} cachePerfiles
 * @param {object} session
 * @returns {boolean}
 */
export function downloadThreadMarkdown(rootId, eventCache, cachePerfiles, session) {
    const md = toThreadMarkdown(rootId, eventCache, cachePerfiles, session);
    const rootEv = eventCache.get(rootId);
    if (!rootEv) return false;
    const title = safeFilename(extractTitle(rootEv));
    const dateStr = formatDate(rootEv.created_at).split('T')[0];
    return downloadMarkdown(md, `${dateStr}-${title}-thread.md`);
}

/**
 * Clone the given element into a `.print-area` wrapper and call `window.print()`.
 * The `@media print` CSS in `print.css` hides everything except `.print-area`.
 * @param {Element|string} elementOrId
 * @param {string} [title] used as `data-print-title` for the page header
 * @returns {boolean}
 */
export function printElement(elementOrId, title) {
    const el = typeof elementOrId === 'string'
        ? document.getElementById(elementOrId)
        : elementOrId;
    if (!el) return false;
    const printable = el.cloneNode(true);
    printable.classList.add('print-area');
    printable.removeAttribute('hidden');
    printable.removeAttribute('class');
    printable.classList.add('print-area');
    if (title) {
        printable.setAttribute('data-print-title', title);
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'print-wrapper';
    wrapper.appendChild(printable);
    const existing = document.querySelector('.print-wrapper');
    if (existing) existing.remove();
    document.body.appendChild(wrapper);
    setTimeout(() => {
        window.print();
        setTimeout(() => {
            if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
        }, 500);
    }, 50);
    return true;
}
