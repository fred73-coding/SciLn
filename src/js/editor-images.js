// Editor Images - pipeline de compresión + stubs para el editor de SciLn
// Convierte imágenes pegadas/arrastradas en stubs compactos [imagen:id · size · WxH]
// y los expande a data URLs al publicar. Mantiene el editor legible.
//
// Pipeline: image File → canvas resize (max 1200×1600) → JPEG q=0.85 → data URL
// Se guarda en `sciln_pending_images` (localStorage) y se referencia con
// un stub inline en el contenido markdown.

const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1600;
const QUALITY = 0.85;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const STORAGE_KEY = 'sciln_pending_images';
const STUB_PREFIX = '[imagen:';
const STUB_SUFFIX = ']';

const pendingImages = new Map();

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const obj = JSON.parse(raw);
        for (const [id, img] of Object.entries(obj)) {
            pendingImages.set(id, img);
        }
    } catch (e) {
        console.warn('editor-images: storage corrupto, ignorando', e);
    }
}

function saveToStorage() {
    try {
        const obj = {};
        for (const [id, img] of pendingImages) obj[id] = img;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
        console.error('editor-images: no se pudo persistir', e);
    }
}

/** Wipe all pending images and clear the storage. */
export function clearAll() {
    pendingImages.clear();
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
}

/** @returns {Array<{id:string, name:string, width:number, height:number, bytes:number, dataURL:string}>} */
export function getAll() {
    return [...pendingImages.values()];
}

/** @param {string} id @returns {boolean} */
export function hasImage(id) {
    return pendingImages.has(id);
}

/** @param {string} id @returns {object|null} */
export function getImage(id) {
    return pendingImages.get(id) || null;
}

function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Build a compact stub for inline use in the editor.
 * @param {{id:string, name:string, width:number, height:number, bytes:number}} image
 * @returns {string} markdown line like `![alt][imagen:id · WxH · KB]`
 */
export function buildStub(image) {
    return `${STUB_PREFIX}${image.id} · ${image.name} · ${formatBytes(image.size)} · ${image.width}×${image.height}${STUB_SUFFIX}`;
}

/**
 * @param {string} text markdown source
 * @returns {string[]} all image stub IDs referenced in the text
 */
export function extractStubIds(text) {
    if (!text) return [];
    const re = /\[imagen:([a-zA-Z0-9_-]+)\s*·[^\]]*\]/g;
    const ids = [];
    let m;
    while ((m = re.exec(text)) !== null) ids.push(m[1]);
    return ids;
}

/**
 * Replace every stub in `text` with its data-URL `<img>` tag.
 * @param {string} text
 * @returns {string}
 */
export function expandStubs(text) {
    if (!text) return text;
    return text.replace(/\[imagen:([a-zA-Z0-9_-]+)[^\]]*\]/g, (match, id) => {
        const img = pendingImages.get(id);
        if (!img) return match;
        const alt = (img.name || 'adjunto').replace(/[\[\]]/g, '');
        return `![${alt}](${img.dataURL})`;
    });
}

/**
 * Remove a pending image by id. Does not touch the markdown text.
 * @param {string} id
 * @returns {boolean} true if the id was present
 */
export function removeImage(id) {
    if (!pendingImages.has(id)) return null;
    pendingImages.delete(id);
    saveToStorage();
    return id;
}

/**
 * Strip image stubs whose backing image is no longer in `pendingImages`.
 * @param {string} text
 * @returns {string}
 */
export function removeOrphanStubs(text) {
    if (!text) return text;
    const validIds = new Set(extractStubIds(text));
    let changed = false;
    for (const id of [...pendingImages.keys()]) {
        if (!validIds.has(id)) {
            pendingImages.delete(id);
            changed = true;
        }
    }
    if (changed) saveToStorage();
    return text;
}

function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().split('-')[0];
    return Math.random().toString(36).slice(2, 12);
}

function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h).toString(36);
}

/**
 * Compress a File down to a data URL via canvas resize + JPEG encode.
 * @param {File|Blob} file
 * @param {number} [maxWidth=1200]
 * @param {number} [maxHeight=1600]
 * @param {number} [quality=0.85]
 * @returns {Promise<{dataURL:string, width:number, height:number, bytes:number}>}
 */
export function compressImage(file, maxWidth = MAX_WIDTH, maxHeight = MAX_HEIGHT, quality = QUALITY) {
    return new Promise((resolve, reject) => {
        if (!file) return reject(new Error('file requerido'));
        if (!file.type.startsWith('image/')) return reject(new Error('no es imagen'));
        const isPng = file.type === 'image/png';
        const targetType = isPng ? 'image/png' : 'image/jpeg';
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            try {
                let { width, height } = img;
                const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
                const w = Math.round(width * ratio);
                const h = Math.round(height * ratio);
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, w, h);
                const dataURL = canvas.toDataURL(targetType, quality);
                URL.revokeObjectURL(url);
                const size = Math.floor((dataURL.length - `data:${targetType};base64,`.length) * 0.75);
                resolve({ dataURL, width: w, height: h, size, type: targetType });
            } catch (err) {
                URL.revokeObjectURL(url);
                reject(err);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('no se pudo decodificar la imagen'));
        };
        img.src = url;
    });
}

export async function attachImage(file) {
    if (!file) throw new Error('file requerido');
    if (file.size > MAX_FILE_BYTES) {
        const err = new Error(`Imagen demasiado grande (${formatBytes(file.size)} > ${formatBytes(MAX_FILE_BYTES)})`);
        err.tooLarge = true;
        throw err;
    }
    const compressed = await compressImage(file);
    const id = generateId();
    const image = {
        id,
        name: file.name || `adjunto-${id}.${compressed.type === 'image/png' ? 'png' : 'jpg'}`,
        type: compressed.type,
        size: compressed.size,
        width: compressed.width,
        height: compressed.height,
        dataURL: compressed.dataURL,
        originalSize: file.size,
        addedAt: Date.now()
    };
    pendingImages.set(id, image);
    saveToStorage();
    return image;
}

loadFromStorage();

/**
 * Re-attach any `data:` image URLs found in `content` to the pending
 * store and rewrite the content with stubs. Used on amendment prefill.
 * @param {string} content
 * @returns {{text:string, attached:number}}
 */
export function loadImagesFromContent(content) {
    if (!content || typeof content !== 'string') return { text: content || '', count: 0 };
    const re = /!\[([^\]]*)\]\((data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+)\)/g;
    const seenHashes = new Map();
    let count = 0;
    const result = content.replace(re, (match, alt, dataURL) => {
        const hash = hashString(dataURL);
        let id;
        if (seenHashes.has(hash)) {
            id = seenHashes.get(hash);
        } else {
            id = `ext-${hash}`;
            seenHashes.set(hash, id);
            if (!pendingImages.has(id)) {
                const typeMatch = dataURL.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
                const mime = typeMatch ? typeMatch[1] : 'image/jpeg';
                const base64 = dataURL.split(',')[1] || '';
                const size = Math.floor(base64.length * 0.75);
                const safeAlt = (alt || '').trim() || `adjunto-${id}`;
                pendingImages.set(id, {
                    id,
                    name: safeAlt.endsWith(`.${mime === 'image/png' ? 'png' : 'jpg'}`) ? safeAlt : `${safeAlt}.${mime === 'image/png' ? 'png' : 'jpg'}`,
                    type: mime,
                    size,
                    width: 0,
                    height: 0,
                    dataURL,
                    originalSize: size,
                    addedAt: Date.now(),
                    fromExtraction: true
                });
                count++;
            }
        }
        return `[imagen:${id} · ${(alt || 'adjunto').replace(/[\[\]·]/g, '_')} · ${pendingImages.get(id).size >= 1024 ? `${(pendingImages.get(id).size / 1024).toFixed(1)} KB` : `${pendingImages.get(id).size} B`} · ?×?]`;
    });
    if (count > 0) saveToStorage();
    return { text: result, count };
}
