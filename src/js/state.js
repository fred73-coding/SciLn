// src/js/state.js
// Reactive single source of truth for cross-module shared state.
// Replaces the legacy `window.__*` globals (session, network, eventCache, ...).
// Any module can subscribe to a key and get notified when it changes.

const data = {
    session: null,
    network: null,
    eventCache: null,
    cachePerfiles: null,
    amendmentData: null,
    amendmentNext: null,
    rollbackTarget: null,
    currentPostId: null,
    editorDraft: null,
};

const subscribers = new Map();
let nextSubscriberId = 1;

function notify(key, value, prev) {
    if (!subscribers.has(key)) return;
    for (const cb of subscribers.get(key)) {
        try {
            cb(value, prev);
        } catch (err) {
            console.warn(`[state] subscriber for "${key}" threw:`, err);
        }
    }
}

/**
 * Get a state value by key.
 * @param {string} key
 * @returns {*}
 */
export function get(key) {
    return data[key];
}

/**
 * Get the full state snapshot. Mutate at your own risk.
 * @returns {object}
 */
export function snapshot() {
    return { ...data };
}

/**
 * Set a state value. Triggers subscribers for that key.
 * No-op if the value is structurally identical (===).
 * @param {string} key
 * @param {*} value
 * @returns {boolean} true if the value changed
 */
export function set(key, value) {
    if (!(key in data)) {
        console.warn(`[state] unknown key "${key}"`);
        return false;
    }
    if (data[key] === value) return false;
    const prev = data[key];
    data[key] = value;
    notify(key, value, prev);
    return true;
}

/**
 * Subscribe to changes on a key. Returns an unsubscribe function.
 * @param {string} key
 * @param {(value: *, prev: *) => void} cb
 * @returns {() => void}
 */
export function subscribe(key, cb) {
    if (!subscribers.has(key)) subscribers.set(key, new Set());
    const id = nextSubscriberId++;
    subscribers.get(key).add(cb);
    return () => subscribers.get(key)?.delete(cb);
}

/**
 * Subscribe to all key changes. Returns an unsubscribe function.
 * @param {(key: string, value: *, prev: *) => void} cb
 * @returns {() => void}
 */
export function subscribeAll(cb) {
    const unsubs = [];
    for (const key of Object.keys(data)) {
        unsubs.push(subscribe(key, (value, prev) => cb(key, value, prev)));
    }
    return () => unsubs.forEach(fn => fn());
}

/**
 * Clear all state and subscribers. Test helper.
 */
export function _reset() {
    for (const key of Object.keys(data)) data[key] = null;
    subscribers.clear();
    nextSubscriberId = 1;
}

export const KEYS = Object.freeze(Object.keys(data));
