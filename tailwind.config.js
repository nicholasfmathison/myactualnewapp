/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['var(--ui-font)'], serif: ['var(--ui-font)'], mono: ['var(--ui-font)'] },
      colors: { ink: '#171717', paper: '#f5f5f5' },
    },
  },
  plugins: [],
};
