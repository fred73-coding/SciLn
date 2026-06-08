import { parseScientificContent } from '../js/parser.js';
import * as Tags from '../js/tags.js';
import * as Roles from '../js/roles.js';
import { navigate } from '../js/router.js';
import * as Voting from '../js/voting.js';
import * as Comments from '../js/comments.js';
import * as Revisions from '../js/revisions.js';
import * as Bookmarks from '../js/bookmarks.js';
import { diffLines, renderDiffHTML } from '../js/diff.js';
import * as Exporter from '../js/exporter.js';
import { showToast } from '../js/toast.js';
import * as State from '../js/state.js';
import { escapeAttr, extractTitle } from '../js/utils.js';

function getVersionPositionForDetail(eventId, eventCache, amendmentNext) {
    if (Revisions.chains.byEvent.has(eventId)) {
        return Revisions.getVersionNumber(eventId, eventCache);
    }
    const cur = eventCache.get(eventId);
    if (!cur) return 1;
    const rt = cur.tags.find(t => t[0] === 'e' && t[3] === 'reply');
    if (!rt) return 1;
    const target = eventCache.get(rt[1]);
    if (!target) return 1;

    const visited = new Set();
    let walker = target;
    let rootId = target.id;
    while (walker && !visited.has(walker.id)) {
        visited.add(walker.id);
        const r = walker.tags.find(t => t[0] === 'e' && t[3] === 'reply');
        if (!r) { rootId = walker.id; break; }
        rootId = walker.id;
        walker = eventCache.get(r[1]);
    }

    let pos = 1;
    let c = rootId;
    const guard = new Set();
    while (c !== eventId && amendmentNext.has(c) && !guard.has(c)) {
        guard.add(c);
        c = amendmentNext.get(c);
        pos++;
        if (pos > 100) break;
    }
    return pos;
}

function getVersionChain(eventId, eventCache, amendmentNext) {
    if (Revisions.chains.byEvent.has(eventId)) {
        const meta = Revisions.chains.byEvent.get(eventId);
        if (meta.type === 'linear' || meta.type === 'root') {
            return Revisions.getChain(meta.rootId);
        }
        if (meta.type === 'fork' || meta.type === 'fork-rev' || meta.type === 'fork-root') {
            return Revisions.getForkChain(meta.forkRoot || eventId);
        }
    }
    const cur = eventCache.get(eventId);
    if (!cur) return [];
    const rt = cur.tags.find(t => t[0] === 'e' && t[3] === 'reply');
    if (!rt) return [eventId];
    const target = eventCache.get(rt[1]);
    if (!target) return [eventId];

    const visited = new Set();
    let walker = target;
    let rootId = target.id;
    while (walker && !visited.has(walker.id)) {
        visited.add(walker.id);
        const r = walker.tags.find(t => t[0] === 'e' && t[3] === 'reply');
        if (!r) { rootId = walker.id; break; }
        rootId = walker.id;
        walker = eventCache.get(r[1]);
    }

    const chain = [rootId];
    let c = rootId;
    const guard = new Set();
    while (amendmentNext.has(c) && !guard.has(c)) {
        guard.add(c);
        c = amendmentNext.get(c);
        chain.push(c);
        if (chain.length > 100) break;
    }
    return chain;
}

export function renderPostDetail(eventId, eventCache, cachePerfiles, session, network) {
    State.set('currentPostId', eventId);
    const container = document.getElementById('post-detail-container');
    container.innerHTML = '<div class="bg-white p-6 rounded-xl shadow border border-slate-200 text-center text-slate-400 font-mono text-xs">Cargando publicación...</div>';

    const event = eventCache.get(eventId);
    if (!event) return;

    const autor = cachePerfiles[event.pubkey] || {};
    const fecha = new Date(event.created_at * 1000).toLocaleString();
    const cats = Tags.extractCategories(event);
    const avatarUrl = autor.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${event.pubkey}`;
    const displayName = autor.display_name || autor.name || `Científico...${event.pubkey.substring(0, 6)}`;
    const roleIcon = Roles.getRoleIcon(autor.role_category);
    const roleLabel = Roles.getRoleLabel(autor.role_category);

    const badges = cats.map(c => {
        const label = Tags.getLabel(c);
        const icon = Tags.getIcon(c);
        return `<span class="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border ${Tags.getCategoryBadgeClass(c)}">${icon}${label}</span>`;
    }).join("");

    const roleParts = [];
    if (autor.role_category) roleParts.push(`${roleIcon} ${autor.position || roleLabel}`);
    if (autor.institution) roleParts.push(`🏛️ ${autor.institution}`);
    if (autor.location) roleParts.push(`📍 ${autor.location}`);
    const roleLine = roleParts.length ? roleParts.join(" · ") : "";

    const replyTag = event.tags.find(t => t[0] === 'e' && t[3] === 'reply');
    const revisionTag = event.tags.find(t => t[0] === 'e' && t[3] === 'revision');
    const isNewRevision = !!(revisionTag || event.kind === 30211);
    const parentTag = isNewRevision ? revisionTag : replyTag;
    const originalEvent = parentTag ? eventCache.get(parentTag[1]) : null;
    const amendmentNext = State.get('amendmentNext') || new Map();
    const isFork = !!(parentTag && originalEvent && originalEvent.pubkey !== event.pubkey);

    const isOwn = session && event.pubkey === session.pk;
    const score = Voting.getScore(event.id);
    const userVote = session ? Voting.getUserVote(event.id, session.pk) : null;
    const upColor = userVote === '+' ? 'text-green-500' : 'text-slate-400';
    const downColor = userVote === '-' ? 'text-red-500' : 'text-slate-400';

    const commentCount = Comments.getComments(event.id).length;
    const commitMessage = Revisions.getCommitMessage(event) || '';

    const isNewChain = Revisions.chains.byEvent.has(eventId);
    const versionChain = isNewChain ? getVersionChain(eventId, eventCache, amendmentNext) : [];
    const currentIdx = versionChain.indexOf(eventId);
    const prevId = currentIdx > 0 ? versionChain[currentIdx - 1] : null;
    const nextId = currentIdx >= 0 && currentIdx < versionChain.length - 1 ? versionChain[currentIdx + 1] : null;
    const rootId = isNewChain ? Revisions.getRootIdForEvent(eventId) : (originalEvent?.id || eventId);
    const canonicalId = isNewChain ? Revisions.getCanonicalVersion(rootId) : null;
    const isCanonical = canonicalId === eventId;
    const isPromotedFork = isCanonical && isNewChain && (
        Revisions.chains.byEvent.get(eventId)?.type === 'fork' ||
        Revisions.chains.byEvent.get(eventId)?.type === 'fork-rev'
    );
    const versionNum = isNewChain ? Revisions.getVersionNumber(eventId, eventCache) : (replyTag ? getVersionPositionForDetail(eventId, eventCache, amendmentNext) : 1);

    let amendmentBadge = "";
    if (parentTag) {
        if (isFork) {
            const origAuthor = originalEvent ? (cachePerfiles[originalEvent.pubkey] || {}) : {};
            const origName = origAuthor.display_name || origAuthor.name || (originalEvent ? `Científico...${originalEvent.pubkey.substring(0,6)}` : "autor");
            amendmentBadge = `<span class="amendment-badge fork-badge inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border bg-violet-100 text-violet-700 border-violet-200" title="Fork de ${escapeAttr(origName)}">🔀 fork de ${escapeAttr(origName)}</span>`;
        } else {
            amendmentBadge = `<span class="amendment-badge version-badge inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border bg-amber-100 text-amber-700 border-amber-200">📝 ${isNewRevision ? `Revisión v${versionNum}` : `Enmienda v${versionNum}`}</span>`;
        }
    }
    if (isPromotedFork) {
        amendmentBadge += ` <span class="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border promoted-badge bg-emerald-100 text-emerald-700 border-emerald-200" title="Fork con más votos que el original">✨ promovida</span>`;
    }
    if (isCanonical && !isPromotedFork && isNewChain) {
        amendmentBadge += ` <span class="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border bg-emerald-100 text-emerald-700 border-emerald-200">CANÓNICA</span>`;
    }

    const chainSelectId = 'revision-compare-select';
    const chainOptions = isNewChain && versionChain.length > 1
        ? `<div class="flex items-center gap-2 my-3 p-2 bg-slate-50 border border-slate-200 rounded-lg flex-wrap">
            <span class="text-[10px] font-mono text-slate-500 font-bold">Comparar con:</span>
            <select id="${chainSelectId}" class="text-[10px] font-mono p-1 border border-slate-200 rounded">
                ${prevId ? `<option value="${prevId}">v${Revisions.getVersionNumber(prevId, eventCache)} (anterior)</option>` : ''}
                ${canonicalId && canonicalId !== eventId && canonicalId !== prevId ? `<option value="${canonicalId}" selected>v${Revisions.getVersionNumber(canonicalId, eventCache)} (canónica)</option>` : ''}
                ${nextId ? `<option value="${nextId}">v${Revisions.getVersionNumber(nextId, eventCache)} (siguiente)</option>` : ''}
            </select>
            <button id="btn-show-diff" class="text-[10px] font-mono bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-0.5 rounded">Ver diff</button>
        </div>
        <div id="diff-container" class="my-3"></div>`
        : '';

    let html = `
        <div class="bg-white rounded-xl shadow border border-slate-200 overflow-hidden ${isCanonical ? 'canonical-card' : ''}">
            <div class="flex">
                <div class="vote-column flex flex-col items-center gap-0.5 px-3 py-4 bg-slate-50/50 shrink-0 border-r border-slate-100" data-vote-target="${event.id}">
                    <button class="vote-up text-sm leading-none ${upColor} hover:text-green-600 transition vote-btn" data-vote="up">▲</button>
                    <span class="vote-score text-sm font-bold font-mono text-slate-700">${score}</span>
                    <button class="vote-down text-sm leading-none ${downColor} hover:text-red-500 transition vote-btn" data-vote="down">▼</button>
                </div>
                <div class="flex-1 min-w-0 p-5 space-y-4">
                    ${isNewChain && versionChain.length > 1 ? `
                    <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                        <button class="revision-nav-btn" id="btn-prev-version" ${!prevId ? 'disabled' : ''} data-event-id="${prevId || ''}">← v${prevId ? Revisions.getVersionNumber(prevId, eventCache) : '—'}</button>
                        <span class="text-[10px] font-mono text-slate-500 font-bold">v${versionNum} de ${versionChain.length}</span>
                        <button class="revision-nav-btn" id="btn-next-version" ${!nextId ? 'disabled' : ''} data-event-id="${nextId || ''}">v${nextId ? Revisions.getVersionNumber(nextId, eventCache) : '—'} →</button>
                    </div>` : ''}
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <img src="${avatarUrl}" class="w-12 h-12 rounded-full border-2 border-slate-200 cursor-pointer hover:opacity-80 profile-link" data-pubkey="${event.pubkey}">
                            <div>
                                <div class="flex items-center gap-2">
                                    <span class="font-bold text-slate-800 text-sm cursor-pointer hover:text-indigo-600 profile-link" data-pubkey="${event.pubkey}">${displayName}</span>
                                    ${isOwn ? '<span class="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">tú</span>' : ''}
                                </div>
                                ${roleLine ? `<div class="text-[10px] text-slate-500">${roleLine}</div>` : ''}
                                <div class="text-[9px] text-slate-400 font-mono mt-0.5">⏱️ ${fecha} · 💬 ${commentCount}</div>
                            </div>
                        </div>
                        <div class="flex gap-1 flex-wrap max-w-[40%] justify-end">${badges}${amendmentBadge}</div>
                    </div>
                    ${commitMessage ? `<div class="text-[10px] font-mono text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">📝 ${escapeAttr(commitMessage)}</div>` : ''}
                    <div class="prose prose-slate max-w-none text-sm">${parseScientificContent(event.content)}</div>
                    ${chainOptions}
                    <div class="flex gap-2 border-t border-slate-100 pt-3 flex-wrap">
                        ${parentTag && originalEvent ? `<button data-navigate="${originalEvent.id}" class="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold px-3 py-1.5 rounded transition">📜 Ver original</button>` : ''}
                        ${canonicalId && canonicalId !== eventId ? `<button data-navigate="${canonicalId}" class="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-3 py-1.5 rounded transition">✨ Ver canónica</button>` : ''}
                        ${!isOwn ? `<button data-pubkey="${event.pubkey}" class="view-profile-btn text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold px-3 py-1.5 rounded transition">👤 Ver Perfil Completo</button>` : ''}
                        <button data-edit-id="${event.id}" class="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold px-3 py-1.5 rounded transition">📝 Registrar Enmienda</button>
                        ${isOwn && isNewChain && prevId ? `<button id="btn-rollback" data-target-id="${prevId}" class="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-3 py-1.5 rounded transition">↩️ Rollback a v${Revisions.getVersionNumber(prevId, eventCache)}</button>` : ''}
                        <button id="btn-export-md" data-event-id="${event.id}" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded transition">📥 Markdown</button>
                        <button id="btn-export-thread-md" data-event-id="${event.id}" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded transition">📥 Hilo .md</button>
                        <button id="btn-print-post" data-event-id="${event.id}" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded transition">🖨️ PDF</button>
                        <button id="btn-bookmark-detail" data-event-id="${event.id}" class="text-xs ${Bookmarks.isBookmarked(event.id) ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'} font-bold px-3 py-1.5 rounded transition" title="Guardar en bookmarks">${Bookmarks.isBookmarked(event.id) ? '★ Guardado' : '☆ Guardar'}</button>
                    </div>
                </div>
            </div>
        </div>
        <div id="post-revisions-timeline" class="mt-4"></div>
        <div id="post-replies" class="space-y-3 mt-4"></div>
        <div id="post-comments-section" class="space-y-4 mt-4"></div>
    `;

    container.innerHTML = html;

    container.querySelectorAll('.profile-link').forEach(el => {
        el.addEventListener('click', () => {
            const pk = el.dataset.pubkey;
            if (session && pk === session.pk) { navigate('#/my-lab'); return; }
            navigate(`#/profile/${pk}`);
        });
    });

    container.querySelectorAll('[data-edit-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const eid = btn.dataset.editId;
            const ev = eventCache.get(eid);
            if (ev) {
                State.set('amendmentData', { id: eid, content: ev.content });
                navigate('#/editor');
            }
        });
    });

    container.querySelectorAll('.view-profile-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            navigate(`#/profile/${btn.dataset.pubkey}`);
        });
    });

    container.querySelectorAll('.vote-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            voteButtonHandler(eventId, btn.dataset.vote);
        });
    });

    container.querySelectorAll('[data-navigate]').forEach(el => {
        el.addEventListener('click', () => {
            navigate(`#/post/${el.dataset.navigate}`);
        });
    });

    const prevBtn = container.querySelector('#btn-prev-version');
    if (prevBtn && prevBtn.dataset.eventId) {
        prevBtn.addEventListener('click', () => navigate(`#/post/${prevBtn.dataset.eventId}`));
    }
    const nextBtn = container.querySelector('#btn-next-version');
    if (nextBtn && nextBtn.dataset.eventId) {
        nextBtn.addEventListener('click', () => navigate(`#/post/${nextBtn.dataset.eventId}`));
    }
    const rollbackBtn = container.querySelector('#btn-rollback');
    if (rollbackBtn) {
        rollbackBtn.addEventListener('click', () => {
            const target = eventCache.get(rollbackBtn.dataset.targetId);
            if (!target) return;
            State.set('amendmentData', { id: eventId, content: target.content });
            State.set('rollbackTarget', { id: target.id, content: target.content });
            showToast(`Rollback listo: confirma el resumen para restaurar v${Revisions.getVersionNumber(target.id, eventCache)}`, "info");
            navigate('#/editor');
        });
    }

    const exportMdBtn = container.querySelector('#btn-export-md');
    if (exportMdBtn) {
        exportMdBtn.addEventListener('click', () => {
            const author = cachePerfiles[event.pubkey] || {};
            const ok = Exporter.downloadPostMarkdown(event, author);
            if (ok) showToast('📥 Markdown descargado', 'success');
        });
    }
    const exportThreadBtn = container.querySelector('#btn-export-thread-md');
    if (exportThreadBtn) {
        exportThreadBtn.addEventListener('click', () => {
            const rootId = Revisions.getRootIdForEvent(eventId) || eventId;
            const ok = Exporter.downloadThreadMarkdown(rootId, eventCache, cachePerfiles, session);
            if (ok) showToast('📥 Hilo descargado', 'success');
        });
    }
    const printBtn = container.querySelector('#btn-print-post');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            const ok = Exporter.printElement(container, extractTitle(event));
            if (ok) showToast('🖨️ Abriendo diálogo de impresión…', 'info');
        });
    }
    const bookmarkBtn = container.querySelector('#btn-bookmark-detail');
    if (bookmarkBtn) {
        bookmarkBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = bookmarkBtn.dataset.eventId;
            const nowStarred = await Bookmarks.toggle(id);
            if (nowStarred) {
                bookmarkBtn.className = 'text-xs bg-amber-100 text-amber-700 hover:bg-amber-200 font-bold px-3 py-1.5 rounded transition';
                bookmarkBtn.textContent = '★ Guardado';
                showToast('⭐ Guardado en bookmarks', 'success');
            } else {
                bookmarkBtn.className = 'text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded transition';
                bookmarkBtn.textContent = '☆ Guardar';
                showToast('Quitado de bookmarks', 'info');
            }
            document.querySelectorAll(`[data-bookmark-id="${id}"]`).forEach(other => {
                if (other === bookmarkBtn) return;
                other.textContent = Bookmarks.isBookmarked(id) ? '★' : '☆';
            });
            if (nowStarred && session) {
                Bookmarks.publishToRelay(network, session).catch(err => console.warn('bookmarks publish failed:', err));
            }
        });
    }

    if (isNewChain && versionChain.length > 1) {
        const selectEl = container.querySelector(`#${chainSelectId}`);
        const diffContainer = container.querySelector('#diff-container');
        const showDiffBtn = container.querySelector('#btn-show-diff');
        const renderDiff = () => {
            if (!selectEl || !diffContainer) return;
            const compareId = selectEl.value;
            if (!compareId) { diffContainer.innerHTML = ''; return; }
            const compareEv = eventCache.get(compareId);
            if (!compareEv) { diffContainer.innerHTML = ''; return; }
            const diff = diffLines(compareEv.content || '', event.content || '');
            diffContainer.innerHTML = `
                <div class="text-[10px] font-mono text-slate-500 mb-1">DIFF: v${Revisions.getVersionNumber(compareId, eventCache)} → v${versionNum}</div>
                ${renderDiffHTML(diff, parseScientificContent)}
            `;
        };
        if (showDiffBtn) showDiffBtn.addEventListener('click', renderDiff);
        if (selectEl) selectEl.addEventListener('change', renderDiff);
        renderDiff();
        renderTimelineSection(rootId, eventId, eventCache, cachePerfiles);
    } else if (!isFork && replyTag) {
        renderPreviousVersionsSection(eventId, eventCache, cachePerfiles, amendmentNext);
    }

    const replies = findReplies(eventId, eventCache);
    renderReplies(replies, eventCache, cachePerfiles);

    renderCommentsSection(eventId, cachePerfiles, network);
}

function renderTimelineSection(rootId, currentEventId, eventCache, cachePerfiles) {
    const container = document.getElementById('post-revisions-timeline');
    if (!container) return;
    const linear = Revisions.getChain(rootId);
    const forks = Revisions.getForks(rootId);
    if (linear.length < 2 && forks.length === 0) return;
    const canonicalId = Revisions.getCanonicalVersion(rootId);

    const buildRow = (id, isFork) => {
        const ev = eventCache.get(id);
        if (!ev) return '';
        const autor = cachePerfiles[ev.pubkey] || {};
        const name = autor.display_name || autor.name || `Científico...${ev.pubkey.substring(0,6)}`;
        const fecha = new Date(ev.created_at * 1000).toLocaleString();
        const commit = Revisions.getCommitMessage(ev) || '—';
        const ver = Revisions.getVersionNumber(id, eventCache);
        const score = Voting.getScore(id);
        const isCurrent = id === currentEventId;
        const isCan = id === canonicalId;
        const dotClass = isFork ? 'fork' : (isCan ? 'canonical' : '');
        const colorClass = isFork ? 'text-violet-700' : (isCan ? 'text-emerald-700' : 'text-amber-700');
        const preview = (ev.content || '').replace(/[\r\n]+/g, ' ').slice(0, 100);
        return `<button data-navigate="${id}" class="timeline-item w-full text-left flex items-start gap-2 py-2 px-2 rounded transition ${isCurrent ? 'bg-indigo-50' : 'hover:bg-slate-50'}">
            <span class="timeline-item-dot ${dotClass}"></span>
            <span class="flex-1 min-w-0">
                <span class="flex items-center gap-2 text-[10px] font-mono">
                    <span class="font-bold ${colorClass}">${isFork ? '🔀 fork v' : 'v'}${ver}</span>
                    <span class="text-slate-600 truncate">${escapeAttr(name)}</span>
                    <span class="text-slate-400">· ${fecha}</span>
                    <span class="ml-auto text-slate-500">${score >= 0 ? '+' : ''}${score}</span>
                    ${isCan ? '<span class="text-emerald-600 font-bold">CANÓNICA</span>' : ''}
                    ${isCurrent ? '<span class="text-indigo-600 font-bold">ACTUAL</span>' : ''}
                </span>
                <span class="text-[10px] text-slate-500 font-mono truncate block">📝 ${escapeAttr(commit)}</span>
                <span class="text-[10px] text-slate-400 truncate block">${escapeAttr(preview)}</span>
            </span>
        </button>`;
    };

    let html = `<div class="bg-white rounded-xl shadow border border-slate-200 p-4">
        <h3 class="text-xs font-bold font-mono text-slate-500 mb-3 tracking-wider">🕓 HISTORIAL DE REVISIONES (${linear.length} versión${linear.length === 1 ? '' : 'es'} · ${forks.length} fork${forks.length === 1 ? '' : 's'})</h3>
        <div class="timeline">`;
    linear.forEach(id => { html += buildRow(id, false); });
    forks.forEach(fr => {
        const chain = Revisions.getForkChain(fr);
        const forkEv = eventCache.get(fr);
        const autor = cachePerfiles[forkEv?.pubkey || ''] || {};
        const name = autor.display_name || autor.name || 'fork';
        html += `<div class="border-t border-slate-200 my-2 pt-2"><div class="text-[9px] font-mono text-violet-600 mb-1">🔀 fork por ${escapeAttr(name)}</div>`;
        chain.forEach(id => { html += buildRow(id, true); });
        html += '</div>';
    });
    html += '</div></div>';
    container.innerHTML = html;
    container.querySelectorAll('[data-navigate]').forEach(el => {
        el.addEventListener('click', () => navigate(`#/post/${el.dataset.navigate}`));
    });
}

function renderPreviousVersionsSection(eventId, eventCache, cachePerfiles, amendmentNext) {
    const chain = getVersionChain(eventId, eventCache, amendmentNext);
    if (chain.length < 2) return;
    const currentIdx = chain.indexOf(eventId);
    if (currentIdx <= 0) return;
    const previous = chain.slice(0, currentIdx);

    const section = document.createElement('div');
    section.className = 'mt-4 bg-white rounded-xl shadow border border-slate-200 p-4';
    section.innerHTML = `
        <h3 class="text-xs font-bold font-mono text-slate-500 mb-3 tracking-wider">🕓 VERSIONES ANTERIORES (${previous.length})</h3>
        <div class="space-y-2">
            ${previous.map((id, i) => {
                const ev = eventCache.get(id);
                if (!ev) return '';
                const autor = cachePerfiles[ev.pubkey] || {};
                const name = autor.display_name || autor.name || `Científico...${ev.pubkey.substring(0,6)}`;
                const fecha = new Date(ev.created_at * 1000).toLocaleString();
                const preview = (ev.content || '').substring(0, 140).replace(/\n/g, ' ');
                return `<button data-navigate="${id}" class="w-full text-left bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 rounded-lg p-2 transition">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-[10px] font-bold font-mono text-amber-700">📝 v${i + 1}</span>
                        <span class="text-[9px] text-slate-400 font-mono">${fecha} · ${name}</span>
                    </div>
                    <div class="text-[11px] text-slate-600 font-mono line-clamp-2">${escapeAttr(preview)}</div>
                </button>`;
            }).join('')}
        </div>
    `;
    section.querySelectorAll('[data-navigate]').forEach(el => {
        el.addEventListener('click', () => navigate(`#/post/${el.dataset.navigate}`));
    });
    document.getElementById('post-replies').parentNode.insertBefore(section, document.getElementById('post-replies').nextSibling);
}

async function voteButtonHandler(eventId, direction) {
    const s = State.get('session');
    if (!s) { showToast("Debes iniciar sesión para votar", "error"); return; }
    const ec = State.get('eventCache');
    const event = ec.get(eventId);
    if (!event) return;

    const directionStr = Voting.applyVote(eventId, direction, s.pk);
    Voting.updateVoteDisplay(eventId, s?.pk);
    Voting.guardarVoteCache();

    if (directionStr) {
        const voteEvent = Voting.buildVoteEvent(event, directionStr, s);
        const nw = State.get('network');
        if (nw) {
            await nw.sendEvent(7, voteEvent.content, voteEvent.tags, s.pk, s.sk, s.mode);
        }
    }
}

// --- Replies (amendments) ---

function findReplies(eventId, eventCache) {
    const replies = [];
    for (const [id, ev] of eventCache) {
        if (id === eventId) continue;
        if (ev.tags.some(t => t[0] === 'e' && t[1] === eventId && t[3] === 'reply')) {
            replies.push(ev);
        }
    }
    replies.sort((a, b) => a.created_at - b.created_at);
    return replies;
}

function renderReplies(replies, eventCache, cachePerfiles) {
    const repliesContainer = document.getElementById('post-replies');
    if (!replies.length) return;

    repliesContainer.innerHTML = `<div class="text-xs font-bold font-mono text-slate-500 mb-2 tracking-wider">🧵 HILO (${replies.length} enmiendas)</div>`;

    replies.forEach(ev => {
        const autor = cachePerfiles[ev.pubkey] || {};
        const avatarUrl = autor.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${ev.pubkey}`;
        const displayName = autor.display_name || autor.name || `Científico...${ev.pubkey.substring(0, 6)}`;
        const fecha = new Date(ev.created_at * 1000).toLocaleString();
        const cats = Tags.extractCategories(ev);
        const badges = cats.map(c => {
            const label = Tags.getLabel(c);
            const icon = Tags.getIcon(c);
            return `<span class="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border ${Tags.getCategoryBadgeClass(c)}">${icon}${label}</span>`;
        }).join("");

        const s = State.get('session');
        const score = Voting.getScore(ev.id);
        const userVote = s ? Voting.getUserVote(ev.id, s.pk) : null;
        const upColor = userVote === '+' ? 'text-green-500' : 'text-slate-400';
        const downColor = userVote === '-' ? 'text-red-500' : 'text-slate-400';

        const replyEl = document.createElement('div');
        replyEl.className = 'bg-white rounded-xl shadow border border-slate-200 overflow-hidden ml-4 border-l-4 border-l-amber-300';
        replyEl.innerHTML = `
            <div class="flex">
                <div class="vote-column flex flex-col items-center gap-0.5 px-2 py-3 bg-slate-50/50 shrink-0 border-r border-slate-100" data-vote-target="${ev.id}">
                    <button class="vote-up text-xs leading-none ${upColor} hover:text-green-600 transition vote-btn" data-vote="up">▲</button>
                    <span class="vote-score text-xs font-bold font-mono text-slate-700">${score}</span>
                    <button class="vote-down text-xs leading-none ${downColor} hover:text-red-600 transition vote-btn" data-vote="down">▼</button>
                </div>
                <div class="flex-1 min-w-0 p-4 space-y-2">
                    <div class="flex items-center gap-2">
                        <img src="${avatarUrl}" class="w-6 h-6 rounded-full border cursor-pointer hover:opacity-80 reply-author" data-pubkey="${ev.pubkey}">
                        <span class="font-bold text-slate-700 text-[11px] cursor-pointer hover:text-indigo-600 reply-author" data-pubkey="${ev.pubkey}">${displayName}</span>
                        <span class="text-[9px] text-slate-400">⏱️ ${fecha}</span>
                        <div class="flex gap-1 ml-auto">${badges}</div>
                    </div>
                    <div class="prose prose-slate max-w-none text-xs">${parseScientificContent(ev.content)}</div>
                </div>
            </div>
        `;

        replyEl.querySelectorAll('.reply-author').forEach(el => {
            el.addEventListener('click', () => {
                const pk = el.dataset.pubkey;
                const sess = State.get('session');
                if (sess && pk === sess.pk) { navigate('#/my-lab'); return; }
                navigate(`#/profile/${pk}`);
            });
        });

        replyEl.querySelectorAll('.vote-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                voteButtonHandler(ev.id, btn.dataset.vote);
            });
        });

        repliesContainer.appendChild(replyEl);
    });
}

// --- Comments ---

function renderCommentsSection(eventId, cachePerfiles, network) {
    const container = document.getElementById('post-comments-section');
    const comments = Comments.getComments(eventId);
    const { roots, children } = Comments.buildCommentTree(eventId, comments);

    let html = `
        <div class="bg-white rounded-xl shadow border border-slate-200 p-5">
            <h3 class="text-xs font-bold font-mono text-slate-500 mb-3 tracking-wider">💬 COMENTARIOS (${comments.length})</h3>
            <div id="comment-tree" class="space-y-3 mb-4">
    `;

    if (roots.length === 0) {
        html += '<div class="text-center text-slate-400 font-mono text-xs py-4">Sin comentarios aún. ¡Sé el primero en comentar!</div>';
    } else {
        roots.forEach(c => {
            html += renderCommentNode(c, 0, children, cachePerfiles);
        });
    }

    html += `
            </div>
            <div class="border-t border-slate-100 pt-3">
                <textarea id="comment-input" class="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-indigo-500 text-xs font-mono" rows="2" placeholder="Escribe un comentario... (Markdown + LaTeX soportado)"></textarea>
                <div id="comment-preview" class="prose prose-slate max-w-none text-xs mt-2 p-3 bg-white border border-slate-200 rounded-lg hidden"></div>
                <div class="flex justify-between items-center mt-2">
                    <span id="comment-reply-info" class="text-[10px] text-indigo-600 font-mono hidden"></span>
                    <div class="flex items-center gap-2">
                        <button id="btn-toggle-comment-preview" class="text-[10px] text-slate-400 hover:text-slate-600 font-mono border border-slate-200 px-2 py-0.5 rounded">👁️ Previsualizar</button>
                        <button id="btn-submit-comment" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-mono font-bold px-4 py-1.5 rounded transition">Publicar Comentario 🚀</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;

    const commentInput = document.getElementById('comment-input');
    const commentPreview = document.getElementById('comment-preview');
    const togglePreview = document.getElementById('btn-toggle-comment-preview');

    commentInput.addEventListener('input', () => {
        if (!commentPreview.classList.contains('hidden')) {
            const val = commentInput.value.trim();
            commentPreview.innerHTML = val ? parseScientificContent(val) : '';
        }
    });

    togglePreview.addEventListener('click', () => {
        const hidden = commentPreview.classList.toggle('hidden');
        togglePreview.textContent = hidden ? '👁️ Previsualizar' : '👁️ Ocultar';
        if (!hidden) {
            const val = commentInput.value.trim();
            commentPreview.innerHTML = val ? parseScientificContent(val) : '';
        }
    });

    document.getElementById('btn-submit-comment').addEventListener('click', async () => {
        const s = State.get('session');
        const nw = State.get('network');
        const pid = State.get('currentPostId');
        if (!s) { showToast("Debes iniciar sesión para comentar", "error"); return; }
        const input = document.getElementById('comment-input');
        const content = input.value.trim();
        if (!content) return;

        const replyInfo = document.getElementById('comment-reply-info');
        const replyToId = replyInfo.dataset.replyTo || null;

        const commentEvent = Comments.buildCommentEvent(pid, content, replyToId, s);
        const success = await nw.sendEvent(1, content, commentEvent.tags, s.pk, s.sk, s.mode);
        if (success) {
            input.value = '';
            cancelReply();
        }
    });
}

function renderCommentNode(comment, depth, children, cachePerfiles) {
    const maxDepth = 3;
    const indent = Math.min(depth, maxDepth);
    const ml = indent * 4;
    const autor = cachePerfiles[comment.pubkey] || {};
    const avatarUrl = autor.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${comment.pubkey}`;
    const displayName = autor.display_name || autor.name || `Científico...${comment.pubkey.substring(0, 6)}`;
    const fecha = new Date(comment.created_at * 1000).toLocaleString();
    const s = State.get('session');
    const score = Voting.getScore(comment.id);
    const userVote = s ? Voting.getUserVote(comment.id, s.pk) : null;
    const upColor = userVote === '+' ? 'text-green-500' : 'text-slate-400';
    const downColor = userVote === '-' ? 'text-red-500' : 'text-slate-400';

    let html = `
        <div class="relative" style="margin-left: ${ml}px" data-comment-id="${comment.id}">
            <div class="bg-slate-50 border border-slate-200 rounded-lg p-3 ${depth > 0 ? 'border-l-2 border-l-indigo-200' : ''}">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2" data-vote-target="${comment.id}">
                        <img src="${avatarUrl}" class="w-5 h-5 rounded-full cursor-pointer hover:opacity-80 comment-author" data-pubkey="${comment.pubkey}">
                        <span class="font-bold text-slate-600 text-[10px] cursor-pointer hover:text-indigo-600 comment-author" data-pubkey="${comment.pubkey}">${displayName}</span>
                        <span class="text-[8px] text-slate-400">${fecha}</span>
                    </div>
                    <div class="flex items-center gap-2" data-vote-target="${comment.id}">
                        <div class="flex items-center gap-0.5">
                            <button class="vote-up text-[9px] leading-none ${upColor} hover:text-green-600 transition vote-btn" data-vote="up">▲</button>
                            <span class="vote-score text-[10px] font-bold font-mono text-slate-600 min-w-[1.2em] text-center">${score}</span>
                            <button class="vote-down text-[9px] leading-none ${downColor} hover:text-red-600 transition vote-btn" data-vote="down">▼</button>
                        </div>
                        <button class="reply-toggle text-[9px] text-indigo-500 hover:text-indigo-700 font-mono font-bold" data-comment-id="${comment.id}">💬 Responder</button>
                    </div>
                </div>
                <div class="prose prose-slate max-w-none text-xs mt-1">${parseScientificContent(comment.content)}</div>
                <div class="reply-form-${comment.id} hidden mt-2">
                    <textarea class="reply-textarea w-full p-2 bg-white border border-slate-200 rounded text-xs font-mono" rows="1" placeholder="Escribe tu respuesta..."></textarea>
                    <div class="reply-preview-${comment.id} prose prose-slate max-w-none text-xs mt-1 p-2 bg-white border border-slate-200 rounded hidden"></div>
                    <div class="flex gap-1 mt-1">
                        <button class="reply-preview-toggle text-[9px] text-slate-400 hover:text-slate-600 font-mono border border-slate-200 px-1.5 py-0.5 rounded" data-parent="${comment.id}">👁️</button>
                        <button class="reply-submit text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-0.5 rounded font-bold" data-parent="${comment.id}">Enviar</button>
                        <button class="reply-cancel text-[10px] text-slate-400 hover:text-slate-600 px-2 py-0.5">Cancelar</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const childComments = children[comment.id] || [];
    childComments.forEach(child => {
        html += renderCommentNode(child, depth + 1, children, cachePerfiles);
    });

    return html;
}

document.addEventListener('input', (e) => {
    const textarea = e.target.closest('.reply-textarea');
    if (textarea) {
        const form = textarea.closest('[class*="reply-form-"]');
        const preview = form.querySelector('[class*="reply-preview-"]');
        if (preview && !preview.classList.contains('hidden')) {
            preview.innerHTML = textarea.value.trim() ? parseScientificContent(textarea.value.trim()) : '';
        }
    }
});

document.addEventListener('click', (e) => {
    const replyToggle = e.target.closest('.reply-toggle');
    if (replyToggle) {
        e.preventDefault();
        const commentId = replyToggle.dataset.commentId;
        const form = document.querySelector(`.reply-form-${commentId}`);
        if (form) {
            form.classList.toggle('hidden');
            if (!form.classList.contains('hidden')) {
                form.querySelector('.reply-textarea').focus();
            }
        }
        return;
    }

    const replyPreviewToggle = e.target.closest('.reply-preview-toggle');
    if (replyPreviewToggle) {
        const parentId = replyPreviewToggle.dataset.parent;
        const preview = document.querySelector(`.reply-preview-${parentId}`);
        if (preview) {
            const hidden = preview.classList.toggle('hidden');
            if (!hidden) {
                const form = replyPreviewToggle.closest('[class*="reply-form-"]');
                const textarea = form.querySelector('.reply-textarea');
                preview.innerHTML = textarea.value.trim() ? parseScientificContent(textarea.value.trim()) : '';
            }
        }
        return;
    }

    const replyCancel = e.target.closest('.reply-cancel');
    if (replyCancel) {
        const form = replyCancel.closest('[class*="reply-form-"]');
        if (form) form.classList.add('hidden');
        return;
    }

    const replySubmit = e.target.closest('.reply-submit');
    if (replySubmit) {
        const s = State.get('session');
        const nw = State.get('network');
        const pid = State.get('currentPostId');
        if (!s) { showToast("Debes iniciar sesión para comentar", "error"); return; }
        const parentId = replySubmit.dataset.parent;
        const form = replySubmit.closest('[class*="reply-form-"]');
        const textarea = form.querySelector('.reply-textarea');
        const content = textarea.value.trim();
        if (!content) return;

        const commentEvent = Comments.buildCommentEvent(pid, content, parentId, s);
        nw.sendEvent(1, content, commentEvent.tags, s.pk, s.sk, s.mode).then(success => {
            if (success) {
                textarea.value = '';
                form.classList.add('hidden');
            }
        });
        return;
    }

    const commentAuthor = e.target.closest('.comment-author');
    if (commentAuthor) {
        const pk = commentAuthor.dataset.pubkey;
        const sess = State.get('session');
        if (sess && pk === sess.pk) { navigate('#/my-lab'); return; }
        navigate(`#/profile/${pk}`);
        return;
    }

    const voteBtn = e.target.closest('.vote-btn');
    if (voteBtn && voteBtn.closest('#post-comments-section')) {
        const voteTarget = voteBtn.closest('[data-vote-target]');
        if (voteTarget) {
            voteButtonHandler(voteTarget.dataset.voteTarget, voteBtn.dataset.vote);
        }
    }
});

function cancelReply() {
    const info = document.getElementById('comment-reply-info');
    if (info) {
        info.classList.add('hidden');
        info.dataset.replyTo = '';
        info.textContent = '';
    }
}
