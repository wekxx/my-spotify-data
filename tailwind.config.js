/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b0f0d',
        surface: '#141a17',
        line: '#29322d',
        accent: '#42d77d',
      },
    },
  },
  plugins: [],
}
