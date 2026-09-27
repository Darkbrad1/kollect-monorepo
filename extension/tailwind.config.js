/** @type {import('tailwindcss').Config} */

// Every colour comes from a CSS variable that lib/theme.ts sets from the
// user's theme (Settings → Theme), so changing a colour there restyles
// the whole popup. Surfaces are shades between the base colour and the
// text colour, which keeps them readable on a light or dark base.
const color = (name) => `rgb(var(--k-${name}) / <alpha-value>)`

module.exports = {
  content: [
    "./popup.tsx",
    "./tabs/**/*.tsx",
    "./components/**/*.tsx",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        base: color("base"),
        surface: color("surface"),
        raised: color("raised"),
        hover: color("hover"),
        line: color("line"),
        fg: color("fg"),
        muted: color("muted"),
        primary: color("primary"),
        "on-primary": color("on-primary"),
        secondary: color("secondary"),
        "on-secondary": color("on-secondary"),
        danger: "#F04438",
        // Kollect's own green, from the logo. It doesn't change with the theme.
        brand: "#0DCF87",
        "on-brand": "#0B0B0B"
      },
      fontFamily: {
        sans: "var(--k-font)"
      },
      fontSize: {
        "2xs": ["10px", "14px"]
      },
      boxShadow: {
        pop: "0 12px 32px -8px rgb(0 0 0 / 0.55), 0 0 0 1px rgb(var(--k-line))"
      }
    }
  },
  plugins: []
}
