/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        card: 'var(--color-card)',
        input: 'var(--color-input)',
        panel: 'var(--color-panel)',
        border: 'var(--color-border)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        danger: 'var(--color-danger)',
        success: 'var(--color-success)',
        moderate: 'var(--color-moderate)',
        text: 'var(--color-text)',
        'text-muted': 'var(--color-text-muted)',
        art: 'var(--color-art)',
      }
    },
  },
  plugins: [],
}
