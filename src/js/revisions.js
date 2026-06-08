// src/js/revisions.js
// Revision chains for SciLn (Kind 30211 + legacy Kind 1 e+reply).
// Maintains linear chains, fork references, and a canonical version per root
// selected by vote score (tiebreak: most recent created_at).

import * as Voting from './voting.js';

export const REVISION_KIND = 30211;

/**
 * Internal state for the revision graph. Maps are mutated as events are
 * registered/rebuilt. Exported for read access by views.
 */
export const chains = {
    /** rootId → ordered eventIds in the linear chain */
    linear: new Map(),
    /** rootId → forkRootId[] */
    forks: new Map(),
    /** forkRootId → ordered eventIds in the fork chain */
    forkChains: new Map(),
    /** rootId → canonical eventId */
    canonical: new Map(),
    /** eventId → { rootId, parentId, type, forkRoot?, author } */
    byEvent: new Map(),
};

function getTagValue(event, name) {
    if (!event || !event.tags) return null;
    const t = event.tags.find(x => x[0] === name);
    return t ? t[1] : null;
}

function isRevisionMarker(tag) {
    return tag && tag[0] === 'e' && tag[3] === 'revision';
}

function isLegacyReplyMarker(tag) {
    return tag && tag[0] === 'e' && tag[3] === 'reply';
}

/**
 * @param {{kind:number, tags:string[][]}|null} event
 * @returns {boolean} true if `event` is a revision (Kind 30211 or Kind 1 with e+revision marker)
 */
export function isRevisionEvent(event) {
    if (!event || !event.tags) return false;
    if (event.kind === REVISION_KIND) return true;
    if (event.kind === 1 && event.tags.some(isRevisionMarker)) return true;
    return false;
}

/**
 * @param {{kind:number, tags:string[][]}|null} event
 * @returns {boolean} true if `event` is a legacy Kind 1 amendment (e+reply marker)
 */
export function isLegacyAmendmentEvent(event) {
    if (!event || !event.tags) return false;
    return event.kind === 1 && event.tags.some(isLegacyReplyMarker);
}

/**
 * @param {{tags:string[][]}|null} event
 * @returns {string|null} parent event ID via e+revision or e+reply marker
 */
export function getParentId(event) {
    if (!event || !event.tags) return null;
    const t = event.tags.find(x => x[0] === 'e' && (x[3] === 'revision' || x[3] === 'reply'));
    return t ? t[1] : null;
}

/**
 * @param {{tags:string[][]}|null} event
 * @returns {string|null} base event ID from the `base` tag
 */
export function getBaseId(event) {
    if (!event || !event.tags) return null;
    return getTagValue(event, 'base');
}

/**
 * @param {{tags:string[][]}|null} event
 * @returns {string} the commit message (empty string if absent)
 */
export function getCommitMessage(event) {
    if (!event || !event.tags) return '';
    const t = event.tags.find(x => x[0] === 'commit');
    return t ? (t[1] || '') : '';
}

/**
 * @param {{tags:string[][]}|null} event
 * @returns {number|null} the explicit version number from the `version` tag, or null
 */
export function getVersionTag(event) {
    if (!event || !event.tags) return null;
    const t = event.tags.find(x => x[0] === 'version');
    return t ? parseInt(t[1], 10) : null;
}

function findRootId(event, eventCache) {
    if (!event) return null;
    const base = getBaseId(event);
    if (base && eventCache.has(base)) return base;
    let cur = event;
    const visited = new Set();
    while (cur && !visited.has(cur.id)) {
        visited.add(cur.id);
        const parentId = getParentId(cur);
        if (!parentId) return cur.id;
        if (!eventCache.has(parentId)) return cur.id;
        cur = eventCache.get(parentId);
    }
    return cur?.id || null;
}

function addToLinearChain(rootId, eventId) {
    if (!chains.linear.has(rootId)) chains.linear.set(rootId, []);
    const arr = chains.linear.get(rootId);
    if (!arr.includes(eventId)) arr.push(eventId);
}

function addToForkChains(forkRootId, eventId) {
    if (!chains.forkChains.has(forkRootId)) chains.forkChains.set(forkRootId, []);
    const arr = chains.forkChains.get(forkRootId);
    if (!arr.includes(eventId)) arr.push(eventId);
}

function addForkReference(rootId, forkRootId) {
    if (!chains.forks.has(rootId)) chains.forks.set(rootId, []);
    const arr = chains.forks.get(rootId);
    if (!arr.includes(forkRootId)) arr.push(forkRootId);
}

function sortChain(arr, eventCache) {
    arr.sort((a, b) => {
        const ea = eventCache.get(a);
        const eb = eventCache.get(b);
        const ta = ea?.created_at || 0;
        const tb = eb?.created_at || 0;
        return ta - tb;
    });
}

/**
 * Register an event into the chain graph. Idempotent: already-registered
 * events return their existing metadata.
 * @param {{id:string, pubkey:string, kind:number, tags:string[][]}} event
 * @param {Map} eventCache
 * @returns {{rootId:string, parentId:string|null, type:string, forkRoot?:string, author:string}|null}
 */
export function registerEvent(event, eventCache) {
    if (!event || !event.id) return null;
    if (chains.byEvent.has(event.id)) return chains.byEvent.get(event.id);

    const parentId = getParentId(event);
    if (!parentId) {
        chains.byEvent.set(event.id, { rootId: event.id, parentId: null, type: 'root', author: event.pubkey });
        return chains.byEvent.get(event.id);
    }

    const parent = eventCache.get(parentId);
    const rootId = findRootId(event, eventCache) || parentId;
    const parentInfo = parentId ? chains.byEvent.get(parentId) : null;
    const sameAuthor = !!(parent && parent.pubkey === event.pubkey);
    const isForkRev = !!(parentInfo && (parentInfo.type === 'fork' || parentInfo.type === 'fork-rev' || parentInfo.type === 'fork-root'));
    const type = isForkRev ? 'fork-rev' : (sameAuthor ? 'linear' : 'fork');

    if (type === 'linear') {
        addToLinearChain(rootId, event.id);
    } else if (type === 'fork') {
        const forkRoot = event.id;
        addForkReference(rootId, forkRoot);
        addToForkChains(forkRoot, forkRoot);
    } else {
        const forkRoot = parentInfo.forkRoot || parentInfo.rootId;
        addToForkChains(forkRoot, event.id);
        chains.byEvent.set(event.id, { rootId, parentId, type, forkRoot, author: event.pubkey });
        return chains.byEvent.get(event.id);
    }

    chains.byEvent.set(event.id, { rootId, parentId, type, forkRoot: type === 'fork' ? event.id : undefined, author: event.pubkey });
    return chains.byEvent.get(event.id);
}

/**
 * Recompute the entire chain graph from `eventCache`. Call after bulk-loading.
 * @param {Map} eventCache
 */
export function rebuildAll(eventCache) {
    chains.linear.clear();
    chains.forks.clear();
    chains.forkChains.clear();
    chains.canonical.clear();
    chains.byEvent.clear();

    const revs = [];
    const roots = [];
    for (const [, ev] of eventCache) {
        if (isRevisionEvent(ev) || isLegacyAmendmentEvent(ev)) revs.push(ev);
        else if (isRootCandidate(ev)) roots.push(ev);
    }
    revs.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    roots.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

    for (const ev of roots) {
        if (!chains.byEvent.has(ev.id)) {
            chains.byEvent.set(ev.id, { rootId: ev.id, parentId: null, type: 'root', author: ev.pubkey });
        }
    }
    for (const ev of revs) registerEvent(ev, eventCache);
    for (const rootId of new Set([...chains.linear.keys(), ...chains.forks.keys(), ...chains.byEvent.keys()])) {
        if (chains.linear.has(rootId)) sortChain(chains.linear.get(rootId), eventCache);
        for (const forkRoot of (chains.forks.get(rootId) || [])) {
            if (chains.forkChains.has(forkRoot)) sortChain(chains.forkChains.get(forkRoot), eventCache);
        }
    }
}

function isRootCandidate(event) {
    if (!event || !event.tags) return false;
    if (event.kind !== 1) return false;
    const hasRevisionTag = event.tags.some(t => t[0] === 'e' && t[3] === 'revision');
    if (hasRevisionTag) return false;
    const hasLegacyReply = event.tags.some(t => t[0] === 'e' && t[3] === 'reply');
    if (hasLegacyReply) return false;
    return event.tags.some(t => t[0] === 't' && t[1] === 'sciln-eln');
}

/**
 * @param {string} rootId
 * @returns {string[]} ordered event IDs in the linear chain (oldest first)
 */
export function getChain(rootId) {
    return chains.linear.get(rootId) || [];
}

/**
 * @param {string} rootId
 * @returns {string[]} fork root IDs pointing at this root
 */
export function getForks(rootId) {
    return chains.forks.get(rootId) || [];
}

/**
 * @param {string} forkRootId
 * @returns {string[]} ordered event IDs in the fork chain
 */
export function getForkChain(forkRootId) {
    return chains.forkChains.get(forkRootId) || [];
}

/**
 * @param {string} rootId
 * @returns {string|null} the most recent event in the linear chain, or null
 */
export function getLatestLinear(rootId) {
    const arr = chains.linear.get(rootId);
    return arr && arr.length ? arr[arr.length - 1] : null;
}

/**
 * @param {string} forkRootId
 * @returns {string|null} the most recent revision in the fork chain, or null
 */
export function getLatestForkRevision(forkRootId) {
    const arr = chains.forkChains.get(forkRootId);
    return arr && arr.length ? arr[arr.length - 1] : null;
}

/**
 * @param {string} eventId
 * @returns {string|null} the root ID of the chain this event belongs to
 */
export function getRootIdForEvent(eventId) {
    const meta = chains.byEvent.get(eventId);
    return meta?.rootId || null;
}

/**
 * @param {string} eventId
 * @param {Map} eventCache
 * @returns {number} 1-based version number; honors explicit `version` tag if present
 */
export function getVersionNumber(eventId, eventCache) {
    const tagged = eventCache.get(eventId);
    if (tagged) {
        const t = getVersionTag(tagged);
        if (t && Number.isFinite(t)) return t;
    }
    const meta = chains.byEvent.get(eventId);
    if (!meta) return 1;
    if (meta.type === 'root') return 1;
    const chain = meta.type === 'linear'
        ? (chains.linear.get(meta.rootId) || [])
        : (chains.forkChains.get(meta.forkRoot) || []);
    const idx = chain.indexOf(eventId);
    return idx >= 0 ? idx + 1 : 1;
}

/**
 * @param {string} rootId
 * @returns {string|null} the canonical event ID for the root, or null
 */
export function getCanonicalVersion(rootId) {
    return chains.canonical.get(rootId) || null;
}

/**
 * Recompute which revision should be canonical for `rootId`.
 * Selection: highest vote score, tiebreak by most recent created_at.
 * @param {string} rootId
 * @param {Map} eventCache
 * @returns {string|null} the new canonical event ID
 */
export function recomputeCanonical(rootId, eventCache) {
    const candidates = [];
    if (chains.byEvent.has(rootId) && chains.byEvent.get(rootId).type === 'root') {
        candidates.push({ id: rootId, type: 'root' });
    }
    const linearLatest = getLatestLinear(rootId);
    if (linearLatest) candidates.push({ id: linearLatest, type: 'linear' });
    for (const forkRoot of getForks(rootId)) {
        const latest = getLatestForkRevision(forkRoot);
        if (latest) candidates.push({ id: latest, type: 'fork' });
    }
    if (!candidates.length) {
        chains.canonical.delete(rootId);
        return null;
    }
    candidates.sort((a, b) => {
        const sa = Voting.getScore(a.id);
        const sb = Voting.getScore(b.id);
        if (sb !== sa) return sb - sa;
        const ea = eventCache.get(a.id);
        const eb = eventCache.get(b.id);
        return (eb?.created_at || 0) - (ea?.created_at || 0);
    });
    chains.canonical.set(rootId, candidates[0].id);
    return candidates[0].id;
}

/**
 * Recompute the canonical version for every known root.
 * @param {Map} eventCache
 */
export function recomputeAllCanonical(eventCache) {
    const roots = new Set();
    for (const id of chains.byEvent.keys()) {
        const meta = chains.byEvent.get(id);
        if (meta && (meta.type === 'root' || meta.type === 'fork-root' || meta.type === 'fork-rev')) {
            roots.add(meta.rootId);
        }
    }
    for (const r of roots) recomputeCanonical(r, eventCache);
}

/**
 * Count how many of `pubkey`'s roots have been "promoted" — i.e. the
 * canonical version was authored by someone else (a fork won).
 * @param {string} pubkey
 * @param {Map} eventCache
 * @returns {number}
 */
export function countPromotedForksByAuthor(pubkey, eventCache) {
    let n = 0;
    const originalRoots = [];
    for (const [id, ev] of eventCache) {
        if (ev.pubkey === pubkey && !isRevisionEvent(ev) && !isLegacyAmendmentEvent(ev)) {
            originalRoots.push(id);
        }
    }
    for (const rootId of originalRoots) {
        const canonicalId = chains.canonical.get(rootId);
        if (!canonicalId) continue;
        if (canonicalId === rootId) continue;
        const canonicalEv = eventCache.get(canonicalId);
        if (canonicalEv && canonicalEv.pubkey !== pubkey) n++;
    }
    return n;
}

/**
 * Build the Nostr tags for a new revision event based on `parentEvent`.
 * Increments the version number and includes a `commit` message and `base`
 * root pointer if the parent is not itself a root.
 * @param {{id:string, tags:string[][]}} parentEvent
 * @param {string} commitMessage
 * @param {Map} eventCache
 * @returns {string[][]}
 */
export function buildRevisionTags(parentEvent, commitMessage, eventCache) {
    const tags = [];
    const baseId = parentEvent.id;
    let rootId = baseId;
    const ev = parentEvent;
    const p = getParentId(ev);
    if (p && eventCache.has(p)) {
        const meta = chains.byEvent.get(p);
        if (meta) rootId = meta.rootId || baseId;
    }
    tags.push(["e", baseId, "", "revision"]);
    tags.push(["t", "sciln-eln"]);
    tags.push(["commit", (commitMessage || "").slice(0, 120)]);
    const versionNum = (getVersionNumber(baseId, eventCache) || 1) + 1;
    tags.push(["version", String(versionNum)]);
    if (rootId !== baseId) tags.push(["base", rootId]);
    return tags;
}
