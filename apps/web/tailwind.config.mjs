/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './src/app/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#eef3fa',
          100: '#d9e3f4',
          200: '#b3c7e9',
          300: '#8aa9db',
          400: '#5a81c6',
          500: '#3760ae',
          600: '#26488a',
          700: '#1b3668',
          800: '#12264a',
          900: '#0b1b36',
          950: '#071226',
        },
        teal: {
          50: '#eefbf8',
          100: '#d2f5ee',
          200: '#a6e9dd',
          300: '#6fd8c8',
          400: '#3cc2b1',
          500: '#14a898',
          600: '#0d8a7e',
          700: '#0f6e65',
          800: '#115852',
          900: '#114943',
        },
      },
    },
  },
  plugins: [],
}