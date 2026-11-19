import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#faf5ff",
          100: "#f3e8ff",
          200: "#e9d5ff",
          300: "#d8b4fe",
          400: "#c084fc",
          500: "#9333ea",
          600: "#7e22ce",
          700: "#6b21a8",
          800: "#581c87",
          900: "#49166f",
          950: "#3b0764",
        },
        accent: {
          500: "#0f9d78", // success / approved green
          600: "#0c7f61",
        },
        warning: {
          500: "#e2a336",
        },
        danger: {
          500: "#e0473f",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f6f8fc",
          border: "#e4e9f2",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-source-serif)", "Georgia", "serif"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.08)",
        popover: "0 4px 6px -2px rgba(16,24,40,0.05), 0 12px 16px -4px rgba(16,24,40,0.1)",
      },
    },
  },
  plugins: [],
};

export default config;
