import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#02070b",
          925: "#061018",
          900: "#08151e",
          850: "#0b1b26",
          800: "#0d2432",
        },
        pulse: {
          blue: "#1597ff",
          green: "#20e58a",
          red: "#ff3b3b",
          amber: "#f59f00",
          yellow: "#f6d743",
        },
      },
      boxShadow: {
        glow: "0 0 24px rgba(21, 151, 255, 0.2)",
        danger: "0 0 22px rgba(255, 59, 59, 0.18)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
