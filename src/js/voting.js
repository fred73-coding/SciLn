// src/js/voting.js
// Kind 7 (NIP-25) reactions. Maintains an in-memory vote cache with
// localStorage persistence (capped at 1000 entries).

const voteCache = new Map();

/**
 * Apply a remote vote (Kind 7) event into the local vote cache.
 * @param {{kind:number, pubkey:string, content:string, tags:string[][]}} event
 */
export function processVoteEvent(event) {
    if (event.kind !== 7) return;
    const targetTag = event.tags.find(t => t[0] === 'e');
    if (!targetTag) return;
    const targetId = targetTag[1];
    const voter = event.pubkey;
    const direction = event.content === '+' ? 'up' : (event.content === '-' ? 'down' : null);
    if (!direction) return;

    if (!voteCache.has(targetId)) {
        voteCache.set(targetId, { upvoters: new Set(), downvoters: new Set() });
    }
    const entry = voteCache.get(targetId);
    entry.downvoters.delete(voter);
    entry.upvoters.delete(voter);
    if (direction === 'up') {
        entry.upvoters.add(voter);
    } else {
        entry.downvoters.add(voter);
    }
}

/**
 * Toggle a vote from the local user on an event. Same direction removes
 * the vote, opposite switches it.
 * @param {string} eventId
 * @param {'up'|'down'} direction
 * @param {string} voterPk
 * @returns {'+'|'-'|null} effective direction, or null if removed/no-op
 */
export function applyVote(eventId, direction, voterPk) {
    if (!voteCache.has(eventId)) {
        voteCache.set(eventId, { upvoters: new Set(), downvoters: new Set() });
    }
    const entry = voteCache.get(eventId);

    if (direction === 'up') {
        if (entry.upvoters.has(voterPk)) {
            entry.upvoters.delete(voterPk);
            return null;
        }
        entry.downvoters.delete(voterPk);
        entry.upvoters.add(voterPk);
        return '+';
    }
    if (direction === 'down') {
        if (entry.downvoters.has(voterPk)) {
            entry.downvoters.delete(voterPk);
            return null;
        }
        entry.upvoters.delete(voterPk);
        entry.downvoters.add(voterPk);
        return '-';
    }
    return null;
}

/**
 * Net score (upvoters − downvoters) for an event.
 * @param {string} eventId
 * @returns {number}
 */
export function getScore(eventId) {
    const entry = voteCache.get(eventId);
    if (!entry) return 0;
    return entry.upvoters.size - entry.downvoters.size;
}

/**
 * Raw vote counts and net score.
 * @param {string} eventId
 * @returns {{up:number, down:number, score:number}}
 */
export function getVoteCounts(eventId) {
    const entry = voteCache.get(eventId);
    if (!entry) return { up: 0, down: 0, score: 0 };
    return {
        up: entry.upvoters.size,
        down: entry.downvoters.size,
        score: entry.upvoters.size - entry.downvoters.size
    };
}

/**
 * Get the local user's current vote on an event.
 * @param {string} eventId
 * @param {string} pubkey
 * @returns {'+'|'-'|null}
 */
export function getUserVote(eventId, pubkey) {
    const entry = voteCache.get(eventId);
    if (!entry) return null;
    if (entry.upvoters.has(pubkey)) return '+';
    if (entry.downvoters.has(pubkey)) return '-';
    return null;
}

/**
 * Aggregate net score across all events authored by `pubkey`.
 * Optionally excludes superseded event IDs.
 * @param {string} pubkey
 * @param {Map} eventCache
 * @param {Set<string>|null} supersededIds
 * @returns {number}
 */
export function getReputation(pubkey, eventCache, supersededIds = null) {
    let rep = 0;
    for (const [eventId, entry] of voteCache) {
        if (supersededIds && supersededIds.has(eventId)) continue;
        const event = eventCache.get(eventId);
        if (event && event.pubkey === pubkey) {
            rep += entry.upvoters.size - entry.downvoters.size;
        }
    }
    return rep;
}

/**
 * Merge the vote sets of two events (used when forking/replacing posts).
 * @param {string} fromId
 * @param {string} toId
 */
export function transferVotes(fromId, toId) {
    if (fromId === toId) return;
    const entry = voteCache.get(fromId);
    if (!entry) return;
    const existing = voteCache.get(toId);
    voteCache.set(toId, {
        upvoters: new Set([...entry.upvoters, ...(existing?.upvoters || [])]),
        downvoters: new Set([...entry.downvoters, ...(existing?.downvoters || [])])
    });
}

/**
 * Build a Kind 7 vote event payload (not yet signed).
 * @param {{id:string, pubkey:string}} targetEvent
 * @param {'+'|'-'|null} direction
 * @param {{pk:string}} session
 * @returns {{kind:number, content:string, tags:string[][]}}
 */
export function buildVoteEvent(targetEvent, direction, session) {
    const tags = [
        ["e", targetEvent.id],
        ["p", targetEvent.pubkey]
    ];
    return {
        kind: 7,
        content: direction,
        tags
    };
}

/**
 * Sync the visual vote column in all rendered cards of `eventId`.
 * @param {string} eventId
 * @param {string|null} sessionPk
 */
export function updateVoteDisplay(eventId, sessionPk) {
    const counts = getVoteCounts(eventId);
    const userVote = sessionPk ? getUserVote(eventId, sessionPk) : null;
    document.querySelectorAll(`[data-vote-target="${eventId}"]`).forEach(el => {
        const scoreEl = el.querySelector('.vote-score');
        if (scoreEl) scoreEl.textContent = counts.score;
        const upEl = el.querySelector('.vote-up');
        const downEl = el.querySelector('.vote-down');
        if (upEl) upEl.classList.toggle('text-green-500', userVote === '+');
        if (upEl) upEl.classList.toggle('text-slate-400', userVote !== '+');
        if (downEl) downEl.classList.toggle('text-red-500', userVote === '-');
        if (downEl) downEl.classList.toggle('text-slate-400', userVote !== '-');
    });
}

/**
 * Persist the in-memory vote cache to localStorage (capped at 1000 entries).
 */
export function guardarVoteCache() {
    const data = {};
    for (const [eventId, entry] of voteCache) {
        data[eventId] = {
            upvoters: [...entry.upvoters],
            downvoters: [...entry.downvoters]
        };
    }
    try {
        const existing = JSON.parse(localStorage.getItem('sciln_votes') || '{}');
        Object.assign(existing, data);
        const keys = Object.keys(existing);
        if (keys.length > 1000) {
            const trimmed = {};
            keys.slice(-1000).forEach(k => { trimmed[k] = existing[k]; });
            localStorage.setItem('sciln_votes', JSON.stringify(trimmed));
        } else {
            localStorage.setItem('sciln_votes', JSON.stringify(existing));
        }
    } catch { }
}

/**
 * Hydrate the in-memory vote cache from localStorage.
 */
export function cargarVoteCache() {
    try {
        const data = JSON.parse(localStorage.getItem('sciln_votes') || '{}');
        for (const [eventId, entry] of Object.entries(data)) {
            voteCache.set(eventId, {
                upvoters: new Set(entry.upvoters || []),
                downvoters: new Set(entry.downvoters || [])
            });
        }
    } catch { }
}
