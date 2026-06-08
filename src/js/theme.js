// src/js/theme.js — Light/dark theme switcher.
//
// Strategy: CSS handles the visual work via custom-property re-definitions
// triggered by [data-theme="dark"] or @media (prefers-color-scheme: dark).
// This module manages persistence and the toggle button.
//
// Behavior:
//   - On first load: do NOT set data-theme. CSS @media query picks up
//     the OS preference automatically.
//   - On user toggle: set data-theme="light|dark" and persist. The
//     explicit attribute always wins over the OS preference.
//   - On OS change: re-apply only if no manual override is stored.

const STORAGE_KEY = 'sciln_theme';

/** Returns the currently effective theme name (light|dark). */
function effectiveTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Update toggle button label to reflect the current effective theme. */
function syncButton() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  btn.textContent = effectiveTheme() === 'dark' ? '☀️' : '🌙';
}

/** Initialize the theme on page load. No data-theme is set unless the user
 *  has previously chosen one — @media in CSS handles first-paint. */
export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.setAttribute('data-theme', saved);
  }
  syncButton();

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      syncButton();
    }
  });
}

/** Flip between light and dark; persist the choice. */
export function toggleTheme() {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.classList.add('theme-transitioning');
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(STORAGE_KEY, next);
  syncButton();
  setTimeout(() => {
    document.documentElement.classList.remove('theme-transitioning');
  }, 300);
}
