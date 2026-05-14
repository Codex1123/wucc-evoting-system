/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f2f5ff',
          100: '#e8edff',
          200: '#cbd7ff',
          500: '#2448d6',
          600: '#1a3bc1',
          700: '#1630a0',
          900: '#0f1f70',
          950: '#07123f'
        }
      },
      boxShadow: {
        soft: '0 18px 60px rgba(15, 23, 42, 0.08)'
      }
    }
  },
  plugins: []
};
