import { parseScientificContent } from '../js/parser.js';
import * as Tags from '../js/tags.js';
import * as Roles from '../js/roles.js';
import { navigate } from '../js/router.js';
import * as Voting from '../js/voting.js';
import * as Revisions from '../js/revisions.js';
import * as Bookmarks from '../js/bookmarks.js';
import * as State from '../js/state.js';

export function renderProfilePage(pubkey, cachePerfiles, eventCache, session) {
    const container = document.getElementById('profile-page-container');
    container.innerHTML = '<div class="bg-white p-6 rounded-xl shadow border border-slate-200 text-center text-slate-400 font-mono text-xs">Cargando perfil...</div>';

    const profile = cachePerfiles[pubkey] || {};
    const avatarUrl = profile.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${pubkey}`;
    const displayName = profile.display_name || profile.name || `Científico...${pubkey.substring(0, 6)}`;
    const roleIcon = Roles.getRoleIcon(profile.role_category);
    const roleLabel = Roles.getRoleLabel(profile.role_category);

    const isOwn = session && pubkey === session.pk;
    const amendmentNext = State.get('amendmentNext') || new Map();
    const rep = Voting.getReputation(pubkey, eventCache, new Set(amendmentNext.keys()));
    const repColor = rep > 0 ? 'text-green-600' : (rep < 0 ? 'text-red-500' : 'text-slate-400');
    const repSign = rep > 0 ? '+' : '';
    const promotedForks = Revisions.countPromotedForksByAuthor(pubkey, eventCache);

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
    if (profile.website) fields.push(["🌐", "Web", `<a href="${profile.website}" target="_blank" class="text-indigo-600 hover:underline">${profile.website}</a>`]);
    if (profile.lud16) fields.push(["⚡", "Lightning", profile.lud16]);
    if (profile.github) fields.push(["💻", "GitHub", profile.github]);
    if (profile.twitter) fields.push(["🐦", "Twitter", profile.twitter]);
    if (profile.research_interests) fields.push(["🔬", "Intereses", profile.research_interests]);
    if (profile.about) fields.push(["📝", "Sobre mí", profile.about]);

    let html = `
        <div class="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
            <div class="bg-gradient-to-r from-indigo-500 to-purple-600 h-24"></div>
            <div class="px-6 pb-6 -mt-12">
                <div class="flex items-end gap-4">
                    <img src="${avatarUrl}" class="w-20 h-20 rounded-full border-4 border-white shadow-md">
                    <div class="pb-1">
                        <h2 class="text-lg font-bold text-slate-800 font-mono">${displayName} <span class="text-sm font-mono ${repColor}">⭐ ${repSign}${rep}</span></h2>
                        <div class="text-xs text-slate-500 font-mono">npub1${pubkey.substring(0, 20)}...</div>
                        <div class="text-[10px] font-mono ${repColor}">${rep} puntos de reputación</div>
                        ${promotedForks > 0 ? `<div class="text-[10px] font-mono text-emerald-700 mt-1">🧬 ${promotedForks} fork${promotedForks === 1 ? '' : 's'} promovido${promotedForks === 1 ? '' : 's'}</div>` : ''}
                        ${isOwn ? `<div class="text-[10px] font-mono text-amber-600 mt-1">⭐ ${Bookmarks.count()} post${Bookmarks.count() === 1 ? '' : 's'} guardado${Bookmarks.count() === 1 ? '' : 's'}</div>` : ''}
                        ${isOwn ? '<span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono mt-1 inline-block">👤 Este eres tú</span>' : ''}
                    </div>
                </div>
            </div>
            ${fields.length > 0 ? `
            <div class="px-6 pb-6 border-t border-slate-100 pt-4">
                <h3 class="text-xs font-bold text-slate-400 font-mono tracking-wider mb-3">📋 INFORMACIÓN</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                    ${fields.map(([icon, label, value]) =>
                        `<div class="flex gap-2 items-start"><span class="text-slate-400 w-5 shrink-0">${icon}</span><span class="text-slate-500 font-bold shrink-0 w-24">${label}:</span><span class="text-slate-700">${value}</span></div>`
                    ).join("")}
                </div>
            </div>` : `
            <div class="px-6 pb-6 border-t border-slate-100 pt-4">
                <span class="text-xs text-slate-400 font-mono">No hay datos de perfil disponibles</span>
            </div>`}
            <div class="px-6 pb-6 border-t border-slate-100 pt-4">
                <h3 class="text-xs font-bold text-slate-400 font-mono tracking-wider mb-3">📄 PUBLICACIONES RECIENTES</h3>
                <div id="profile-user-posts" class="space-y-3"></div>
            </div>
        </div>
    `;

    container.innerHTML = html;

    const userPosts = [];
    for (const [id, ev] of eventCache) {
        if (ev.pubkey === pubkey) userPosts.push(ev);
    }
    userPosts.sort((a, b) => b.created_at - a.created_at);

    const postsContainer = document.getElementById('profile-user-posts');
    if (!userPosts.length) {
        postsContainer.innerHTML = '<div class="text-center text-slate-400 font-mono text-xs py-4">Sin publicaciones aún</div>';
        return;
    }

    userPosts.slice(0, 20).forEach(ev => {
        const fecha = new Date(ev.created_at * 1000).toLocaleString();
        const cats = Tags.extractCategories(ev);
        const badges = cats.map(c => {
            const label = Tags.getLabel(c);
            const icon = Tags.getIcon(c);
            return `<span class="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border ${Tags.getCategoryBadgeClass(c)}">${icon}${label}</span>`;
        }).join("");

        const div = document.createElement('div');
        div.className = 'bg-slate-50 border border-slate-200 rounded-lg p-3 cursor-pointer hover:border-indigo-300 transition post-link';
        div.dataset.eventId = ev.id;
        div.innerHTML = `
            <div class="flex items-center justify-between mb-1">
                <div class="text-[9px] text-slate-400 font-mono">⏱️ ${fecha}</div>
                <div class="flex gap-1">${badges}</div>
            </div>
            <div class="prose prose-slate max-w-none text-xs line-clamp-3">${parseScientificContent(ev.content)}</div>
        `;
        div.addEventListener('click', () => navigate(`#/post/${ev.id}`));
        postsContainer.appendChild(div);
    });
}
