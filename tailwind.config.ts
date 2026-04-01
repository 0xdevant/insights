import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        surface: "var(--surface)",
        "surface-container-low": "var(--surface-container-low)",
        "surface-container-lowest": "var(--surface-container-lowest)",
        "surface-container-high": "var(--surface-container-high)",
        foreground: "var(--foreground)",
        "foreground-muted": "var(--foreground-muted)",
        "foreground-subtle": "var(--foreground-subtle)",
        "on-surface": "var(--on-surface)",
        "on-surface-variant": "var(--on-surface-variant)",
        secondary: "var(--secondary)",
        primary: "rgb(var(--primary-rgb) / <alpha-value>)",
        "primary-container": "var(--primary-container)",
        "on-primary": "var(--on-primary)",
        "secondary-container": "var(--secondary-container)",
        "outline-variant": "var(--outline-variant)",
        tertiary: "var(--tertiary)",
        "tertiary-fixed": "var(--tertiary-fixed)",
        "tertiary-container": "var(--tertiary-container)",
        error: "var(--error)",
        "error-container": "var(--error-container)",
        "inverse-surface": "var(--inverse-surface)",
        "inverse-on-surface": "var(--inverse-on-surface)",
      },
      fontFamily: {
        headline: ["var(--font-manrope)", "var(--font-noto-tc)", "system-ui", "sans-serif"],
        body: ["var(--font-noto-tc)", "var(--font-manrope)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        ambient: "0px 10px 30px rgba(25, 28, 30, 0.06)",
      },
    },
  },
  plugins: [],
} satisfies Config;
