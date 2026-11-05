/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Redaction 50', 'Georgia', 'serif'], serif: ['Redaction 50', 'Georgia', 'serif'], mono: ['Redaction 50', 'Georgia', 'serif'] },
      colors: { ink: '#171717', paper: '#f5f5f5' },
    },
  },
  plugins: [],
};
