import { parseScientificContent } from './parser.js';
import * as Crypto from './crypto.js';
import { NostrNetwork } from './network.js';
import * as Tags from './tags.js';
import * as Roles from './roles.js';
import { initRouter, navigate, setOnPageChange } from './router.js';
import { renderPostDetail } from '../views/post-detail.js';
import { renderProfilePage } from '../views/profile.js';
import { initLabTabs, renderRevisionsTab } from '../views/my-lab.js';
import * as Voting from './voting.js';
import * as Comments from './comments.js';
import * as Revisions from './revisions.js';
import * as EditorImages from './editor-images.js';
import * as EditorToolbar from './editor-toolbar.js';
import * as Bookmarks from './bookmarks.js';
import * as FeedFilters from './feed-filters.js';
import { initTheme, toggleTheme } from './theme.js';
import { showToast } from './toast.js';
import * as State from './state.js';
import { escapeHtml, formatDraftAge } from './utils.js';

const RELAY_URL = "wss://relay.damus.io";

let session = null;
const cachePerfiles = {};
const eventCache = new Map();
let network = null;
let editandoEventoId = null;
let selectedPublishCategories = [];
let currentFilterPath = null;
let currentRoleFilter = null;
let currentViewedPost = null;
const amendmentNext = new Map();

const editor = document.getElementById("test-editor");
const preview = document.getElementById("test-preview");
const netStatus = document.getElementById("nostr-network-status");

const btnGenerate = document.getElementById("btn-generate-keys");
const btnSaveProfile = document.getElementById("btn-save-profile");
const btnPublish = document.getElementById("btn-publish-nostr");
const dropOverlay = document.getElementById("drop-overlay");
const btnLoginExtension = document.getElementById("btn-login-extension");
const searchInput = document.getElementById("search-input");
const btnLogout = document.getElementById("dropdown-logout");

function updateLocalRender() {
    preview.innerHTML = parseScientificContent(editor.value);
}

function gatherProfileFromForm() {
    const country = document.getElementById("profile-country").value;
    const city = document.getElementById("profile-city").value;
    const posSel = document.getElementById("profile-position");
    const position = posSel.value === "__other__"
        ? document.getElementById("profile-position-other").value
        : posSel.value;
    return {
        name: document.getElementById("profile-name").value,
        display_name: document.getElementById("profile-display-name").value,
        about: document.getElementById("profile-about").value,
        role_category: document.getElementById("profile-role-category").value,
        position,
        academic_level: document.getElementById("profile-academic-level").value,
        degrees: document.getElementById("profile-degrees").value,
        institution: document.getElementById("profile-institution").value,
        department: document.getElementById("profile-department").value,
        location: [city, country].filter(Boolean).join(", "),
        orcid: document.getElementById("profile-orcid").value,
        website: document.getElementById("profile-website").value,
        research_interests: document.getElementById("profile-research-interests").value,
        lud16: document.getElementById("profile-lud16").value,
        github: document.getElementById("profile-github").value,
        twitter: document.getElementById("profile-twitter").value,
    };
}

function populateSelect(selId, options, placeholder) {
    const sel = document.getElementById(selId);
    sel.innerHTML = `<option value="">${placeholder || "Seleccionar..."}</option>${options.map(o =>
        `<option value="${o}">${o}</option>`
    ).join("")}`;
}

function populateRoleDropdown() {
    const sel = document.getElementById("profile-role-category");
    sel.innerHTML = `<option value="">Seleccionar rol...</option>${Roles.ROLE_CATEGORIES.map(r =>
        `<option value="${r.id}">${r.icon} ${r.label}</option>`
    ).join("")}`;
    sel.addEventListener("change", () => {
        const rid = sel.value;
        const positions = rid ? Roles.getPositionsForRole(rid) : [];
        const posSel = document.getElementById("profile-position");
        posSel.innerHTML = `<option value="">Seleccionar cargo...</option>${positions.map(p =>
            `<option value="${p}">${p}</option>`
        ).join("")}<option value="__other__">Otro (especificar)...</option>`;
        document.getElementById("profile-position-other").classList.add("hidden");
        document.getElementById("profile-position").value = "";
    });
    document.getElementById("profile-position").addEventListener("change", () => {
        const otherInput = document.getElementById("profile-position-other");
        otherInput.classList.toggle("hidden", document.getElementById("profile-position").value !== "__other__");
    });
}

function syncUiSession() {
    session = Crypto.loadStoredSession();
    const navAvatarArea = document.getElementById('nav-avatar-area');
    const navLoggedOut = document.getElementById('nav-logged-out');
    const navAvatarImg = document.getElementById('nav-avatar-img');
    const navAvatarName = document.getElementById('nav-avatar-name');
    const dropdownPubkey = document.getElementById('dropdown-pubkey');

    State.set('session', session);
    if (session) {
        navAvatarArea.classList.remove('hidden');
        navLoggedOut.classList.add('hidden');
        btnPublish.removeAttribute('disabled');

        const prefijo = session.mode === "extension" ? "🔒" : "⚡";
        dropdownPubkey.textContent = `${prefijo} npub...${session.pk.substring(0, 8)}`;
        navAvatarImg.src = session.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${session.pk}`;
        navAvatarName.textContent = session.display_name || session.name || "Científico Anónimo";

        document.getElementById("profile-name").value = session.name || "";
        document.getElementById("profile-display-name").value = session.display_name || "";
        document.getElementById("profile-about").value = session.about || "";
        document.getElementById("profile-role-category").value = session.role_category || "";

        const rid = session.role_category;
        if (rid) {
            const positions = Roles.getPositionsForRole(rid);
            const posSel = document.getElementById("profile-position");
            const posCats = ["", ...positions, "__other__"];
            const currentPos = session.position || "";
            const inList = positions.includes(currentPos);
            posSel.innerHTML = posCats.map(v =>
                v === "" ? `<option value="">Seleccionar cargo...</option>`
                : v === "__other__" ? `<option value="__other__">Otro (especificar)...</option>`
                : `<option value="${v}" ${v === currentPos ? "selected" : ""}>${v}</option>`
            ).join("");
            if (!inList && currentPos && rid) {
                posSel.value = "__other__";
                document.getElementById("profile-position-other").value = currentPos;
                document.getElementById("profile-position-other").classList.remove("hidden");
            }
        }

        document.getElementById("profile-academic-level").value = session.academic_level || "";
        document.getElementById("profile-degrees").value = session.degrees || "";
        document.getElementById("profile-institution").value = session.institution || "";
        document.getElementById("profile-department").value = session.department || "";

        const loc = session.location || "";
        const locParts = loc.split(", ").filter(Boolean);
        if (locParts.length >= 2) {
            document.getElementById("profile-city").value = locParts.slice(0, -1).join(", ");
            document.getElementById("profile-country").value = locParts[locParts.length - 1];
        } else if (locParts.length === 1) {
            document.getElementById("profile-country").value = locParts[0];
        }

        document.getElementById("profile-orcid").value = session.orcid || "";
        document.getElementById("profile-website").value = session.website || "";
        document.getElementById("profile-research-interests").value = session.research_interests || "";
        document.getElementById("profile-lud16").value = session.lud16 || "";
        document.getElementById("profile-github").value = session.github || "";
        document.getElementById("profile-twitter").value = session.twitter || "";
    } else {
        navAvatarArea.classList.add('hidden');
        navLoggedOut.classList.remove('hidden');
        btnPublish.setAttribute("disabled", "true");
    }
}

// --- Nav Dropdown ---

function initNavDropdown() {
    const btn = document.getElementById('nav-avatar-btn');
    const dropdown = document.getElementById('nav-dropdown');
    if (!btn || !dropdown) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
        dropdown.classList.add('hidden');
    });

    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

// --- Profile Modal ---

function openProfileModal(pubkey) {
    const profile = cachePerfiles[pubkey] || {};
    const modal = document.getElementById("profile-modal");
    const content = document.getElementById("profile-modal-content");
    const picture = profile.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${pubkey}`;
    const roleIcon = Roles.getRoleIcon(profile.role_category);
    const roleLabel = Roles.getRoleLabel(profile.role_category);

    const fields = [];

    if (profile.position) fields.push(["🔬", "Cargo", profile.position]);
    if (roleLabel) fields.push(["👤", "Rol", `${roleIcon || ""} ${roleLabel}`]);
    if (profile.institution) fields.push(["🏛️", "Institución", profile.institution]);
    if (profile.department) fields.push(["📂", "Departamento", profile.department]);
    if (profile.location) fields.push(["📍", "Ubicación", profile.location]);
    if (profile.academic_level || profile.degrees) {
        const val = [profile.academic_level, profile.degrees].filter(Boolean).join(" — ");
        fields.push(["🎓", "Formación", val]);
    }
    if (profile.orcid) fields.push(["🆔", "ORCID", profile.orcid]);
    if (profile.website) fields.push(["🌐", "Web", profile.website]);
    if (profile.lud16) fields.push(["⚡", "Lightning", profile.lud16]);
    if (profile.github) fields.push(["💻", "GitHub", profile.github]);
    if (profile.twitter) fields.push(["🐦", "Twitter", profile.twitter]);
    if (profile.research_interests) fields.push(["🔬", "Intereses", profile.research_interests]);
    if (profile.about) fields.push(["📝", "Sobre mí", profile.about]);

    const rep = Voting.getReputation(pubkey, eventCache, new Set(amendmentNext.keys()));
    const repColor = rep > 0 ? 'text-green-600' : (rep < 0 ? 'text-red-500' : 'text-slate-400');

    content.innerHTML = `
        <div class="flex justify-between items-start">
            <div class="flex items-center gap-4">
                <img src="${picture}" class="w-16 h-16 rounded-full border-2 border-slate-200">
                <div>
                    <div class="font-bold text-slate-800 text-base">${profile.display_name || profile.name || `Científico...${pubkey.substring(0,6)}`}</div>
                    <div class="text-[10px] text-slate-400 font-mono truncate max-w-[200px]">npub1${pubkey.substring(0,20)}...</div>
                    <div class="text-xs font-mono ${repColor}">⭐ ${rep} reputación</div>
                </div>
            </div>
            <button class="btn-close-modal text-slate-400 hover:text-slate-700 text-xl leading-none" data-close="modal">&times;</button>
        </div>
        <div class="border-t border-slate-100 pt-3 space-y-2 text-xs">
            ${fields.map(([icon, label, value]) =>
                `<div class="flex gap-2"><span class="text-slate-400 w-5 shrink-0">${icon}</span><span class="text-slate-500 w-20 shrink-0 font-bold">${label}:</span><span class="text-slate-700">${value}</span></div>`
            ).join("")}
            ${fields.length === 0 ? '<span class="text-slate-400">No hay datos de perfil disponibles</span>' : ""}
        </div>
        <div class="border-t border-slate-100 pt-3 text-center">
            <button class="modal-view-full-profile text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold px-4 py-1.5 rounded transition" data-pubkey="${pubkey}">👤 Ver Perfil Completo</button>
        </div>
    `;

    modal.classList.remove("hidden");
    modal.classList.add("flex", "show");
    content.querySelector(".btn-close-modal").onclick = () => closeProfileModal();
    content.querySelector(".modal-view-full-profile").onclick = () => {
        closeProfileModal();
        navigate(`#/profile/${pubkey}`);
    };
    modal.onclick = (e) => { if (e.target === modal) closeProfileModal(); };
}

function closeProfileModal() {
    const modal = document.getElementById("profile-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex", "show");
}

// --- Vote Helpers ---

async function handleVote(eventId, direction) {
    if (!session) { showToast("Debes iniciar sesión para votar", "error"); return; }
    const event = eventCache.get(eventId);
    if (!event) return;

    const directionStr = Voting.applyVote(eventId, direction, session.pk);
    Voting.updateVoteDisplay(eventId, session?.pk);
    Voting.guardarVoteCache();

    if (directionStr) {
        const voteEvent = Voting.buildVoteEvent(event, directionStr, session);
        await network.sendEvent(7, voteEvent.content, voteEvent.tags, session.pk, session.sk, session.mode);
    }
}

// --- Card event delegation (avoids cloneNode lost listeners) ---

function setupCardDelegation() {
    const containers = [document.getElementById('feed-container'), document.getElementById('lab-experiments')];
    const handler = (e) => {
        const toggleHistory = e.target.closest('[data-action="toggle-history"]');
        if (toggleHistory) {
            e.stopPropagation();
            e.preventDefault();
            const card = toggleHistory.closest('.post-card');
            if (card) {
                const panel = card.querySelector('.expandable-panel');
                if (panel) panel.classList.toggle('open');
            }
            return;
        }
        const openVersion = e.target.closest('[data-action="open-version"]');
        if (openVersion) {
            e.stopPropagation();
            e.preventDefault();
            navigate(`#/post/${openVersion.dataset.eventId}`);
            return;
        }
        const editBtn = e.target.closest('[data-action="edit"]');
        if (editBtn) {
            e.stopPropagation();
            const eid = editBtn.dataset.editId;
            const ev = eventCache.get(eid);
            if (ev) {
                editandoEventoId = eid;
                State.set('amendmentData', { id: eid, content: ev.content });
                navigate('#/editor');
            }
            return;
        }
        const modalEl = e.target.closest('[data-action="modal"]');
        if (modalEl) {
            e.stopPropagation();
            const pk = modalEl.dataset.pubkey;
            if (session && pk === session.pk) { navigate('#/my-lab'); return; }
            openProfileModal(pk);
            return;
        }
        const navEl = e.target.closest('[data-action="navigate"]');
        if (navEl) {
            navigate(`#/post/${navEl.dataset.eventId}`);
            return;
        }
        const voteBtn = e.target.closest('.vote-btn');
        if (voteBtn) {
            const voteTarget = voteBtn.closest('[data-vote-target]');
            if (voteTarget) {
                e.stopPropagation();
                handleVote(voteTarget.dataset.voteTarget, voteBtn.dataset.vote);
            }
            return;
        }
        const bookmarkBtn = e.target.closest('[data-action="bookmark"]');
        if (bookmarkBtn) {
            e.stopPropagation();
            e.preventDefault();
            const id = bookmarkBtn.dataset.bookmarkId;
            if (id) handleBookmarkToggle(id, bookmarkBtn);
            return;
        }
    };
    containers.forEach(c => { if (c) c.addEventListener('click', handler); });
}

async function handleBookmarkToggle(eventId, btn) {
    const nowStarred = await Bookmarks.toggle(eventId);
    if (btn) {
        btn.textContent = nowStarred ? '★' : '☆';
        btn.classList.toggle('text-amber-500', nowStarred);
        btn.classList.toggle('text-slate-400', !nowStarred);
    }
    document.querySelectorAll(`[data-bookmark-id="${eventId}"]`).forEach(other => {
        if (other === btn) return;
        other.textContent = nowStarred ? '★' : '☆';
        other.classList.toggle('text-amber-500', nowStarred);
        other.classList.toggle('text-slate-400', !nowStarred);
    });
    showToast(nowStarred ? '⭐ Guardado en bookmarks' : 'Quitado de bookmarks', nowStarred ? 'success' : 'info');
    if (session && session.pk && session.sk) {
        Bookmarks.publishToRelay(network, session).catch(err => console.warn('bookmarks publish failed:', err));
    }
    const labCount = document.getElementById('lab-bookmarks-count');
    if (labCount) labCount.textContent = Bookmarks.count();
}

// --- Category System ---

function renderCategoryPicker() {
    const container = document.getElementById("category-picker");
    container.innerHTML = Tags.TAXONOMY.map(parent => `
        <div class="mb-1">
            <button class="cat-group-btn" data-parent="${parent.id}">
                <span class="arrow">▶</span>
                ${parent.icon || "📁"} ${parent.label}
            </button>
            <div class="cat-children ml-2 space-y-0.5" data-children="${parent.id}">
                ${parent.children.map(child => {
                    const colors = Tags.getCategoryColors(child.id);
                    const isSelected = selectedPublishCategories.includes(child.id);
                    return `<button class="cat-child ${colors.border} ${isSelected ? `selected ${colors.bg} ${colors.text}` : ''}" data-path="${child.id}">
                        <span class="check ${colors.text}">${isSelected ? '✓' : ''}</span>
                        ${child.label}
                    </button>`;
                }).join("")}
            </div>
        </div>
    `).join("");

    container.querySelectorAll(".cat-group-btn").forEach(btn => {
        const children = container.querySelector(`[data-children="${btn.dataset.parent}"]`);
        if (children) {
            setTimeout(() => {
                const hasSelected = children.querySelector('.cat-child.selected');
                if (hasSelected) btn.classList.add('expanded');
            }, 0);
        }
        btn.addEventListener("click", () => {
            const children = container.querySelector(`[data-children="${btn.dataset.parent}"]`);
            if (children) {
                const isOpen = children.classList.contains('open');
                children.classList.toggle('open');
                btn.classList.toggle('expanded');
            }
        });
    });

    container.querySelectorAll(".cat-child").forEach(btn => {
        btn.addEventListener("click", () => {
            const path = btn.dataset.path;
            const colors = Tags.getCategoryColors(path);
            const idx = selectedPublishCategories.indexOf(path);
            if (idx === -1) {
                if (selectedPublishCategories.length >= 2) return;
                selectedPublishCategories.push(path);
                btn.classList.add("selected", colors.bg, colors.text);
                btn.querySelector('.check').textContent = '✓';
            } else {
                selectedPublishCategories.splice(idx, 1);
                btn.classList.remove("selected", colors.bg, colors.text);
                btn.querySelector('.check').textContent = '';
            }
            renderSelectedBadges();
        });
    });
}

function renderSelectedBadges() {
    const container = document.getElementById("selected-categories");
    if (selectedPublishCategories.length === 0) {
        container.innerHTML = '<span class="text-[10px] text-slate-400">Ninguna seleccionada</span>';
        return;
    }
    container.innerHTML = selectedPublishCategories.map(path => {
        const colors = Tags.getCategoryColors(path);
        return `<span class="selected-badge ${colors.bg} ${colors.text} ${colors.border}">
            ${Tags.getIcon(path)}${Tags.getLabel(path)}
            <button data-remove="${path}" class="remove-btn ${colors.text}">&times;</button>
        </span>`;
    }).join("");
    container.querySelectorAll("[data-remove]").forEach(btn => {
        btn.addEventListener("click", () => {
            const path = btn.dataset.remove;
            selectedPublishCategories = selectedPublishCategories.filter(p => p !== path);
            renderSelectedBadges();
            document.querySelectorAll(`.cat-child[data-path="${path}"]`).forEach(el => {
                const colors = Tags.getCategoryColors(path);
                el.classList.remove("selected", colors.bg, colors.text);
                const check = el.querySelector('.check');
                if (check) check.textContent = '';
            });
        });
    });
}

// --- Filters ---

function renderFilterBreadcrumb() {
    const container = document.getElementById("filter-breadcrumb");
    if (!currentFilterPath) {
        container.innerHTML = `<span class="role-chip role-chip-active" data-filter="">📋 Todas las categorías</span>`;
    } else {
        const parts = currentFilterPath.split("/");
        const crumbs = [{ path: "", label: "📋 Todas" }];
        const parentCat = Tags.TAXONOMY.find(c => c.id === parts[0]);
        if (parentCat) {
            crumbs.push({ path: parentCat.id, label: `${parentCat.icon || ""} ${parentCat.label}` });
            if (parts.length === 2) {
                const childCat = parentCat.children.find(c => c.id === currentFilterPath);
                if (childCat) crumbs.push({ path: childCat.id, label: `— ${childCat.label}` });
            }
        }
        container.innerHTML = crumbs.map((crumb, i) => {
            const isActive = crumb.path === currentFilterPath;
            const colors = crumb.path ? Tags.getCategoryColors(crumb.path) : null;
            const activeClass = isActive
                ? `role-chip-active ${colors?.text || ''}`
                : 'role-chip-inactive';
            return `<span class="filter-crumb role-chip ${activeClass}" data-filter="${crumb.path}">${crumb.label}</span>`;
        }).join("");
    }
    container.querySelectorAll(".filter-crumb").forEach(el => {
        el.addEventListener("click", () => {
            currentFilterPath = el.dataset.filter || null;
            renderFilterBreadcrumb();
            aplicarFiltros();
        });
    });
}

function renderRoleFilter() {
    const container = document.getElementById("filter-role-chips");
    const allChip = `<span class="role-chip ${!currentRoleFilter ? 'role-chip-active' : 'role-chip-inactive'}" data-role="">👥 Todos</span>`;
    const chips = Roles.ROLE_CATEGORIES.map(r => {
        const active = currentRoleFilter === r.id;
        return `<span class="role-chip ${active ? 'role-chip-active' : 'role-chip-inactive'}" data-role="${r.id}">${r.icon} ${r.label}</span>`;
    }).join("");
    container.innerHTML = allChip + chips;

    container.querySelectorAll(".role-chip").forEach(el => {
        el.addEventListener("click", () => {
            currentRoleFilter = el.dataset.role || null;
            renderRoleFilter();
            aplicarFiltros();
        });
    });
}

function aplicarFiltros() {
    const term = searchInput.value.toLowerCase();
    const state = FeedFilters.getState();
    const feedContainer = document.getElementById('feed-container');
    const emptyMsg = document.getElementById('feed-empty-bookmarks-msg');
    const countEl = document.getElementById('feed-result-count');

    const visibleCards = [];
    let totalCards = 0;

    document.querySelectorAll("#feed-container .post-card").forEach(card => {
        totalCards++;
        const cats = (card.dataset.categories || "").split(",").filter(Boolean);
        const catMatch = Tags.matchesFilter(cats, currentFilterPath);
        const cardRole = card.dataset.role || "";
        const roleMatch = !currentRoleFilter || cardRole === cardRole && (!currentRoleFilter || cardRole === currentRoleFilter);
        const createdAt = parseInt(card.dataset.createdAt || '0', 10);
        const eid = card.dataset.eventId;
        const rid = card.dataset.rootId || eid;
        const canonicalId = rid ? Revisions.getCanonicalVersion(rid) : null;
        const timeMatch = FeedFilters.matchesTimeRange(createdAt);
        const bookmarkMatch = FeedFilters.matchesOnlyBookmarks(eid);
        const supersededMatch = FeedFilters.matchesHideSuperseded(eid, rid, canonicalId);
        const textMatch = !term || card.textContent.toLowerCase().includes(term);

        const visible = catMatch && roleMatch && timeMatch && bookmarkMatch && supersededMatch && textMatch;
        card.classList.toggle("category-hidden", !catMatch);
        card.classList.toggle("role-hidden", !roleMatch);
        card.style.display = visible ? "" : "none";
        if (visible) visibleCards.push(card);
    });

    if (feedContainer && (state.sort !== 'recent' || state.onlyBookmarks || state.hideSuperseded || state.timeRange !== 'all')) {
        const sorted = [...visibleCards].sort((a, b) => {
            const sa = parseInt(a.dataset.score || '0', 10);
            const sb = parseInt(b.dataset.score || '0', 10);
            const ca = parseInt(a.dataset.commentCount || '0', 10);
            const cb = parseInt(b.dataset.commentCount || '0', 10);
            const fa = parseInt(a.dataset.forkCount || '0', 10);
            const fb = parseInt(b.dataset.forkCount || '0', 10);
            const ta = parseInt(a.dataset.createdAt || '0', 10);
            const tb = parseInt(b.dataset.createdAt || '0', 10);
            const titleA = (a.querySelector('.card-body')?.textContent || '').trim();
            const titleB = (b.querySelector('.card-body')?.textContent || '').trim();
            if (state.sort === 'top') return sb - sa;
            if (state.sort === 'discussed') return cb - ca;
            if (state.sort === 'forked') return fb - fa;
            if (state.sort === 'alpha') return titleA.localeCompare(titleB);
            return tb - ta;
        });
        for (const c of sorted) feedContainer.appendChild(c);
    }

    if (countEl) {
        countEl.textContent = `${visibleCards.length} de ${totalCards} post${totalCards === 1 ? '' : 's'}`;
        countEl.classList.toggle('text-emerald-600', visibleCards.length > 0);
        countEl.classList.toggle('text-slate-400', visibleCards.length === 0);
    }

    if (emptyMsg) {
        const showEmpty = state.onlyBookmarks && Bookmarks.count() === 0;
        emptyMsg.classList.toggle('hidden', !showEmpty);
    }
}

function syncFeedFilterUI() {
    const state = FeedFilters.getState();
    const sortSel = document.getElementById('feed-sort');
    const timeSel = document.getElementById('feed-time-range');
    const onlyBm = document.getElementById('feed-only-bookmarks');
    const hideSup = document.getElementById('feed-hide-superseded');
    if (sortSel) sortSel.value = state.sort;
    if (timeSel) timeSel.value = state.timeRange;
    if (onlyBm) onlyBm.checked = state.onlyBookmarks;
    if (hideSup) hideSup.checked = state.hideSuperseded;
}

// --- Event Rendering ---

function registerAmendment(event) {
    const rt = event.tags.find(t => t[0] === 'e' && t[3] === 'reply');
    if (!rt) return { isAmendment: false, isFork: false };
    const targetId = rt[1];
    const original = eventCache.get(targetId);
    const sameAuthor = !!(original && original.pubkey === event.pubkey);

    if (!sameAuthor) {
        event._isFork = true;
        event._forkTargetId = targetId;
        if (!original && network && typeof network.fetchEventById === "function") {
            network.fetchEventById(targetId);
        }
        console.log("[sciln/amendment] fork detected", {
            amendment: event.id?.slice(0, 8),
            target: targetId?.slice(0, 8),
            targetInCache: !!original,
            targetAuthor: original?.pubkey?.slice(0, 8),
            amendmentAuthor: event.pubkey?.slice(0, 8)
        });
        return { isAmendment: true, isFork: true };
    }

    Voting.transferVotes(targetId, event.id);
    amendmentNext.set(targetId, event.id);
    document.querySelectorAll(`[id="card-${targetId}"]`).forEach(c => c.remove());
    let rootId = targetId;
    let cur = eventCache.get(targetId);
    const visited = new Set();
    while (cur && !visited.has(cur.id)) {
        visited.add(cur.id);
        const r = cur.tags.find(t => t[0] === 'e' && t[3] === 'reply');
        if (!r) { rootId = cur.id; break; }
        cur = eventCache.get(r[1]);
    }
    const chain = [rootId];
    let c = rootId;
    while (amendmentNext.has(c)) { c = amendmentNext.get(c); chain.push(c); }
    for (let i = 0; i < chain.length - 1; i++) {
        document.querySelectorAll(`[id="card-${chain[i]}"]`).forEach(el => el.remove());
    }
    return { isAmendment: true, isFork: false, chain };
}

function isSuperseded(eventId) {
    return amendmentNext.has(eventId);
}

function getVersionPosition(eventId) {
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

function syncCardForRoot(rootId) {
    const canonicalId = Revisions.getCanonicalVersion(rootId);
    if (!canonicalId) return;
    const canonicalEv = eventCache.get(canonicalId);
    if (!canonicalEv) return;

    const existingRootCards = document.querySelectorAll(`#feed-container [data-root-id="${rootId}"], #lab-experiments [data-root-id="${rootId}"]`);
    let needsRender = true;
    existingRootCards.forEach(card => {
        if (card.dataset.eventId === canonicalId) {
            needsRender = false;
        } else {
            card.remove();
        }
    });

    const existingCard = document.getElementById(`card-${canonicalId}`);
    if (existingCard) {
        applyCanonicalBadges(existingCard, canonicalEv, rootId);
        return;
    }
    if (needsRender) {
        renderizarEvento(canonicalEv);
    }
}

function applyCanonicalBadges(card, event, rootId) {
    const linearChain = Revisions.getChain(rootId);
    const forks = Revisions.getForks(rootId);
    const totalVersions = linearChain.length;
    const totalForks = forks.length;
    const isForkWinner = Revisions.chains.byEvent.get(event.id)?.type === 'fork' ||
                         Revisions.chains.byEvent.get(event.id)?.type === 'fork-rev';

    card.classList.toggle('canonical-card', !!isForkWinner);

    let badges = card.querySelector('.revision-badges');
    if (!badges) {
        badges = document.createElement('div');
        badges.className = 'revision-badges flex gap-1 flex-wrap justify-end max-w-[50%]';
        const headerBadges = card.querySelector('.flex.gap-1.flex-wrap.justify-end');
        if (headerBadges && headerBadges.parentNode) {
            headerBadges.parentNode.insertBefore(badges, headerBadges.nextSibling);
        }
    }
    let html = '';
    if (totalVersions > 1) {
        const v = Revisions.getVersionNumber(event.id, eventCache);
        html += `<span class="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border bg-amber-100 text-amber-700 border-amber-200" title="Versión ${v} de ${totalVersions}">📜 v${v}</span>`;
    }
    if (totalForks > 0) {
        html += `<span class="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border bg-violet-100 text-violet-700 border-violet-200" title="${totalForks} fork(s) de este post">🔀 ${totalForks} fork${totalForks === 1 ? '' : 's'}</span>`;
    }
    if (isForkWinner) {
        html += `<span class="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border promoted-badge bg-emerald-100 text-emerald-700 border-emerald-200" title="Fork promovida por tener más votos">✨ promovida</span>`;
    }
    badges.innerHTML = html;
    if (totalVersions > 1 || totalForks > 0) {
        renderHistoryPanel(card, rootId, event.id);
    } else {
        const existing = card.querySelector('.expandable-panel');
        if (existing) existing.remove();
        const existingBtn = card.querySelector('[data-action="toggle-history"]');
        if (existingBtn) existingBtn.remove();
    }
}

function renderHistoryPanel(card, rootId, currentEventId) {
    let btn = card.querySelector('[data-action="toggle-history"]');
    if (!btn) {
        btn = document.createElement('button');
        btn.dataset.action = 'toggle-history';
        btn.className = 'text-[10px] font-mono text-indigo-600 hover:text-indigo-800 mt-2 self-start';
        const body = card.querySelector('.card-body');
        if (body) body.appendChild(btn);
    }
    const linear = Revisions.getChain(rootId);
    const forks = Revisions.getForks(rootId);
    const totalItems = linear.length + forks.reduce((acc, fr) => acc + Revisions.getForkChain(fr).length, 0);
    btn.textContent = `📜 Ver historial (${linear.length} versión${linear.length === 1 ? '' : 'es'} · ${forks.length} fork${forks.length === 1 ? '' : 's'})`;

    let panel = card.querySelector('.expandable-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.className = 'expandable-panel';
        const body = card.querySelector('.card-body');
        if (body) body.appendChild(panel);
    }
    panel.dataset.rootId = rootId;
    panel.dataset.currentEventId = currentEventId;

    const buildRow = (id, idx, isCanonical) => {
        const ev = eventCache.get(id);
        if (!ev) return '';
        const autor = cachePerfiles[ev.pubkey] || {};
        const name = autor.display_name || autor.name || `Científico...${ev.pubkey.substring(0,6)}`;
        const fecha = new Date(ev.created_at * 1000).toLocaleString();
        const commit = Revisions.getCommitMessage(ev) || '—';
        const score = Voting.getScore(id);
        const ver = Revisions.getVersionNumber(id, eventCache);
        const meta = Revisions.chains.byEvent.get(id);
        const isForkRev = meta?.type === 'fork' || meta?.type === 'fork-rev';
        const preview = (ev.content || '').replace(/\n+/g, ' ').slice(0, 110);
        return `<button data-action="open-version" data-event-id="${id}" class="timeline-item w-full text-left flex items-start gap-2 py-1.5 px-2 rounded hover:bg-slate-50 transition">
            <span class="timeline-item-dot ${isForkRev ? 'fork' : ''} ${isCanonical ? 'canonical' : ''}"></span>
            <span class="flex-1 min-w-0">
                <span class="flex items-center gap-2 text-[10px] font-mono">
                    <span class="font-bold ${isCanonical ? 'text-emerald-700' : (isForkRev ? 'text-violet-700' : 'text-amber-700')}">${isForkRev ? '🔀 fork v' : 'v'}${ver}</span>
                    <span class="text-slate-500 truncate">${escapeHtml(name)}</span>
                    <span class="text-slate-400">· ${fecha}</span>
                    <span class="ml-auto text-slate-500">${score >= 0 ? '+' : ''}${score}</span>
                    ${isCanonical ? '<span class="text-emerald-600 font-bold">CANÓNICA</span>' : ''}
                </span>
                <span class="text-[10px] text-slate-500 font-mono truncate block">📝 ${escapeHtml(commit)}</span>
                <span class="text-[10px] text-slate-400 truncate block">${escapeHtml(preview)}</span>
            </span>
        </button>`;
    };

    let html = '<div class="timeline mt-2 bg-slate-50 border border-slate-200 rounded-lg p-2">';
    html += '<div class="text-[9px] font-mono text-slate-400 mb-1 tracking-wider">HISTORIAL</div>';
    linear.forEach((id, i) => {
        const isCanonical = id === Revisions.getCanonicalVersion(rootId);
        html += buildRow(id, i, isCanonical);
    });
    forks.forEach(fr => {
        const chain = Revisions.getForkChain(fr);
        const autor = cachePerfiles[eventCache.get(fr)?.pubkey || ''] || {};
        const name = autor.display_name || autor.name || 'fork';
        html += `<div class="border-t border-slate-200 my-2 pt-2"><div class="text-[9px] font-mono text-violet-600 mb-1">🔀 fork por ${escapeHtml(name)}</div>`;
        chain.forEach((id, i) => {
            const isCanonical = id === Revisions.getCanonicalVersion(rootId);
            html += buildRow(id, i, isCanonical);
        });
        html += '</div>';
    });
    html += '</div>';
    panel.innerHTML = html;
}

function renderizarEvento(event) {
    if (!event.tags.some(t => t[0] === 't' && t[1] === 'sciln-eln')) return;
    if (document.getElementById(`card-${event.id}`)) return;
    eventCache.set(event.id, event);

    if (!Revisions.chains.byEvent.has(event.id) && !event.tags.some(t => t[0] === 'e' && t[3] === 'reply')) {
        Revisions.registerEvent(event, eventCache);
    }

    const isPartOfChain = Revisions.chains.byEvent.has(event.id);
    if (isPartOfChain) {
        const rootId = Revisions.getRootIdForEvent(event.id) || event.id;
        const prevCanonical = Revisions.getCanonicalVersion(rootId);
        const canonicalId = Revisions.recomputeCanonical(rootId, eventCache);
        if (canonicalId !== event.id) {
            syncCardForRoot(rootId);
            return;
        }
        document.querySelectorAll(`#feed-container [data-root-id="${rootId}"], #lab-experiments [data-root-id="${rootId}"]`).forEach(c => {
            if (c.dataset.eventId !== event.id) c.remove();
        });
        const oldCard = document.getElementById(`card-${event.id}`);
        if (oldCard) oldCard.remove();
        renderNewRevisionCard(event, rootId);
        if (prevCanonical && prevCanonical !== canonicalId) {
            syncCardForRoot(rootId);
        }
        return;
    }

    const isNewRevision = Revisions.isRevisionEvent(event);
    if (isNewRevision) {
        Revisions.registerEvent(event, eventCache);
        const rootId = Revisions.getRootIdForEvent(event.id) || event.id;
        const canonicalId = Revisions.recomputeCanonical(rootId, eventCache);
        if (canonicalId !== event.id) {
            syncCardForRoot(rootId);
            return;
        }
        document.querySelectorAll(`#feed-container [data-root-id="${rootId}"], #lab-experiments [data-root-id="${rootId}"]`).forEach(c => {
            if (c.dataset.eventId !== event.id) c.remove();
        });
        const oldCard = document.getElementById(`card-${event.id}`);
        if (oldCard) oldCard.remove();
        renderNewRevisionCard(event, rootId);
        return;
    }

    const esRevision = event.tags.find(t => t[0] === "e" && t[3] === "reply");
    let isFork = false;
    if (esRevision) {
        const reg = registerAmendment(event);
        isFork = reg.isFork;
        if (!isFork && isSuperseded(event.id)) return;
    } else if (isSuperseded(event.id)) {
        return;
    }

    const card = document.createElement("div");
    card.id = `card-${event.id}`;
    card.dataset.createdAt = event.created_at;
    card.dataset.fork = isFork ? "1" : "0";
    card.dataset.eventId = event.id;
    card.dataset.rootId = rootId || event.id;
    const _score0 = Voting.getScore(event.id);
    const _comments0 = Comments.getComments(event.id).length;
    const _forks0 = rootId ? (Revisions.getForks(rootId).length) : 0;
    const _canonical0 = Revisions.getCanonicalVersion(rootId || event.id);
    card.dataset.score = _score0;
    card.dataset.commentCount = _comments0;
    card.dataset.forkCount = _forks0;
    card.dataset.canonicalId = _canonical0 || '';

    const cats = Tags.extractCategories(event);
    card.dataset.categories = cats.join(",");

    const autor = cachePerfiles[event.pubkey] || {};
    card.dataset.role = autor.role_category || "";

    card.className = "post-card bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden";

    const fecha = new Date(event.created_at * 1000).toLocaleTimeString();
    let amendmentBadge = "";
    if (esRevision) {
        if (isFork) {
            const forkTarget = eventCache.get(event._forkTargetId);
            const forkAuthor = forkTarget ? (cachePerfiles[forkTarget.pubkey] || {}) : {};
            const forkName = forkAuthor.display_name || forkAuthor.name || (forkTarget ? `Científico...${forkTarget.pubkey.substring(0,6)}` : "autor");
            amendmentBadge = `<span class="amendment-badge fork-badge inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border bg-violet-100 text-violet-700 border-violet-200" title="Fork de ${escapeHtml(forkName)}">🔀 fork</span>`;
        } else {
            const v = getVersionPosition(event.id);
            amendmentBadge = `<span class="amendment-badge version-badge inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border bg-amber-100 text-amber-700 border-amber-200" title="Enmienda v${v}">📝 Enmienda v${v}</span>`;
        }
    }

    const avatarUrl = autor.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${event.pubkey}`;
    const displayName = autor.display_name || autor.name || `Científico...${event.pubkey.substring(0,6)}`;
    const roleIcon = Roles.getRoleIcon(autor.role_category);

    const roleParts = [];
    if (autor.role_category) roleParts.push(`${roleIcon} ${autor.position || Roles.getRoleLabel(autor.role_category)}`);
    if (autor.institution) roleParts.push(`🏛️ ${autor.institution}`);
    const roleLine = roleParts.length ? `<div class="text-[9px] text-slate-400 truncate">${roleParts.join(" · ")}</div>` : "";

    const badges = cats.map(c => {
        const label = Tags.getLabel(c);
        const icon = Tags.getIcon(c);
        return `<span class="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border ${Tags.getCategoryBadgeClass(c)}">${icon}${label}</span>`;
    }).join("");

    const score = Voting.getScore(event.id);
    const userVote = session ? Voting.getUserVote(event.id, session.pk) : null;
    const upColor = userVote === '+' ? 'text-green-500' : 'text-slate-400';
    const downColor = userVote === '-' ? 'text-red-500' : 'text-slate-400';

    const commentCount = Comments.getComments(event.id).length;

    card.innerHTML = `
        <div class="flex">
            <div class="vote-column flex flex-col items-center gap-0.5 px-2 py-3 bg-slate-50/50 shrink-0 border-r border-slate-100" data-vote-target="${event.id}">
                <button class="vote-up text-xs leading-none ${upColor} hover:text-green-600 transition vote-btn" data-vote="up">▲</button>
                <span class="vote-score text-xs font-bold font-mono text-slate-700">${score}</span>
                <button class="vote-down text-xs leading-none ${downColor} hover:text-red-500 transition vote-btn" data-vote="down">▼</button>
            </div>
            <div class="card-body flex-1 min-w-0 p-3 cursor-pointer hover:border-indigo-300 transition flex flex-col" data-action="navigate" data-event-id="${event.id}">
                <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div class="flex items-center gap-2 font-mono overflow-hidden">
                        <img src="${avatarUrl}" class="post-author-avatar w-7 h-7 rounded-full bg-slate-50 border cursor-pointer hover:opacity-80" data-pubkey="${event.pubkey}" data-action="modal">
                        <div class="overflow-hidden">
                            <div class="flex items-center gap-1">
                                <span class="post-author-name font-bold text-slate-700 text-[11px] truncate cursor-pointer hover:text-indigo-600" data-pubkey="${event.pubkey}" data-action="modal">${displayName}</span>
                            </div>
                            ${roleLine}
                        </div>
                    </div>
                    <div class="flex gap-1 flex-wrap justify-end max-w-[50%]">${badges}${amendmentBadge}</div>
                </div>
                <div class="prose prose-slate max-w-none text-xs mt-2 line-clamp-6">${parseScientificContent(event.content)}</div>
                <div class="flex justify-between items-center text-[9px] font-mono border-t border-slate-50 pt-2 mt-2">
                    <div class="flex items-center gap-2">
                        <button data-edit-id="${event.id}" class="text-indigo-600 hover:text-indigo-900 font-bold bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded transition" data-action="edit">
                            📝 Enmienda
                        </button>
                        <span class="text-slate-400" data-action="navigate" data-event-id="${event.id}">💬 ${commentCount}</span>
                        <button data-bookmark-id="${event.id}" class="bookmark-btn text-slate-400 hover:text-amber-500 font-bold transition" data-action="bookmark" title="Guardar en bookmarks">
                            ${Bookmarks.isBookmarked(event.id) ? '★' : '☆'}
                        </button>
                    </div>
                    <div class="text-slate-400">⏱️ ${fecha}</div>
                </div>
            </div>
        </div>
    `;

    document.getElementById("feed-container").insertBefore(card, document.getElementById("feed-container").firstChild);
    if (session && event.pubkey === session.pk) {
        const labClone = card.cloneNode(true);
        labClone.dataset.eventId = event.id;
        document.getElementById("lab-experiments").insertBefore(labClone, document.getElementById("lab-experiments").firstChild);
    }
}

function renderNewRevisionCard(event, rootId) {
    if (document.getElementById(`card-${event.id}`)) return;
    const cats = Tags.extractCategories(event);
    const autor = cachePerfiles[event.pubkey] || {};
    const fecha = new Date(event.created_at * 1000).toLocaleString();
    const avatarUrl = autor.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${event.pubkey}`;
    const displayName = autor.display_name || autor.name || `Científico...${event.pubkey.substring(0,6)}`;
    const roleIcon = Roles.getRoleIcon(autor.role_category);
    const roleParts = [];
    if (autor.role_category) roleParts.push(`${roleIcon} ${autor.position || Roles.getRoleLabel(autor.role_category)}`);
    if (autor.institution) roleParts.push(`🏛️ ${autor.institution}`);
    const roleLine = roleParts.length ? `<div class="text-[9px] text-slate-400 truncate">${roleParts.join(" · ")}</div>` : "";
    const badges = cats.map(c => {
        const label = Tags.getLabel(c);
        const icon = Tags.getIcon(c);
        return `<span class="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border ${Tags.getCategoryBadgeClass(c)}">${icon}${label}</span>`;
    }).join("");
    const score = Voting.getScore(event.id);
    const userVote = session ? Voting.getUserVote(event.id, session.pk) : null;
    const upColor = userVote === '+' ? 'text-green-500' : 'text-slate-400';
    const downColor = userVote === '-' ? 'text-red-500' : 'text-slate-400';
    const commentCount = Comments.getComments(event.id).length;
    const commit = Revisions.getCommitMessage(event) || '—';
    const v = Revisions.getVersionNumber(event.id, eventCache);

    const card = document.createElement("div");
    card.id = `card-${event.id}`;
    card.dataset.eventId = event.id;
    card.dataset.rootId = rootId;
    card.dataset.createdAt = event.created_at;
    card.dataset.score = score;
    card.dataset.commentCount = commentCount;
    card.dataset.forkCount = rootId ? Revisions.getForks(rootId).length : 0;
    card.dataset.canonicalId = Revisions.getCanonicalVersion(rootId) || '';
    card.dataset.categories = cats.join(",");
    card.dataset.role = autor.role_category || "";
    card.className = "post-card bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden";
    card.innerHTML = `
        <div class="flex">
            <div class="vote-column flex flex-col items-center gap-0.5 px-2 py-3 bg-slate-50/50 shrink-0 border-r border-slate-100" data-vote-target="${event.id}">
                <button class="vote-up text-xs leading-none ${upColor} hover:text-green-600 transition vote-btn" data-vote="up">▲</button>
                <span class="vote-score text-xs font-bold font-mono text-slate-700">${score}</span>
                <button class="vote-down text-xs leading-none ${downColor} hover:text-red-500 transition vote-btn" data-vote="down">▼</button>
            </div>
            <div class="card-body flex-1 min-w-0 p-3 hover:border-indigo-300 transition flex flex-col" data-event-id="${event.id}">
                <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div class="flex items-center gap-2 font-mono overflow-hidden">
                        <img src="${avatarUrl}" class="post-author-avatar w-7 h-7 rounded-full bg-slate-50 border cursor-pointer hover:opacity-80" data-pubkey="${event.pubkey}" data-action="modal">
                        <div class="overflow-hidden">
                            <div class="flex items-center gap-1">
                                <span class="post-author-name font-bold text-slate-700 text-[11px] truncate cursor-pointer hover:text-indigo-600" data-pubkey="${event.pubkey}" data-action="modal">${displayName}</span>
                            </div>
                            ${roleLine}
                        </div>
                    </div>
                    <div class="flex gap-1 flex-wrap justify-end max-w-[60%]">${badges}<span class="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border bg-amber-100 text-amber-700 border-amber-200">📜 v${v}</span></div>
                </div>
                <div class="prose prose-slate max-w-none text-xs mt-2 line-clamp-6 cursor-pointer" data-action="navigate" data-event-id="${event.id}">${parseScientificContent(event.content)}</div>
                <div class="text-[10px] text-slate-500 font-mono mt-1">📝 ${escapeHtml(commit)}</div>
                <div class="flex justify-between items-center text-[9px] font-mono border-t border-slate-50 pt-2 mt-2">
                    <div class="flex items-center gap-2">
                        <button data-edit-id="${event.id}" class="text-indigo-600 hover:text-indigo-900 font-bold bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded transition" data-action="edit">📝 Enmienda</button>
                        <span class="text-slate-400 cursor-pointer" data-action="navigate" data-event-id="${event.id}">💬 ${commentCount}</span>
                        <button data-bookmark-id="${event.id}" class="bookmark-btn text-slate-400 hover:text-amber-500 font-bold transition" data-action="bookmark" title="Guardar en bookmarks">
                            ${Bookmarks.isBookmarked(event.id) ? '★' : '☆'}
                        </button>
                    </div>
                    <div class="text-slate-400">⏱️ ${fecha}</div>
                </div>
            </div>
        </div>
    `;
    document.getElementById("feed-container").insertBefore(card, document.getElementById("feed-container").firstChild);
    if (session && event.pubkey === session.pk) {
        const labClone = card.cloneNode(true);
        labClone.dataset.eventId = event.id;
        document.getElementById("lab-experiments").insertBefore(labClone, document.getElementById("lab-experiments").firstChild);
    }
    applyCanonicalBadges(card, event, rootId);
}

// --- Network ---

network = new NostrNetwork(
    RELAY_URL,
    () => { netStatus.textContent = "🟢 Conectado"; network.fetchFeed(); },
    () => { netStatus.textContent = "🔴 Desconectado"; },
    (event) => {
        if (event.kind === 0) {
            const parsed = Crypto.parseKind0Event(event.pubkey, event.content);
            if (parsed) {
                cachePerfiles[event.pubkey] = parsed;
            }
        }
        if (event.kind === 1 && event.tags.some(t => t[0] === 't' && t[1] === 'sciln-eln')) {
            guardarEnCache(event);
            renderizarEvento(event);
            aplicarFiltros();
        }
        if (event.kind === 30211 && event.tags.some(t => t[0] === 't' && t[1] === 'sciln-eln')) {
            guardarEnCache(event);
            renderizarEvento(event);
            aplicarFiltros();
            const rootId = Revisions.getRootIdForEvent(event.id) || event.id;
            syncCardForRoot(rootId);
        }
        if (event.kind === 1 && event.tags.some(t => t[0] === 't' && t[1] === 'sciln-comment')) {
            Comments.processCommentEvent(event);
            Comments.guardarCommentCache();
            const rootTag = event.tags.find(t => t[0] === 'e' && t[3] === 'root') || event.tags.find(t => t[0] === 'e');
            if (rootTag) {
                const rootId = rootTag[1];
                updateCommentCount(rootId);
                if (currentViewedPost === rootId) {
                    renderPostDetail(rootId, eventCache, cachePerfiles, session, network);
                }
            }
        }
        if (event.kind === 7) {
            Voting.processVoteEvent(event);
            Voting.guardarVoteCache();
            const targetTag = event.tags.find(t => t[0] === 'e');
            if (targetTag) {
                Voting.updateVoteDisplay(targetTag[1], session?.pk);
                const rootId = Revisions.getRootIdForEvent(targetTag[1]);
                if (rootId) {
                    const previousCanonical = Revisions.getCanonicalVersion(rootId);
                    Revisions.recomputeCanonical(rootId, eventCache);
                    const newCanonical = Revisions.getCanonicalVersion(rootId);
                    if (previousCanonical !== newCanonical) {
                        syncCardForRoot(rootId);
                    } else {
                        const card = document.getElementById(`card-${targetTag[1]}`);
                        if (card) {
                            const rootIdOfCard = card.dataset.rootId;
                            if (rootIdOfCard) applyCanonicalBadges(card, eventCache.get(newCanonical), rootIdOfCard);
                        }
                    }
                }
            }
        }
        if (event.kind === Bookmarks.BOOKMARK_KIND) {
            if (session && event.pubkey === session.pk) {
                Bookmarks.mergeFromEvent(event);
                const labCount = document.getElementById('lab-bookmarks-count');
                if (labCount) labCount.textContent = Bookmarks.count();
            }
        }
    }
);

function updateCommentCount(eventId) {
    const count = Comments.getComments(eventId).length;
    document.querySelectorAll(`#card-${eventId} [data-event-id="${eventId}"] .text-slate-400`).forEach(el => {
        if (el.textContent.includes('💬')) {
            el.textContent = `💬 ${count}`;
        }
    });
}
// --- Multimedia: pipeline de imágenes con stubs ---

function renderAttachmentsPanel() {
    const panel = document.getElementById("editor-attachments");
    const wrapper = document.getElementById("editor-attachments-panel");
    const counter = document.getElementById("editor-attachments-count");
    if (!panel || !wrapper || !counter) return;
    const imgs = EditorImages.getAll();
    counter.textContent = imgs.length;
    if (!imgs.length) {
        wrapper.classList.add("hidden");
        panel.innerHTML = "";
        return;
    }
    wrapper.classList.remove("hidden");
    panel.innerHTML = imgs.map(img => {
        const safeName = (img.name || '').replace(/[<>"']/g, '');
        return `<div class="editor-attachment-thumb" data-image-id="${img.id}" title="${safeName} (${img.width}×${img.height})">
            <img src="${img.dataURL}" alt="${safeName}">
            <button class="editor-attachment-remove" data-remove-image="${img.id}" title="Quitar imagen">×</button>
            <div class="editor-attachment-info">${img.width}×${img.height}</div>
        </div>`;
    }).join("");
}

async function handleImageFiles(files) {
    if (!files || !files.length) return;
    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        try {
            const img = await EditorImages.attachImage(file);
            const stub = EditorImages.buildStub(img);
            const start = editor.selectionStart;
            editor.value = editor.value.substring(0, start) + `\n${stub}\n` + editor.value.substring(editor.selectionEnd);
            editor.selectionStart = editor.selectionEnd = start + stub.length + 2;
            renderAttachmentsPanel();
            updateLocalRender();
            showToast(`📎 ${file.name} adjuntado (${img.width}×${img.height})`, "success");
        } catch (err) {
            if (err.tooLarge) {
                showToast(`Imagen demasiado grande: ${file.name}`, "error");
            } else {
                showToast(`Error al procesar imagen: ${err.message}`, "error");
            }
        }
    }
}

function removeImageAndStub(id) {
    const stubRe = new RegExp(`\\\\n?\\\\[imagen:${id}[^\\\\]]*\\\\]\\\\n?`, 'g');
    editor.value = editor.value.replace(stubRe, '');
    editor.value = editor.value.replace(new RegExp(`^[ \\\\t]*\\\\[imagen:${id}[^\\\\]]*\\\\][ \\\\t]*\\\\n?`, 'm'), '');
    EditorImages.removeImage(id);
    renderAttachmentsPanel();
    updateLocalRender();
}

editor.addEventListener("paste", (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    let hasImage = false;
    for (let item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
                hasImage = true;
                handleImageFiles([file]);
            }
        }
    }
    if (hasImage) e.preventDefault();
});

editor.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropOverlay.classList.remove("opacity-0", "pointer-events-none");
});

editor.addEventListener("dragleave", (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
        dropOverlay.classList.add("opacity-0", "pointer-events-none");
    }
});

editor.addEventListener("drop", (e) => {
    e.preventDefault();
    dropOverlay.classList.add("opacity-0", "pointer-events-none");
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length) handleImageFiles(files);
});

document.getElementById("editor-attachments")?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-remove-image]");
    if (removeBtn) {
        e.preventDefault();
        e.stopPropagation();
        removeImageAndStub(removeBtn.dataset.removeImage);
    }
});

document.getElementById("btn-clear-attachments")?.addEventListener("click", () => {
    EditorImages.removeOrphanStubs(editor.value);
    const imgs = EditorImages.getAll();
    imgs.forEach(img => EditorImages.removeImage(img.id));
    editor.value = editor.value.replace(/\n?\[imagen:[a-zA-Z0-9_-]+[^\]]*\]\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
    renderAttachmentsPanel();
    updateLocalRender();
    showToast("Adjuntos quitados", "info");
});

renderAttachmentsPanel();

// --- Bookmarks: subscribe to changes for live count updates ---

Bookmarks.subscribe(() => {
    const labCount = document.getElementById('lab-bookmarks-count');
    if (labCount) labCount.textContent = Bookmarks.count();
    const labInfo = document.getElementById('lab-bookmarks-info');
    if (labInfo) {
        const n = Bookmarks.count();
        labInfo.textContent = `${n} guardado${n === 1 ? '' : 's'}`;
    }
    aplicarFiltros();
});

// --- Feed filters: state + wiring ---

FeedFilters.setBookmarkedChecker(Bookmarks.isBookmarked);
FeedFilters.setSupersededChecker((eventId, rootId, canonicalId) => canonicalId && canonicalId !== eventId);

FeedFilters.subscribe(() => aplicarFiltros());

document.getElementById("feed-sort")?.addEventListener("change", (e) => {
    FeedFilters.setSort(e.target.value);
});
document.getElementById("feed-time-range")?.addEventListener("change", (e) => {
    FeedFilters.setTimeRange(e.target.value);
});
document.getElementById("feed-only-bookmarks")?.addEventListener("change", (e) => {
    FeedFilters.setOnlyBookmarks(e.target.checked);
});
document.getElementById("feed-hide-superseded")?.addEventListener("change", (e) => {
    FeedFilters.setHideSuperseded(e.target.checked);
});
document.getElementById("btn-feed-reset-filters")?.addEventListener("click", () => {
    FeedFilters.reset();
    syncFeedFilterUI();
});

syncFeedFilterUI();

// --- Toolbar / atajos / autosave / contador ---

const editorCounter = document.getElementById("editor-counter");
const editorSavedStatus = document.getElementById("editor-saved-status");
const draftRestoreBanner = document.getElementById("draft-restore-banner");
const draftRestoreInfo = document.getElementById("draft-restore-info");
const editorGrid = document.getElementById("editor-grid");

function updateEditorCounter() {
    if (!editorCounter) return;
    const text = editor.value;
    const words = EditorToolbar.countWords(text);
    const chars = EditorToolbar.countChars(text);
    editorCounter.textContent = `${words} ${words === 1 ? 'palabra' : 'palabras'} · ${chars} caracteres`;
}

function updateEditorSavedStatus() {
    if (!editorSavedStatus) return;
    const at = EditorToolbar.getLastSavedAt();
    if (!at) { editorSavedStatus.textContent = ""; return; }
    const sec = Math.max(0, Math.floor((Date.now() - at) / 1000));
    if (sec < 5) editorSavedStatus.textContent = "✓ Borrador guardado";
    else if (sec < 60) editorSavedStatus.textContent = `✓ Guardado hace ${sec}s`;
    else editorSavedStatus.textContent = `✓ Guardado hace ${Math.floor(sec / 60)} min`;
}

function showDraftRestoreBanner(draft) {
    if (!draftRestoreBanner || !draft) return;
    const age = Date.now() - draft.savedAt;
    if (draftRestoreInfo) draftRestoreInfo.textContent = `Recuperado de ${formatDraftAge(age)} (${EditorToolbar.countWords(draft.content)} palabras)`;
    draftRestoreBanner.classList.remove("hidden");
}

function hideDraftRestoreBanner() {
    if (draftRestoreBanner) draftRestoreBanner.classList.add("hidden");
}

document.getElementById("editor-toolbar")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    e.preventDefault();
    EditorToolbar.applyAction(editor, btn.dataset.action);
    updateLocalRender();
    updateEditorCounter();
    editor.focus();
});

document.getElementById("btn-swap-layout")?.addEventListener("click", () => {
    editorGrid?.classList.toggle("editor-swap-layout");
});

document.getElementById("btn-restore-draft")?.addEventListener("click", () => {
    const draft = EditorToolbar.loadDraft();
    if (draft && draft.content) {
        editor.value = draft.content;
        updateLocalRender();
        updateEditorCounter();
        showToast("Borrador restaurado", "success");
    }
    hideDraftRestoreBanner();
});

document.getElementById("btn-discard-draft")?.addEventListener("click", () => {
    EditorToolbar.clearDraft();
    hideDraftRestoreBanner();
    showToast("Borrador descartado", "info");
});

editor.addEventListener("keydown", (e) => {
    EditorToolbar.handleKeydown(editor, e);
});

editor.addEventListener("sciln:publish-request", () => {
    if (btnPublish) btnPublish.click();
});

EditorToolbar.startAutosave(editor, () => updateEditorSavedStatus());
setInterval(updateEditorSavedStatus, 10000);
updateEditorCounter();
updateEditorSavedStatus();

// --- Event Listeners ---

editor.addEventListener("input", () => {
    updateLocalRender();
    updateEditorCounter();
});
btnGenerate.addEventListener("click", () => { Crypto.generateIdentity(); populateRoleDropdown(); syncUiSession(); });
btnLogout.addEventListener("click", () => { Crypto.clearSession(); populateRoleDropdown(); syncUiSession(); });

btnSaveProfile.addEventListener("click", async () => {
    if (!session) return;
    const data = gatherProfileFromForm();
    Crypto.saveLocalProfileMetadata(data);
    const metaPayload = Crypto.buildKind0Payload({ ...session, ...data });
    await network.sendEvent(0, metaPayload, [], session.pk, session.sk, session.mode);
    showToast("Perfil sincronizado en la red ✅", "success");
    syncUiSession();
});

btnPublish.addEventListener("click", async () => {
    if (!session || btnPublish.disabled) return;

    btnPublish.disabled = true;
    btnPublish.textContent = "Publicando... ⏳";

    const catTags = Tags.buildCategoryTags(selectedPublishCategories);
    let kind = 1;
    let tags = [["t", "sciln-eln"], ["client", "SciLn-ELN"], ...catTags];

    if (editandoEventoId) {
        const parent = eventCache.get(editandoEventoId);
        if (parent) {
            const commitInput = document.getElementById("commit-message");
            const commitMsg = commitInput ? commitInput.value.trim() : "";
            if (!commitMsg) {
                showToast("El resumen de la edición es obligatorio para revisiones", "error");
                btnPublish.disabled = false;
                btnPublish.textContent = "Publicar Reporte Firmado 🚀";
                return;
            }
            kind = Revisions.REVISION_KIND;
            tags = Revisions.buildRevisionTags(parent, commitMsg, eventCache);
        }
    }

    try {
        const expandedContent = EditorImages.expandStubs(editor.value);
        const exitoso = await network.sendEvent(kind, expandedContent, tags, session.pk, session.sk, session.mode);
        if (exitoso) {
            editor.value = "";
            editandoEventoId = null;
            State.set('amendmentData', null);
            selectedPublishCategories = [];
            renderSelectedBadges();
            document.querySelectorAll(".category-child").forEach(el => {
                el.classList.remove("text-indigo-600", "bg-indigo-50", "font-bold");
            });
            EditorImages.clearAll();
            EditorToolbar.clearDraft();
            hideDraftRestoreBanner();
            renderAttachmentsPanel();
            updateLocalRender();
            updateEditorCounter();
            updateEditorSavedStatus();
            document.getElementById("amendment-indicator").classList.add("hidden");
            const ci = document.getElementById("commit-message");
            if (ci) ci.value = "";
            const cw = document.getElementById("commit-message-wrapper");
            if (cw) cw.classList.add("hidden");
        }
    } finally {
        btnPublish.disabled = false;
        btnPublish.textContent = "Publicar Reporte Firmado 🚀";
    }
});

btnLoginExtension.addEventListener("click", async () => {
    try {
        await Crypto.loginWithExtension();
        populateRoleDropdown();
        syncUiSession();
    } catch (err) {
        showToast(err.message, "error");
    }
});

let searchDebounceTimer = null;
let activeSearchSubId = null;
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MIN_CHARS = 3;
let searchSubCounter = 0;

function triggerRelaySearch(term) {
    if (!network || typeof network.searchEvents !== "function") return;
    if (activeSearchSubId) {
        network.closeSubscription(activeSearchSubId);
        activeSearchSubId = null;
    }
    const cleanTerm = term.trim();
    if (cleanTerm.length < SEARCH_MIN_CHARS) return;
    searchSubCounter++;
    const subId = `sciln-search-${Date.now()}-${searchSubCounter}`;
    activeSearchSubId = subId;
    network.searchEvents(cleanTerm, subId);
}

searchInput.addEventListener("input", () => {
    aplicarFiltros();
    clearTimeout(searchDebounceTimer);
    const term = searchInput.value;
    if (!term.trim()) {
        if (activeSearchSubId && network) {
            network.closeSubscription(activeSearchSubId);
            activeSearchSubId = null;
        }
        return;
    }
    searchDebounceTimer = setTimeout(() => triggerRelaySearch(term), SEARCH_DEBOUNCE_MS);
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeProfileModal();
});

document.getElementById("btn-back-to-feed").addEventListener("click", () => navigate('#/feed'));
document.getElementById("btn-back-from-profile").addEventListener("click", () => window.history.back());

document.getElementById("btn-clear-editor").addEventListener("click", () => {
    editor.value = "";
    editandoEventoId = null;
    State.set('amendmentData', null);
    selectedPublishCategories = [];
    renderSelectedBadges();
    document.querySelectorAll(".category-child").forEach(el => {
        el.classList.remove("text-indigo-600", "bg-indigo-50", "font-bold");
    });
    EditorImages.clearAll();
    EditorToolbar.clearDraft();
    hideDraftRestoreBanner();
    renderAttachmentsPanel();
    updateLocalRender();
    updateEditorCounter();
    updateEditorSavedStatus();
    document.getElementById("amendment-indicator").classList.add("hidden");
    const cw = document.getElementById("commit-message-wrapper");
    if (cw) cw.classList.add("hidden");
    const ci = document.getElementById("commit-message");
    if (ci) ci.value = "";
});

const commitInput = document.getElementById("commit-message");
const commitCounter = document.getElementById("commit-counter");
if (commitInput && commitCounter) {
    commitInput.addEventListener("input", () => {
        commitCounter.textContent = `${commitInput.value.length}/120`;
    });
}

document.getElementById("btn-cancel-amendment").addEventListener("click", () => {
    editandoEventoId = null;
    State.set('amendmentData', null);
    document.getElementById("amendment-indicator").classList.add("hidden");
});

// --- Router callback ---

setOnPageChange((page, data) => {
    currentViewedPost = null;
    const amendmentData = State.get('amendmentData');
    if (page === 'post' && data) {
        currentViewedPost = data;
        State.set('currentPostId', data);
        renderPostDetail(data, eventCache, cachePerfiles, session, network);
    }
    if (page === 'profile' && data) {
        renderProfilePage(data, cachePerfiles, eventCache, session);
    }
    if (page === 'editor' && amendmentData) {
        const ad = amendmentData;
        editandoEventoId = ad.id;
        const { text: extracted } = EditorImages.loadImagesFromContent(ad.content);
        editor.value = extracted + `\n\n* Enmienda sobre [${ad.id.substring(0,6)}]: `;
        renderAttachmentsPanel();
        updateLocalRender();
        updateEditorCounter();
        hideDraftRestoreBanner();
        document.getElementById("amendment-event-id").textContent = ad.id.substring(0, 8);
        document.getElementById("amendment-indicator").classList.remove("hidden");
        const cw = document.getElementById("commit-message-wrapper");
        const ci = document.getElementById("commit-message");
        if (cw) cw.classList.remove("hidden");
        if (ci) {
            ci.value = "";
            ci.focus();
        }
    }
    if (page === 'editor' && !amendmentData) {
        const draft = EditorToolbar.loadDraft();
        if (draft && draft.content && draft.content.trim()) {
            showDraftRestoreBanner(draft);
        } else {
            hideDraftRestoreBanner();
        }
        updateEditorCounter();
    }
    if (page === 'my-lab' && session) {
        const activeTab = document.querySelector('.lab-tab.border-indigo-600');
        if (activeTab && activeTab.dataset.labtab === 'revisions') {
            renderRevisionsTab(eventCache, cachePerfiles, session);
        }
    }
});

// --- Cross-module state (replaces legacy window.__ globals) ---

State.set('network', network);
State.set('eventCache', eventCache);
State.set('amendmentNext', amendmentNext);
State.set('cachePerfiles', cachePerfiles);
State.set('session', session);

State.subscribe('session', (s) => {
    Bookmarks.setPubkey(s?.pk || null);
    if (s) network.fetchBookmarks(s.pk);
    else Bookmarks.setPubkey(null);
    const labCount = document.getElementById('lab-bookmarks-count');
    if (labCount) labCount.textContent = Bookmarks.count();
});

// --- Init ---

populateSelect("profile-academic-level", Roles.ACADEMIC_LEVELS, "Seleccionar nivel...");
populateSelect("profile-degrees", Roles.DEGREE_FIELDS, "Seleccionar campo...");
populateSelect("profile-department", Roles.DEPARTMENTS, "Seleccionar departamento...");
populateSelect("profile-country", Roles.COUNTRIES, "Seleccionar país...");
populateRoleDropdown();

editor.value = `# Bitácora Científica\n\nResultados en vivo:\n$$\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}$$`;
syncUiSession();
updateLocalRender();
renderCategoryPicker();
renderFilterBreadcrumb();
renderRoleFilter();
renderSelectedBadges();
initNavDropdown();
initLabTabs();
initRouter();
setupCardDelegation();
initTheme();
document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);

Voting.cargarVoteCache();
Comments.cargarCommentCache();
cargarDesdeCache();
network.connect();

// --- Cache ---

function guardarEnCache(event) {
    let cache = JSON.parse(localStorage.getItem('sciln_cache') || '[]');
    if (!cache.find(e => e.id === event.id)) {
        cache.push(event);
        if (cache.length > 100) cache.shift();
        localStorage.setItem('sciln_cache', JSON.stringify(cache));
    }
}

function cargarDesdeCache() {
    const cache = JSON.parse(localStorage.getItem('sciln_cache') || '[]');
    for (const event of cache) {
        if (event.tags?.some(t => t[0] === 't' && t[1] === 'sciln-eln')) {
            eventCache.set(event.id, event);
        }
    }
    for (const event of cache) {
        if (event.tags?.some(t => t[0] === 't' && t[1] === 'sciln-eln')) {
            const rt = event.tags.find(t => t[0] === 'e' && t[3] === 'reply');
            if (rt) {
                const target = eventCache.get(rt[1]);
                if (target && target.pubkey === event.pubkey) {
                    Voting.transferVotes(rt[1], event.id);
                    amendmentNext.set(rt[1], event.id);
                } else {
                    event._isFork = true;
                    event._forkTargetId = rt[1];
                }
            }
        }
    }
    Revisions.rebuildAll(eventCache);
    Revisions.recomputeAllCanonical(eventCache);
    for (const event of cache) {
        if (event.tags?.some(t => t[0] === 't' && t[1] === 'sciln-eln')) {
            if (Revisions.isRevisionEvent(event) || Revisions.isLegacyAmendmentEvent(event)) {
                const rootId = Revisions.getRootIdForEvent(event.id) || event.id;
                if (Revisions.getCanonicalVersion(rootId) === event.id) {
                    renderizarEvento(event);
                }
            } else if (!isSuperseded(event.id)) {
                renderizarEvento(event);
            }
        }
    }
    aplicarFiltros();
}
