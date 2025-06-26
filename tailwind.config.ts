export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#000000",
        accent: "#4299e1",
      },
    },
  },
  plugins: [
    require('tailwind-scrollbar'),
  ],
};