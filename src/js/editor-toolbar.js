// Editor Toolbar - wrap, insert y atajos para el editor markdown de SciLn

const TAB_INDENT = '  ';

function getSelection(editor) {
    return {
        start: editor.selectionStart,
        end: editor.selectionEnd,
        text: editor.value.substring(editor.selectionStart, editor.selectionEnd)
    };
}

function setSelection(editor, start, end) {
    editor.focus();
    editor.setSelectionRange(start, end);
}

function replaceRange(editor, start, end, replacement, cursorOffset) {
    const before = editor.value.substring(0, start);
    const after = editor.value.substring(end);
    editor.value = before + replacement + after;
    const caret = start + (cursorOffset ?? replacement.length);
    setSelection(editor, caret, caret);
}

function isWrapped(text, marker) {
    if (marker.length === 1) {
        return text.startsWith(marker) && text.endsWith(marker) && text.length >= 2 * marker.length;
    }
    return text.startsWith(marker) && text.endsWith(marker) && text.length >= 2 * marker.length;
}

function unwrap(text, marker) {
    if (!isWrapped(text, marker)) return text;
    if (marker === '$$') return text.slice(2, -2).trim();
    if (marker === '$') return text.slice(1, -1).trim();
    return text.slice(marker.length, -marker.length);
}

function toggleWrap(editor, marker, placeholder = '') {
    const sel = getSelection(editor);
    const before = editor.value.substring(0, sel.start);
    const needsNewlineBefore = before.length > 0 && !before.endsWith('\n');
    const prefix = needsNewlineBefore ? '\n' : '';
    if (!sel.text) {
        const insert = `${prefix}${marker}${placeholder}${marker}`;
        const caretOffset = prefix.length + marker.length + placeholder.length;
        replaceRange(editor, sel.start, sel.end, insert, caretOffset);
        return;
    }
    if (isWrapped(sel.text, marker)) {
        const unwrapped = unwrap(sel.text, marker);
        replaceRange(editor, sel.start, sel.end, unwrapped, unwrapped.length);
    } else {
        const wrapped = `${prefix}${marker}${sel.text}${marker}`;
        const caretOffset = prefix.length + marker.length + sel.text.length;
        replaceRange(editor, sel.start, sel.end, wrapped, caretOffset);
    }
}

function wrapWith(editor, before, after, placeholder = '') {
    const sel = getSelection(editor);
    if (!sel.text) {
        const insert = `${before}${placeholder}${after}`;
        const caretOffset = before.length + placeholder.length;
        replaceRange(editor, sel.start, sel.end, insert, caretOffset);
    } else {
        replaceRange(editor, sel.start, sel.end, `${before}${sel.text}${after}`, before.length + sel.text.length + after.length);
    }
}

function toggleLinePrefix(editor, prefix) {
    const sel = getSelection(editor);
    const lineStart = editor.value.lastIndexOf('\n', sel.start - 1) + 1;
    const before = editor.value.substring(0, lineStart);
    const lineEnd = editor.value.indexOf('\n', sel.end);
    const realEnd = lineEnd === -1 ? editor.value.length : lineEnd;
    let lineContent = editor.value.substring(lineStart, realEnd);
    let newContent;
    let caretOffset;
    if (lineContent.startsWith(prefix)) {
        newContent = lineContent.slice(prefix.length);
        caretOffset = prefix.length;
    } else {
        newContent = prefix + lineContent;
        caretOffset = 0;
    }
    editor.value = before + newContent + editor.value.substring(realEnd);
    setSelection(editor, lineStart, lineStart + newContent.length);
}

function insertAtCursor(editor, text) {
    const sel = getSelection(editor);
    const before = editor.value.substring(0, sel.start);
    const needsNewline = before.length > 0 && !before.endsWith('\n');
    const insert = (needsNewline ? '\n' : '') + text;
    replaceRange(editor, sel.start, sel.end, insert, insert.length);
}

export const ACTIONS = {
    bold: { marker: '**', placeholder: 'texto en negrita' },
    italic: { marker: '*', placeholder: 'texto en cursiva' },
    code: { marker: '`', placeholder: 'código' },
    mathInline: { marker: '$', placeholder: 'E = mc^2' },
    mathBlock: { marker: '$$', placeholder: '\\nabla \\cdot E = \\rho/\\epsilon_0' }
};

/**
 * Apply a formatting action to the editor selection.
 * @param {HTMLTextAreaElement} editor
 * @param {'bold'|'italic'|'code'|'mathInline'|'mathBlock'|'list'|'numList'|'heading'|'quote'|'link'|'hr'} action
 */
export function applyAction(editor, action) {
    if (!editor) return;
    if (action === 'bold') return toggleWrap(editor, '**', ACTIONS.bold.placeholder);
    if (action === 'italic') return toggleWrap(editor, '*', ACTIONS.italic.placeholder);
    if (action === 'code') return toggleWrap(editor, '`', ACTIONS.code.placeholder);
    if (action === 'mathInline') return toggleWrap(editor, '$', ACTIONS.mathInline.placeholder);
    if (action === 'mathBlock') {
        const sel = getSelection(editor);
        const before = editor.value.substring(0, sel.start);
        const needsNewline = before.length > 0 && !before.endsWith('\n');
        const placeholder = ACTIONS.mathBlock.placeholder;
        if (sel.text) {
            const wrapped = `${needsNewline ? '\n' : ''}$$\n${sel.text}\n$$`;
            replaceRange(editor, sel.start, sel.end, wrapped, wrapped.length);
        } else {
            const insert = `${needsNewline ? '\n' : ''}$$\n${placeholder}\n$$`;
            replaceRange(editor, sel.start, sel.end, insert, insert.length - 2);
        }
        return;
    }
    if (action === 'list') return toggleLinePrefix(editor, '- ');
    if (action === 'numList') return toggleLinePrefix(editor, '1. ');
    if (action === 'heading') return toggleLinePrefix(editor, '## ');
    if (action === 'quote') return toggleLinePrefix(editor, '> ');
    if (action === 'link') {
        const sel = getSelection(editor);
        if (sel.text) {
            wrapWith(editor, '[', '](https://)', '');
        } else {
            insertAtCursor(editor, '[texto](https://)');
        }
        return;
    }
    if (action === 'hr') return insertAtCursor(editor, '\n---\n');
}

/**
 * Global keydown handler for the editor textarea. Handles Tab / Shift+Tab
 * indent, Ctrl/Cmd+B/I/E/K formatting, Ctrl/Cmd+Alt+M inline math, and
 * Ctrl/Cmd+Enter → fires a `sciln:publish-request` CustomEvent.
 * @param {HTMLTextAreaElement} editor
 * @param {KeyboardEvent} e
 * @returns {boolean} true if the event was handled
 */
export function handleKeydown(editor, e) {
    if (!editor) return false;
    if (e.key === 'Tab' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const sel = getSelection(editor);
        const before = editor.value.substring(0, sel.start);
        const needsNewline = before.length > 0 && !before.endsWith('\n') && sel.start === sel.end;
        const insert = (needsNewline ? '\n' : '') + TAB_INDENT;
        replaceRange(editor, sel.start, sel.end, insert, insert.length);
        return true;
    }
    if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        const sel = getSelection(editor);
        const lineStart = editor.value.lastIndexOf('\n', sel.start - 1) + 1;
        const linePrefix = editor.value.substring(lineStart, sel.start);
        if (linePrefix.startsWith(TAB_INDENT)) {
            editor.value = editor.value.substring(0, lineStart) + linePrefix.slice(TAB_INDENT.length) + editor.value.substring(sel.start);
            setSelection(editor, sel.start - TAB_INDENT.length, sel.start - TAB_INDENT.length);
        }
        return true;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'b') { e.preventDefault(); applyAction(editor, 'bold'); return true; }
        if (key === 'i') { e.preventDefault(); applyAction(editor, 'italic'); return true; }
        if (key === 'e') { e.preventDefault(); applyAction(editor, 'code'); return true; }
        if (key === 'k') { e.preventDefault(); applyAction(editor, 'link'); return true; }
    }
    if ((e.ctrlKey || e.metaKey) && e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'm') { e.preventDefault(); applyAction(editor, 'mathInline'); return true; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        editor.dispatchEvent(new CustomEvent('sciln:publish-request', { bubbles: true }));
        return true;
    }
    return false;
}

/** @param {string} text @returns {number} */
export function countWords(text) {
    if (!text) return 0;
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
}

/** @param {string} text @returns {number} */
export function countChars(text) {
    return text ? text.length : 0;
}

const DRAFT_KEY = 'sciln_editor_draft';
const DRAFT_INTERVAL_MS = 5000;
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let saveTimer = null;
let lastSavedAt = 0;

/** Persist the current editor value to localStorage as a draft. */
export function saveDraft(editor) {
    if (!editor) return;
    const value = editor.value;
    if (!value || !value.trim()) {
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
        return;
    }
    const indicator = document.getElementById('amendment-indicator');
    const draft = {
        content: value,
        savedAt: Date.now(),
        hasAmendment: indicator ? !indicator.classList.contains('hidden') : false,
        amendmentId: document.getElementById('amendment-event-id')?.textContent || null
    };
    try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        lastSavedAt = draft.savedAt;
    } catch (e) {
        console.warn('editor-draft: no se pudo guardar', e);
    }
}

/** @returns {{content:string, savedAt:number, hasAmendment:boolean, amendmentId:string|null}|null} */
export function loadDraft() {
    try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return null;
        const draft = JSON.parse(raw);
        if (!draft || typeof draft.content !== 'string') return null;
        if (Date.now() - (draft.savedAt || 0) > DRAFT_MAX_AGE_MS) {
            localStorage.removeItem(DRAFT_KEY);
            return null;
        }
        return draft;
    } catch (e) {
        return null;
    }
}

/** Delete any saved draft. */
export function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
    lastSavedAt = 0;
}

/** @returns {number} epoch ms of the most recent successful draft save */
export function getLastSavedAt() {
    return lastSavedAt;
}

/**
 * Begin autosaving the editor every 5s. Calling twice replaces the timer.
 * @param {HTMLTextAreaElement} editor
 * @param {(savedAt:number) => void} [onSaved] called after each save
 */
export function startAutosave(editor, onSaved) {
    if (saveTimer) clearInterval(saveTimer);
    saveTimer = setInterval(() => {
        saveDraft(editor);
        if (onSaved) onSaved(lastSavedAt);
    }, DRAFT_INTERVAL_MS);
}

/** Stop the autosave timer, if any. */
export function stopAutosave() {
    if (saveTimer) { clearInterval(saveTimer); saveTimer = null; }
}
