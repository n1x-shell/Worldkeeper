/** @type {import('tailwindcss').Config} */
export default {
  content: { relative: true, files: ['./client/index.html', './client/player-site/index.html', './client/src/**/*.{ts,tsx}'] },
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        edge: 'rgb(var(--edge) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        dim: 'rgb(var(--dim) / <alpha-value>)',
        gold: 'rgb(var(--gold) / <alpha-value>)',
        parchment: 'rgb(var(--parchment) / <alpha-value>)',
        parchink: 'rgb(var(--parchink) / <alpha-value>)',
        parchlink: 'rgb(var(--parchlink) / <alpha-value>)',
        arcane: 'rgb(var(--arcane) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        ok: 'rgb(var(--ok) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        belief: 'rgb(var(--belief) / <alpha-value>)',
        homebrew: 'rgb(var(--homebrew) / <alpha-value>)',
        realm: {
          aetheris: 'rgb(var(--realm-aetheris) / <alpha-value>)',
          kaelmar: 'rgb(var(--realm-kaelmar) / <alpha-value>)',
          ethereal: 'rgb(var(--realm-ethereal) / <alpha-value>)',
          world: 'rgb(var(--realm-world) / <alpha-value>)',
        },
      },
      // The type scale (px): 12, 13, 14 (UI base), 16 (lore base), 18, 22, 28, 36. "ui" is the 13px step.
      fontSize: { ui: ['13px', '1.35'] },
      fontFamily: {
        display: ['Cinzel', 'Georgia', 'serif'],
        serif: ['"EB Garamond"', 'Georgia', 'serif'],
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
