// Feed filters - estado data-driven para los filtros del feed
// Persiste en localStorage, reactivo via subscribe()

/** @typedef {'recent'|'top'|'discussed'|'forked'|'alpha'} SortKey */
/** @typedef {'24h'|'7d'|'30d'|'90d'|'all'} TimeRange */

const STORAGE_KEY = 'sciln_feed_filters';

const DEFAULT_STATE = {
    sort: 'recent',
    timeRange: 'all',
    onlyBookmarks: false,
    hideSuperseded: false
};

const SORT_OPTIONS = {
    recent: { label: '🕐 Recientes', comparator: (a, b) => (b.createdAt || 0) - (a.createdAt || 0) },
    top: { label: '🔥 Top votados', comparator: (a, b) => (b.score || 0) - (a.score || 0) },
    discussed: { label: '💬 Más comentados', comparator: (a, b) => (b.commentCount || 0) - (a.commentCount || 0) },
    forked: { label: '🔀 Más forkeados', comparator: (a, b) => (b.forkCount || 0) - (a.forkCount || 0) },
    alpha: { label: '🔤 A-Z', comparator: (a, b) => (a.title || '').localeCompare(b.title || '') }
};

const TIME_RANGES = {
    '24h': { label: '24h', ms: 24 * 60 * 60 * 1000 },
    '7d': { label: '7 días', ms: 7 * 24 * 60 * 60 * 1000 },
    '30d': { label: '30 días', ms: 30 * 24 * 60 * 60 * 1000 },
    '90d': { label: '90 días', ms: 90 * 24 * 60 * 60 * 1000 },
    'all': { label: 'Todo', ms: null }
};

const subscribers = new Set();
let state = { ...DEFAULT_STATE };
let isBookmarkedFn = null;
let isSupersededFn = null;

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
            for (const k of Object.keys(DEFAULT_STATE)) {
                if (k in obj) state[k] = obj[k];
            }
        }
    } catch (e) {
        console.warn('feed-filters: storage corrupto', e);
    }
}

function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error('feed-filters: no se pudo persistir', e);
    }
}

function notify() {
    for (const cb of subscribers) {
        try { cb(state); } catch (e) { console.error('feed-filters subscriber error', e); }
    }
}

/** Inject a checker for "is this event bookmarked?". */
export function setBookmarkedChecker(fn) {
    isBookmarkedFn = typeof fn === 'function' ? fn : null;
}

/** Inject a checker for "is this event superseded by a newer revision?". */
export function setSupersededChecker(fn) {
    isSupersededFn = typeof fn === 'function' ? fn : null;
}

/** Subscribe to filter/sort state changes. Returns an unsubscribe fn. */
export function subscribe(callback) {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
}

/** @returns {{sort:SortKey, timeRange:TimeRange, onlyBookmarks:boolean, hideSuperseded:boolean}} */
export function getState() {
    return { ...state };
}

/** @param {SortKey} sort @returns {boolean} changed */
export function setSort(sort) {
    if (!(sort in SORT_OPTIONS)) return false;
    if (state.sort === sort) return false;
    state.sort = sort;
    saveToStorage();
    notify();
    return true;
}

/** @param {TimeRange} range @returns {boolean} changed */
export function setTimeRange(range) {
    if (!(range in TIME_RANGES)) return false;
    if (state.timeRange === range) return false;
    state.timeRange = range;
    saveToStorage();
    notify();
    return true;
}

/** @param {boolean} value @returns {boolean} changed */
export function setOnlyBookmarks(value) {
    const v = !!value;
    if (state.onlyBookmarks === v) return false;
    state.onlyBookmarks = v;
    saveToStorage();
    notify();
    return true;
}

/** @returns {boolean} changed */
export function toggleOnlyBookmarks() {
    return setOnlyBookmarks(!state.onlyBookmarks);
}

/** @param {boolean} value @returns {boolean} changed */
export function setHideSuperseded(value) {
    const v = !!value;
    if (state.hideSuperseded === v) return false;
    state.hideSuperseded = v;
    saveToStorage();
    notify();
    return true;
}

/** @returns {boolean} changed */
export function toggleHideSuperseded() {
    return setHideSuperseded(!state.hideSuperseded);
}

/** @returns {Object} clone of the sort definitions */
export function getSortOptions() {
    return { ...SORT_OPTIONS };
}

/** @returns {Object} clone of the time-range definitions */
export function getTimeRanges() {
    return { ...TIME_RANGES };
}

/** @returns {{sort:SortKey, timeRange:TimeRange, onlyBookmarks:boolean, hideSuperseded:boolean}} */
export function getDefaultState() {
    return { ...DEFAULT_STATE };
}

/** Reset all filter state to defaults. */
export function reset() {
    state = { ...DEFAULT_STATE };
    saveToStorage();
    notify();
}

/**
 * @param {number} createdAt epoch seconds
 * @returns {boolean} true if the post falls within the selected time range
 */
export function matchesTimeRange(createdAt) {
    const range = TIME_RANGES[state.timeRange];
    if (!range || !range.ms) return true;
    if (!createdAt) return true;
    return (Date.now() - createdAt * 1000) <= range.ms;
}

/**
 * @param {string} eventId
 * @returns {boolean} true if the post should remain visible given the bookmark filter
 */
export function matchesOnlyBookmarks(eventId) {
    if (!state.onlyBookmarks) return true;
    if (!isBookmarkedFn) return true;
    return isBookmarkedFn(eventId);
}

/**
 * @param {string} eventId
 * @param {string} rootId
 * @param {string} canonicalId
 * @returns {boolean} true if the post should remain visible given the hide-superseded filter
 */
export function matchesHideSuperseded(eventId, rootId, canonicalId) {
    if (!state.hideSuperseded) return true;
    if (!isSupersededFn) return true;
    if (!rootId || !canonicalId) return true;
    return !isSupersededFn(eventId, rootId, canonicalId);
}

/**
 * Apply the current sort + filter state to an in-memory post list.
 * @param {Array<{id:string, createdAt:number, score?:number, commentCount?:number, forkCount?:number, rootId?:string, canonicalId?:string}>} posts
 * @returns {Array} filtered + sorted
 */
export function applyToPosts(posts) {
    if (!Array.isArray(posts)) return [];
    const filtered = posts.filter(p => {
        if (!matchesTimeRange(p.createdAt)) return false;
        if (!matchesOnlyBookmarks(p.id)) return false;
        if (!matchesHideSuperseded(p.id, p.rootId, p.canonicalId)) return false;
        return true;
    });
    const sortDef = SORT_OPTIONS[state.sort] || SORT_OPTIONS.recent;
    filtered.sort(sortDef.comparator);
    return filtered;
}

loadFromStorage();
