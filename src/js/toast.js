// src/js/toast.js
// Lightweight, auto-dismissing toast notifications rendered into
// #toast-container (defined in index.html).

const TOAST_DURATION = 3500;

/**
 * Show a toast in #toast-container. Auto-dismisses after 3.5s or on close click.
 * @param {string} message HTML-escaped by callers; this fn inserts as innerHTML
 * @param {'success'|'error'|'info'} [type='info']
 */
export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const colors = {
        success: 'border-l-emerald-500 bg-emerald-50 text-emerald-800',
        error: 'border-l-red-500 bg-red-50 text-red-800',
        info: 'border-l-indigo-500 bg-indigo-50 text-indigo-800',
    };
    const darkColors = {
        success: 'border-l-emerald-500 bg-emerald-950 text-emerald-200',
        error: 'border-l-red-500 bg-red-950 text-red-200',
        info: 'border-l-indigo-500 bg-indigo-950 text-indigo-200',
    };

    const toast = document.createElement('div');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const colorSet = isDark ? darkColors : colors;
    toast.className = `toast ${colorSet[type]} ${isDark ? '' : ''}`;
    toast.innerHTML = `
        <span class="text-sm">${icons[type]}</span>
        <span class="text-xs font-medium flex-1">${message}</span>
        <button class="toast-close opacity-50 hover:opacity-100 transition text-xs leading-none">&times;</button>
    `;

    container.appendChild(toast);

    const dismiss = () => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    };

    toast.querySelector('.toast-close').addEventListener('click', dismiss);
    setTimeout(dismiss, TOAST_DURATION);
}
