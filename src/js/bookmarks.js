// src/js/bookmarks.js
// Kind 10003 (NIP-51 Bookmarks). Hybrid: localStorage as primary cache,
// relay sync via Kind 10003 with `d:bookmarks` and `e` tags.

export const BOOKMARK_KIND = 10003;
const STORAGE_KEY = 'sciln_bookmarks';
const META_KEY = 'sciln_bookmarks_meta';

const bookmarks = new Set();
const subscribers = new Set();
let currentPubkey = null;
let initialized = false;
let lastPublishedAt = 0;

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
            for (const id of arr) {
                if (typeof id === 'string' && id.length > 0) bookmarks.add(id);
            }
        }
    } catch (e) {
        console.warn('bookmarks: storage corrupto', e);
    }
}

function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...bookmarks]));
    } catch (e) {
        console.error('bookmarks: no se pudo persistir', e);
    }
}

function loadMeta() {
    try {
        const raw = localStorage.getItem(META_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function saveMeta(meta) {
    try {
        localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch (e) { /* ignore */ }
}

function notify() {
    for (const cb of subscribers) {
        try { cb(); } catch (e) { console.error('bookmarks subscriber error', e); }
    }
}

/**
 * Subscribe to bookmark changes. Returns an unsubscribe function.
 * @param {() => void} callback
 * @returns {() => void}
 */
export function subscribe(callback) {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
}

/**
 * One-time init. Loads the localStorage cache.
 * @param {string|null} pubkey
 */
export function init(pubkey) {
    currentPubkey = pubkey || null;
    if (!initialized) {
        loadFromStorage();
        initialized = true;
    }
}

/**
 * Set the active pubkey for subsequent publishes. Does not load anything.
 * @param {string|null} pubkey
 */
export function setPubkey(pubkey) {
    currentPubkey = pubkey || null;
}

/**
 * @returns {string|null} the current pubkey used for publishes
 */
export function getPubkey() {
    return currentPubkey;
}

/**
 * @param {string} eventId
 * @returns {boolean}
 */
export function isBookmarked(eventId) {
    return bookmarks.has(eventId);
}

/**
 * @returns {string[]} snapshot of bookmarked event IDs
 */
export function list() {
    return [...bookmarks];
}

/**
 * @returns {number}
 */
export function count() {
    return bookmarks.size;
}

/**
 * Remove all bookmarks. Persists and notifies.
 */
export function clearAll() {
    bookmarks.clear();
    saveToStorage();
    notify();
}

function mergeFromRemote(remoteIds) {
    let changed = false;
    for (const id of remoteIds) {
        if (!bookmarks.has(id)) {
            bookmarks.add(id);
            changed = true;
        }
    }
    if (changed) {
        saveToStorage();
        notify();
    }
    return changed;
}

/**
 * Merge bookmark IDs from a remote Kind 10003 event.
 * @param {{kind:number, tags:string[][]}|null} event
 * @returns {boolean} true if the local set changed
 */
export function mergeFromEvent(event) {
    if (!event || event.kind !== BOOKMARK_KIND) return false;
    const tags = Array.isArray(event.tags) ? event.tags : [];
    const ids = [];
    for (const tag of tags) {
        if (tag && tag[0] === 'e' && typeof tag[1] === 'string' && tag[1].length > 0) {
            ids.push(tag[1]);
        }
    }
    return mergeFromRemote(ids);
}

/**
 * Toggle a bookmark. Returns the new state.
 * @param {string} eventId
 * @returns {Promise<boolean>}
 */
export async function toggle(eventId) {
    if (!eventId) return false;
    if (bookmarks.has(eventId)) {
        bookmarks.delete(eventId);
    } else {
        bookmarks.add(eventId);
    }
    saveToStorage();
    notify();
    return bookmarks.has(eventId);
}

/**
 * Add a bookmark if not present. Returns true if it was added.
 * @param {string} eventId
 * @returns {Promise<boolean>}
 */
export async function add(eventId) {
    if (!eventId || bookmarks.has(eventId)) return false;
    bookmarks.add(eventId);
    saveToStorage();
    notify();
    return true;
}

/**
 * Remove a bookmark. Returns true if it was present.
 * @param {string} eventId
 * @returns {Promise<boolean>}
 */
export async function remove(eventId) {
    if (!eventId || !bookmarks.has(eventId)) return false;
    bookmarks.delete(eventId);
    saveToStorage();
    notify();
    return true;
}

/**
 * Build a Kind 10003 event payload representing the current bookmark set.
 * @returns {{kind:number, content:string, tags:string[][], pubkey:string|null}}
 */
export function getRemoteListEvent() {
    const tags = [['d', 'bookmarks']];
    for (const id of bookmarks) tags.push(['e', id]);
    return {
        kind: BOOKMARK_KIND,
        content: '',
        tags,
        pubkey: currentPubkey
    };
}

/**
 * Mark that the bookmark set was just published to the relay.
 */
export function markPublished() {
    lastPublishedAt = Date.now();
    saveMeta({ pubkey: currentPubkey, lastPublishedAt });
}

/**
 * @returns {number} epoch ms of the last successful publish (0 if never)
 */
export function getLastPublishedAt() {
    const meta = loadMeta();
    return meta ? meta.lastPublishedAt || 0 : 0;
}

/**
 * Sign and send the bookmark list to the relay.
 * @param {{sendEvent:Function}} network
 * @param {{pk:string, sk:string, mode:string}} session
 * @returns {Promise<boolean>}
 */
export async function publishToRelay(network, session) {
    if (!network || !session || !session.pk || !session.sk) {
        if (!session || !session.pk) throw new Error('no hay sesión activa');
        if (!session.sk) throw new Error('se requiere sk (modo local) para firmar');
    }
    if (!currentPubkey) currentPubkey = session.pk;
    const event = getRemoteListEvent();
    const ok = await network.sendEvent(BOOKMARK_KIND, event.content, event.tags, session.pk, session.sk, session.mode);
    if (ok) markPublished();
    return ok;
}

init(null);
