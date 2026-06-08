import * as Revisions from '../js/revisions.js';
import { parseScientificContent } from '../js/parser.js';
import * as Voting from '../js/voting.js';
import * as Bookmarks from '../js/bookmarks.js';
import * as State from '../js/state.js';
import { escapeHtml } from '../js/utils.js';

export function initLabTabs() {
    const tabs = document.querySelectorAll('.lab-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.labtab;
            tabs.forEach(t => {
                const isActive = t.dataset.labtab === target;
                t.classList.toggle('border-indigo-600', isActive);
                t.classList.toggle('text-indigo-600', isActive);
                t.classList.toggle('font-bold', isActive);
                t.classList.toggle('border-transparent', !isActive);
                t.classList.toggle('text-slate-500', !isActive);
            });
            document.querySelectorAll('.lab-content').forEach(el => {
                el.classList.toggle('hidden', el.id !== `lab-${target}`);
            });
            const s = State.get('session');
            const ec = State.get('eventCache');
            const cp = State.get('cachePerfiles') || {};
            const nw = State.get('network');
            if (s && target === 'revisions') renderRevisionsTab(ec, cp, s);
            if (s && target === 'bookmarks') renderBookmarksTab(ec, cp, s, nw);
        });
    });
}

export function renderRevisionsTab(eventCache, cachePerfiles, session) {
    const container = document.getElementById('lab-revisions');
    if (!container) return;
    const groups = new Map();
    for (const [, ev] of eventCache) {
        if (ev.pubkey !== session.pk) continue;
        if (Revisions.isLegacyAmendmentEvent(ev)) continue;
        if (Revisions.isRevisionEvent(ev)) continue;
        if (!Revisions.getChain(ev.id).length && !Revisions.getForks(ev.id).length) {
            if (!groups.has(ev.id)) groups.set(ev.id, { root: ev, linear: [], forks: [] });
        }
    }
    for (const [id, meta] of Revisions.chains.byEvent) {
        if (meta.author !== session.pk) continue;
        if (meta.type === 'linear' || meta.type === 'root') {
            const rootEv = eventCache.get(meta.rootId);
            if (!rootEv || rootEv.pubkey !== session.pk) continue;
            if (!groups.has(meta.rootId)) groups.set(meta.rootId, { root: rootEv, linear: [], forks: [] });
            groups.get(meta.rootId).linear.push(id);
        }
    }
    for (const [rootId, forkIds] of Revisions.chains.forks) {
        const rootEv = eventCache.get(rootId);
        if (!rootEv || rootEv.pubkey !== session.pk) continue;
        if (!groups.has(rootId)) groups.set(rootId, { root: rootEv, linear: [], forks: [] });
        for (const fr of forkIds) {
            const chain = Revisions.getForkChain(fr);
            const forkEv = eventCache.get(fr);
            const forkAuthor = cachePerfiles[forkEv?.pubkey] || {};
            groups.get(rootId).forks.push({ forkRoot: fr, chain, author: forkAuthor });
        }
    }
    for (const g of groups.values()) {
        g.linear.sort((a, b) => (eventCache.get(a)?.created_at || 0) - (eventCache.get(b)?.created_at || 0));
    }

    if (groups.size === 0) {
        container.innerHTML = '<div class="text-center text-slate-400 font-mono text-xs py-8">Sin publicaciones aún. Crea tu primer post en el editor.</div>';
        return;
    }

    container.innerHTML = Array.from(groups.values()).map(g => {
        const canonicalId = Revisions.getCanonicalVersion(g.root.id);
        const totalRevisions = g.linear.length;
        const totalForks = g.forks.length;
        const fechaRoot = new Date(g.root.created_at * 1000).toLocaleString();
        const preview = (g.root.content || '').replace(/\n+/g, ' ').slice(0, 200);
        return `<div class="bg-white rounded-xl shadow border border-slate-200 p-4 space-y-3">
            <div class="flex items-center justify-between">
                <div>
                    <div class="text-[10px] text-slate-400 font-mono">📌 Post original · ${fechaRoot}</div>
                    <div class="text-xs font-bold text-slate-700 font-mono">${totalRevisions} revisión${totalRevisions === 1 ? '' : 'es'} · ${totalForks} fork${totalForks === 1 ? '' : 's'}</div>
                </div>
                <div class="flex gap-1">
                    <button data-action="open-version" data-event-id="${g.root.id}" class="text-[10px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded">Ver post</button>
                </div>
            </div>
            <div class="text-[10px] text-slate-500 font-mono line-clamp-2">${escapeHtml(preview)}</div>
            ${g.linear.length > 1 ? `<div class="border-t border-slate-100 pt-2">
                <div class="text-[9px] font-mono text-slate-400 mb-1 tracking-wider">REVISIONES (${g.linear.length - 1})</div>
                ${g.linear.slice(1).map(id => {
                    const ev = eventCache.get(id);
                    if (!ev) return '';
                    const ver = Revisions.getVersionNumber(id, eventCache);
                    const commit = Revisions.getCommitMessage(ev) || '—';
                    const score = Voting.getScore(id);
                    const isCanonical = id === canonicalId;
                    const fecha = new Date(ev.created_at * 1000).toLocaleString();
                    return `<div class="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-50 ${isCanonical ? 'bg-emerald-50' : ''}">
                        <span class="text-[10px] font-mono font-bold ${isCanonical ? 'text-emerald-700' : 'text-amber-700'}">v${ver}</span>
                        <span class="text-[10px] text-slate-600 font-mono flex-1 truncate">📝 ${escapeHtml(commit)}</span>
                        <span class="text-[9px] text-slate-400 font-mono">${fecha}</span>
                        <span class="text-[10px] font-mono ${score >= 0 ? 'text-green-600' : 'text-red-500'}">${score >= 0 ? '+' : ''}${score}</span>
                        ${isCanonical ? '<span class="text-[9px] font-mono text-emerald-700 font-bold">CANÓNICA</span>' : ''}
                        <button data-action="open-version" data-event-id="${id}" class="text-[9px] text-indigo-600 hover:underline">Ver</button>
                    </div>`;
                }).join('')}
            </div>` : ''}
            ${g.forks.length > 0 ? `<div class="border-t border-slate-100 pt-2">
                <div class="text-[9px] font-mono text-slate-400 mb-1 tracking-wider">FORKS RECIBIDOS (${g.forks.length})</div>
                ${g.forks.map(f => {
                    const latestForkId = f.chain[f.chain.length - 1];
                    const latestForkEv = eventCache.get(latestForkId);
                    const forkAuthor = f.author;
                    const forkName = forkAuthor.display_name || forkAuthor.name || 'Anónimo';
                    const forkScore = Voting.getScore(latestForkId);
                    const isCanonical = latestForkId === canonicalId;
                    return `<div class="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-50 ${isCanonical ? 'bg-emerald-50' : ''}">
                        <span class="text-[10px] font-mono text-violet-700 font-bold">🔀 ${escapeHtml(forkName)}</span>
                        <span class="text-[10px] text-slate-500 font-mono flex-1 truncate">${f.chain.length} versión${f.chain.length === 1 ? '' : 'es'}</span>
                        <span class="text-[10px] font-mono ${forkScore >= 0 ? 'text-green-600' : 'text-red-500'}">${forkScore >= 0 ? '+' : ''}${forkScore}</span>
                        ${isCanonical ? '<span class="text-[9px] font-mono text-emerald-700 font-bold">✨ PROMOVIDO</span>' : ''}
                        <button data-action="open-version" data-event-id="${latestForkId}" class="text-[9px] text-indigo-600 hover:underline">Ver fork</button>
                    </div>`;
                }).join('')}
            </div>` : ''}
        </div>`;
    }).join('');

    container.querySelectorAll('[data-action="open-version"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.hash = `#/post/${btn.dataset.eventId}`;
        });
    });
}

export function renderBookmarksTab(eventCache, cachePerfiles, session, network) {
    const container = document.getElementById('lab-bookmarks-list');
    if (!container) return;
    const info = document.getElementById('lab-bookmarks-info');
    const publishBtn = document.getElementById('btn-publish-bookmarks');
    const ids = Bookmarks.list();
    if (info) info.textContent = `${ids.length} guardado${ids.length === 1 ? '' : 's'}`;
    if (publishBtn) {
        const newBtn = publishBtn.cloneNode(true);
        publishBtn.parentNode.replaceChild(newBtn, publishBtn);
        newBtn.addEventListener('click', async () => {
            if (!session || !session.pk) return;
            try {
                newBtn.disabled = true;
                newBtn.textContent = 'Sincronizando...';
                const ok = await Bookmarks.publishToRelay(network, session);
                if (ok) {
                    newBtn.textContent = '✓ Sincronizado';
                    setTimeout(() => { newBtn.textContent = '☁️ Sincronizar al relay'; newBtn.disabled = false; }, 2500);
                } else {
                    newBtn.textContent = 'Error al firmar';
                    setTimeout(() => { newBtn.textContent = '☁️ Sincronizar al relay'; newBtn.disabled = false; }, 2500);
                }
            } catch (e) {
                console.error('bookmarks publish error', e);
                newBtn.textContent = 'Error';
                setTimeout(() => { newBtn.textContent = '☁️ Sincronizar al relay'; newBtn.disabled = false; }, 2500);
            }
        });
    }
    if (!ids.length) {
        container.innerHTML = '<div class="text-center text-slate-400 font-mono text-xs py-8">Sin posts guardados. Pulsa ☆ en cualquier post del feed para guardarlo aquí.</div>';
        return;
    }
    const cards = [];
    for (const id of ids) {
        const ev = eventCache.get(id);
        if (!ev) {
            cards.push(`<div class="bg-amber-50 border border-amber-200 rounded-lg p-3 font-mono text-xs text-amber-700">⚠️ Post ${id.substring(0, 12)}... guardado pero no disponible en cache local.</div>`);
            continue;
        }
        const autor = cachePerfiles[ev.pubkey] || {};
        const name = autor.display_name || autor.name || `Científico...${ev.pubkey.substring(0, 6)}`;
        const preview = (ev.content || '').replace(/\n+/g, ' ').slice(0, 200);
        const fecha = new Date(ev.created_at * 1000).toLocaleString();
        const canonicalId = Revisions.getCanonicalVersion(ev.id);
        const score = Voting.getScore(id);
        const isCanonical = id === canonicalId;
        cards.push(`<div class="bg-white rounded-xl shadow border ${isCanonical ? 'border-emerald-200' : 'border-slate-200'} p-4 space-y-2">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="text-amber-500 text-base cursor-pointer hover:scale-110 transition" data-action="unbookmark" data-bookmark-id="${id}" title="Quitar de guardados">★</span>
                    <span class="text-[10px] text-slate-400 font-mono">${fecha}</span>
                    <span class="text-[10px] text-slate-600 font-mono">· ${escapeHtml(name)}</span>
                    <span class="text-[10px] font-mono ${score >= 0 ? 'text-green-600' : 'text-red-500'}">${score >= 0 ? '+' : ''}${score}</span>
                    ${isCanonical ? '<span class="text-[9px] font-mono text-emerald-700 font-bold">CANÓNICA</span>' : ''}
                </div>
                <button data-action="open-bookmark" data-event-id="${id}" class="text-[10px] font-mono bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-2 py-1 rounded">Ver post →</button>
            </div>
            <div class="text-[11px] text-slate-600 font-mono line-clamp-3">${escapeHtml(preview)}</div>
        </div>`);
    }
    container.innerHTML = cards.join('');
    container.querySelectorAll('[data-action="open-bookmark"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.hash = `#/post/${btn.dataset.eventId}`;
        });
    });
    container.querySelectorAll('[data-action="unbookmark"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.bookmarkId;
            await Bookmarks.remove(id);
            const labCount = document.getElementById('lab-bookmarks-count');
            if (labCount) labCount.textContent = Bookmarks.count();
            document.querySelectorAll(`[data-bookmark-id="${id}"]`).forEach(other => {
                other.textContent = '☆';
                other.classList.remove('text-amber-500');
                other.classList.add('text-slate-400');
            });
            renderBookmarksTab(eventCache, cachePerfiles, session, network);
        });
    });
}
