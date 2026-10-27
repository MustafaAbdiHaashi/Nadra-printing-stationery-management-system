/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#14213D',
          teal: '#14B8A6',
          amber: '#F59E0B',
          light: '#F8FAFC',
          dark: '#0B1220',
        },
      },
      boxShadow: {
        soft: '0 10px 30px rgba(20, 33, 61, 0.08)',
      },
    },
  },
  plugins: [],
};
