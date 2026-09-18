/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{svelte,ts,js}"],
  theme: {
    extend: {
      borderColor: {
        DEFAULT: "rgb(var(--theme-primary-500, 168 85 247) / 0.15)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      spacing: {
        '4.5': '1.125rem',
        '5.5': '1.375rem',
        '6.5': '1.625rem',
        '7.5': '1.875rem',
        '8.5': '2.125rem',
        '10.5': '2.625rem',
        '13': '3.25rem',
      },
      colors: {
        purple: {
          50: "rgb(var(--theme-primary-50, 250 245 255) / <alpha-value>)",
          100: "rgb(var(--theme-primary-100, 243 232 255) / <alpha-value>)",
          200: "rgb(var(--theme-primary-200, 233 213 255) / <alpha-value>)",
          300: "rgb(var(--theme-primary-300, 216 180 254) / <alpha-value>)",
          400: "rgb(var(--theme-primary-400, 192 132 252) / <alpha-value>)",
          500: "rgb(var(--theme-primary-500, 168 85 247) / <alpha-value>)",
          600: "rgb(var(--theme-primary-600, 147 51 234) / <alpha-value>)",
          700: "rgb(var(--theme-primary-700, 126 34 206) / <alpha-value>)",
          800: "rgb(var(--theme-primary-800, 107 33 168) / <alpha-value>)",
          900: "rgb(var(--theme-primary-900, 88 28 135) / <alpha-value>)",
          950: "rgb(var(--theme-primary-950, 59 7 100) / <alpha-value>)",
        },
        void: {
          950: "rgb(var(--theme-void-950, 6 3 12) / <alpha-value>)",
          900: "rgb(var(--theme-void-900, 10 6 20) / <alpha-value>)",
          850: "rgb(var(--theme-void-850, 14 8 31) / <alpha-value>)",
          800: "rgb(var(--theme-void-800, 20 12 43) / <alpha-value>)",
          700: "rgb(var(--theme-void-700, 30 17 63) / <alpha-value>)",
          600: "rgb(var(--theme-void-600, 45 26 88) / <alpha-value>)",
        },
        nexus: {
          purple: "rgb(var(--theme-primary-600, 147 51 234) / <alpha-value>)",
          violet: "rgb(var(--theme-primary-500, 168 85 247) / <alpha-value>)",
          glow: "rgb(var(--theme-primary-400, 192 132 252) / <alpha-value>)",
          dim: "rgb(var(--theme-primary-700, 126 34 206) / <alpha-value>)",
        },
        hextech: {
          gold: "#c8aa6e",
          cyan: "#0ac8b9",
          blue: "#0397ab",
          purple: "rgb(var(--theme-primary-500, 168 85 247) / <alpha-value>)",
          violet: "rgb(var(--theme-primary-600, 147 51 234) / <alpha-value>)",
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
