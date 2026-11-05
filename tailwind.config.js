/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'Segoe UI', 'sans-serif'] },
      colors: { ink: '#182620', paper: '#f7f8f4' },
    },
  },
  plugins: [],
};
