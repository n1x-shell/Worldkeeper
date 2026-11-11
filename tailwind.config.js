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
        ink: 'rgb(var(--ink) / <alpha-value>)',
        dim: 'rgb(var(--dim) / <alpha-value>)',
        gold: 'rgb(var(--gold) / <alpha-value>)',
        parchment: 'rgb(var(--parchment) / <alpha-value>)',
        parchink: 'rgb(var(--parchink) / <alpha-value>)',
        arcane: 'rgb(var(--arcane) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        ok: 'rgb(var(--ok) / <alpha-value>)',
      },
      fontFamily: {
        display: ['Cinzel', 'Georgia', 'serif'],
        serif: ['"EB Garamond"', 'Georgia', 'serif'],
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
