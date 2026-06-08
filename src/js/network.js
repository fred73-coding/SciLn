// src/js/network.js
// WebSocket client for a single Nostr relay. Handles event signing
// (extension or local sk) and exposes typed fetch helpers for the
// subscriptions SciLn needs.

import { showToast } from './toast.js';

/**
 * Thin wrapper around a WebSocket to a single Nostr relay.
 * @param {string} relayUrl wss:// URL of the relay
 * @param {() => void} onConnect
 * @param {() => void} onDisconnect
 * @param {(event: object) => void} onEventReceived
 */
export class NostrNetwork {
    constructor(relayUrl, onConnect, onDisconnect, onEventReceived) {
        this.relayUrl = relayUrl;
        this.onConnect = onConnect;
        this.onDisconnect = onDisconnect;
        this.onEventReceived = onEventReceived;
        this.socket = null;
    }

    /** Open the WebSocket. Auto-reconnects after 5s on close. */
    connect() {
        this.socket = new WebSocket(this.relayUrl);

        this.socket.onopen = () => {
            this.onConnect();
        };

        this.socket.onerror = (err) => {
            console.error("Error de conexión WebSocket:", err);
            this.onDisconnect();
        };

        this.socket.onmessage = (msg) => {
            try {
                const parsed = JSON.parse(msg.data);
                if (parsed[0] === "EVENT" && parsed[2]) {
                    this.onEventReceived(parsed[2]);
                }
            } catch (e) { console.error("Error procesando trama de red:", e); }
        };

        this.socket.onclose = () => {
            this.onDisconnect();
            setTimeout(() => this.connect(), 5000);
        };
    }

    /**
     * Sign (locally or via extension) and publish a Nostr event.
     * @param {number} kind
     * @param {string} content
     * @param {string[][]} tags
     * @param {string} userPk
     * @param {string} userSk  hex secret key (required in local mode)
     * @param {'extension'|'local'} mode
     * @returns {Promise<boolean>} true if the socket was OPEN and accepted the frame
     */
    async sendEvent(kind, content, tags, userPk, userSk, mode) {
        const tools = window.NostrTools || NostrTools;
        let event = {
            kind,
            created_at: Math.floor(Date.now() / 1000),
            tags,
            content,
            pubkey: userPk
        };

        try {
            if (mode === "extension") {
                if (!window.nostr) throw new Error("La extensión se desconectó.");
                event = await window.nostr.signEvent(event);
            } else {
                event.id = tools.getEventHash(event);
                event.sig = tools.getSignature(event, userSk);
            }

            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify(["EVENT", event]));
                return true;
            }
        } catch (error) {
            console.error("Error al firmar/enviar evento:", error);
            showToast("Error de firma", "error");
        }
        return false;
    }

    /** Subscribe to the four core feeds: posts, revisions, comments, reactions. */
    async fetchFeed() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(["REQ", "sciln-eln-sub", {
                kinds: [1], "#t": ["sciln-eln"], limit: 50
            }]));
            this.socket.send(JSON.stringify(["REQ", "sciln-eln-revision-sub", {
                kinds: [30211], "#t": ["sciln-eln"], limit: 50
            }]));
            this.socket.send(JSON.stringify(["REQ", "sciln-comment-sub", {
                kinds: [1], "#t": ["sciln-comment"], limit: 500
            }]));
            this.socket.send(JSON.stringify(["REQ", "sciln-reaction-sub", {
                kinds: [7], limit: 500
            }]));
        }
    }

    /**
     * Subscribe to one user's Kind 10003 bookmark list.
     * @param {string} pubkey
     */
    fetchBookmarks(pubkey) {
        if (!pubkey) return;
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(["REQ", `sciln-bookmarks-${pubkey.substring(0, 8)}`, {
                kinds: [10003],
                authors: [pubkey],
                limit: 1
            }]));
        }
    }

    /**
     * Subscribe to a single event by id.
     * @param {string} id
     */
    fetchEventById(id) {
        if (!id) return;
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(["REQ", `sciln-fetch-${id}`, {
                ids: [id]
            }]));
        }
    }

    /**
     * Subscribe to a relay-side search.
     * @param {string} query
     * @param {string} [subId]
     */
    searchEvents(query, subId = "sciln-search") {
        const q = (query || "").trim();
        if (!q) return;
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(["REQ", subId, {
                kinds: [1, 30211],
                "#t": ["sciln-eln"],
                search: q,
                limit: 50
            }]));
        }
    }

    /**
     * Close a previously opened subscription by its subId.
     * @param {string} subId
     */
    closeSubscription(subId) {
        if (!subId) return;
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(["CLOSE", subId]));
        }
    }
}

