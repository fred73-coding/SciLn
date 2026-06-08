// src/js/comments.js
// Kind 1 comments tagged with `t=sciln-comment`. Comments live in a
// per-root cache with localStorage persistence (capped at 500 roots).

const commentCache = new Map();

/**
 * Ingest a remote comment event into the cache.
 * @param {{kind:number, id:string, tags:string[][]}} event
 */
export function processCommentEvent(event) {
    if (event.kind !== 1) return;
    const isComment = event.tags.some(t => t[0] === 't' && t[1] === 'sciln-comment');
    if (!isComment) return;

    const rootTag = event.tags.find(t => t[0] === 'e' && t[3] === 'root');
    const fallbackTag = event.tags.find(t => t[0] === 'e');
    const rootId = rootTag ? rootTag[1] : (fallbackTag ? fallbackTag[1] : null);
    if (!rootId) return;

    if (!commentCache.has(rootId)) {
        commentCache.set(rootId, []);
    }
    const comments = commentCache.get(rootId);
    if (!comments.find(c => c.id === event.id)) {
        comments.push(event);
    }
}

/**
 * @param {string} eventId root post ID
 * @returns {Array} comments for that root
 */
export function getComments(eventId) {
    return commentCache.get(eventId) || [];
}

/**
 * Group comments into roots and a parentId→children map, sorted by created_at.
 * @param {string} eventId
 * @param {Array} comments
 * @returns {{roots: Array, children: Object<string, Array>}}
 */
export function buildCommentTree(eventId, comments) {
    const roots = [];
    const children = {};

    for (const comment of comments) {
        const eTags = comment.tags.filter(t => t[0] === 'e');
        const replyTag = eTags.find(t => t[3] === 'reply');
        const rootTag = eTags.find(t => t[3] === 'root');

        if (replyTag && rootTag && replyTag[1] !== rootTag[1]) {
            const parentId = replyTag[1];
            if (!children[parentId]) children[parentId] = [];
            children[parentId].push(comment);
        } else {
            roots.push(comment);
        }
    }

    roots.sort((a, b) => a.created_at - b.created_at);
    for (const parentId of Object.keys(children)) {
        children[parentId].sort((a, b) => a.created_at - b.created_at);
    }

    return { roots, children };
}

/**
 * Build a Kind 1 comment event payload (not yet signed).
 * @param {string} postId
 * @param {string} content
 * @param {string|null} replyToCommentId
 * @param {{pk:string}} session
 * @returns {{kind:number, content:string, tags:string[][]}}
 */
export function buildCommentEvent(postId, content, replyToCommentId, session) {
    const tags = [
        ["t", "sciln-comment"],
        ["e", postId, "", "root"],
        ["client", "SciLn-ELN"]
    ];
    if (replyToCommentId) {
        tags.push(["e", replyToCommentId, "", "reply"]);
    }
    return {
        kind: 1,
        content,
        tags
    };
}

/**
 * Persist the in-memory comment cache to localStorage (capped at 500 roots).
 */
export function guardarCommentCache() {
    const data = {};
    for (const [rootId, comments] of commentCache) {
        data[rootId] = comments.map(c => ({ id: c.id, pubkey: c.pubkey, content: c.content, created_at: c.created_at, tags: c.tags }));
    }
    try {
        const existing = JSON.parse(localStorage.getItem('sciln_comments') || '{}');
        Object.assign(existing, data);
        const keys = Object.keys(existing);
        if (keys.length > 500) {
            const trimmed = {};
            keys.slice(-500).forEach(k => { trimmed[k] = existing[k]; });
            localStorage.setItem('sciln_comments', JSON.stringify(trimmed));
        } else {
            localStorage.setItem('sciln_comments', JSON.stringify(existing));
        }
    } catch { }
}

/**
 * Hydrate the in-memory comment cache from localStorage.
 */
export function cargarCommentCache() {
    try {
        const data = JSON.parse(localStorage.getItem('sciln_comments') || '{}');
        for (const [rootId, comments] of Object.entries(data)) {
            commentCache.set(rootId, comments);
        }
    } catch { }
}
