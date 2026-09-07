/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{svelte,ts,js}"],
  theme: {
    extend: {
      borderColor: {
        DEFAULT: "rgba(168, 85, 247, 0.15)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        void: {
          950: "#06030c",
          900: "#0a0614",
          850: "#0e081f",
          800: "#140c2b",
          700: "#1e113f",
          600: "#2d1a58",
        },
        nexus: {
          purple: "#9333ea",
          violet: "#a855f7",
          glow: "#c084fc",
          dim: "#7e22ce",
        },
        hextech: {
          gold: "#c8aa6e",
          cyan: "#0ac8b9",
          blue: "#0397ab",
          purple: "#a855f7",
          violet: "#8b5cf6",
        },
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.6", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.02)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
