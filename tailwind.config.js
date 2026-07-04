/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          50: '#FAF8F5',
          100: '#F5F1EB',
          200: '#EBE5DB',
          300: '#D9D0C2',
          400: '#B8AC9A',
          500: '#8A7F72',
          600: '#6B5F50',
          700: '#4A4234',
          800: '#2A2824',
          900: '#1E1B17',
          950: '#131210',
        },
        accent: {
          50: '#FBF7EC',
          100: '#F5ECD4',
          200: '#EBD9AA',
          300: '#DFC47A',
          400: '#D4AA52',
          500: '#C49A3A',
          600: '#A47E2C',
          700: '#7E6022',
          800: '#5E481A',
          900: '#403114',
          950: '#261D0C',
        },
        success: {
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
        },
        danger: {
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
        },
        warning: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
