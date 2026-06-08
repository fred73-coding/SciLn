// src/js/router.js
// Hash-based router. Pages live in #page-{name} containers; one is
// `.active` at a time. An optional page-change callback is fired after
// every navigation so app.js can run view-specific render code.

const PAGES = ['feed', 'my-lab', 'editor', 'post', 'profile'];
let currentPage = null;
let onPageChange = null;

/**
 * Register a callback fired after every page change.
 * @param {(page:string, data:string|null) => void} cb
 */
export function setOnPageChange(cb) {
    onPageChange = cb;
}

/**
 * Navigate to a hash route. Triggers a `hashchange` event.
 * @param {string} hash e.g. "#/post/abc123"
 */
export function navigate(hash) {
    window.location.hash = hash;
}

/** @returns {string|null} the active page name, or null before first nav */
export function getCurrentPage() {
    return currentPage;
}

/**
 * Parse the current hash into {page, data}.
 * @returns {{page:string, data:string}}
 */
export function parseHash() {
    const hash = window.location.hash || '#/feed';
    const parts = hash.replace('#', '').split('/').filter(Boolean);
    return {
        page: parts[0] || 'feed',
        data: parts.slice(1).join('/')
    };
}

function showPage(name) {
    PAGES.forEach(p => {
        const el = document.getElementById(`page-${p}`);
        if (el) {
            el.classList.remove('active', 'page-enter');
        }
    });
    const pageEl = document.getElementById(`page-${name}`);
    if (pageEl) {
        pageEl.classList.add('active', 'page-enter');
    }
    currentPage = name;

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.page === name);
    });
}

function handleHashChange(hash) {
    const { page, data } = parseHash();
    if (PAGES.includes(page)) {
        showPage(page);
        if (onPageChange) onPageChange(page, data);
    } else {
        showPage('feed');
        if (onPageChange) onPageChange('feed', null);
    }
}

/** Wire up hashchange listener and dispatch the initial route. */
export function initRouter() {
    handleHashChange(window.location.hash || '#/feed');
    window.addEventListener('hashchange', () => {
        handleHashChange(window.location.hash);
    });
}
