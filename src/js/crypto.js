export function generateIdentity() {
    const cryptoBuffer = new Uint8Array(32);
    window.crypto.getRandomValues(cryptoBuffer);
    const sk = Array.from(cryptoBuffer).map(b => b.toString(16).padStart(2, '0')).join('');
    const tools = window.NostrTools || NostrTools;
    const pk = tools.getPublicKey(sk);

    localStorage.setItem("sciln_sk", sk);
    localStorage.setItem("sciln_pk", pk);
    localStorage.setItem("sciln_mode", "local");
    return { sk, pk };
}

export async function loginWithExtension() {
    if (!window.nostr) {
        throw new Error("No se detectó ninguna extensión de Nostr instalada (ej. Alby o Nos2x).");
    }
    const pk = await window.nostr.getPublicKey();
    localStorage.setItem("sciln_pk", pk);
    localStorage.setItem("sciln_mode", "extension");
    localStorage.removeItem("sciln_sk");
    return { pk };
}

export function loadStoredSession() {
    const pk = localStorage.getItem("sciln_pk");
    const mode = localStorage.getItem("sciln_mode");
    if (!pk) return null;
    return {
        pk, mode,
        sk: mode === "local" ? localStorage.getItem("sciln_sk") : null,
        name: localStorage.getItem("sciln_name") || "",
        display_name: localStorage.getItem("sciln_display_name") || "",
        about: localStorage.getItem("sciln_about") || "",
        picture: localStorage.getItem("sciln_picture") || "",
        banner: localStorage.getItem("sciln_banner") || "",
        website: localStorage.getItem("sciln_website") || "",
        nip05: localStorage.getItem("sciln_nip05") || "",
        lud16: localStorage.getItem("sciln_lud16") || "",
        role_category: localStorage.getItem("sciln_role_category") || "",
        position: localStorage.getItem("sciln_position") || "",
        academic_level: localStorage.getItem("sciln_academic_level") || "",
        degrees: localStorage.getItem("sciln_degrees") || "",
        institution: localStorage.getItem("sciln_institution") || "",
        department: localStorage.getItem("sciln_department") || "",
        location: localStorage.getItem("sciln_location") || "",
        orcid: localStorage.getItem("sciln_orcid") || "",
        research_interests: localStorage.getItem("sciln_research_interests") || "",
        github: localStorage.getItem("sciln_github") || "",
        twitter: localStorage.getItem("sciln_twitter") || "",
    };
}

export function saveLocalProfileMetadata(data) {
    const fields = [
        "name", "display_name", "about", "picture", "banner",
        "website", "nip05", "lud16",
        "role_category", "position", "academic_level", "degrees",
        "institution", "department", "location", "orcid",
        "research_interests", "github", "twitter",
    ];
    for (const f of fields) {
        if (data[f] !== undefined) {
            localStorage.setItem(`sciln_${f}`, data[f]);
        }
    }
}

export function buildKind0Payload(session) {
    return JSON.stringify({
        name: session.name || "",
        display_name: session.display_name || "",
        about: session.about || "",
        picture: session.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${session.pk}`,
        banner: session.banner || "",
        website: session.website || "",
        nip05: session.nip05 || "",
        lud16: session.lud16 || "",
        role_category: session.role_category || "",
        position: session.position || "",
        academic_level: session.academic_level || "",
        degrees: session.degrees || "",
        institution: session.institution || "",
        department: session.department || "",
        location: session.location || "",
        orcid: session.orcid || "",
        research_interests: session.research_interests || "",
        github: session.github || "",
        twitter: session.twitter || "",
    });
}

export function parseKind0Event(pubkey, content) {
    try {
        const meta = JSON.parse(content);
        return {
            pubkey,
            name: meta.name || "",
            display_name: meta.display_name || "",
            about: meta.about || "",
            picture: meta.picture || "",
            banner: meta.banner || "",
            website: meta.website || "",
            nip05: meta.nip05 || "",
            lud16: meta.lud16 || "",
            role_category: meta.role_category || "",
            position: meta.position || "",
            academic_level: meta.academic_level || "",
            degrees: meta.degrees || "",
            institution: meta.institution || "",
            department: meta.department || "",
            location: meta.location || "",
            orcid: meta.orcid || "",
            research_interests: meta.research_interests || "",
            github: meta.github || "",
            twitter: meta.twitter || "",
        };
    } catch {
        return null;
    }
}

export function clearSession() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith("sciln_"));
    keys.forEach(k => localStorage.removeItem(k));
}
