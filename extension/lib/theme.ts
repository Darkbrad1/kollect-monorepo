import "@fontsource-variable/inter"
import "@fontsource-variable/manrope"
import "@fontsource-variable/montserrat"
import "@fontsource-variable/nunito"

import type { CSSProperties } from "react"

export type Theme = {
  colors: { primary: string; secondary: string; base: string }
  font: string
}

/** Fonts offered in Settings → Font. They're bundled with the
    extension, so they work offline. */
export const FONTS = [
  { value: "Manrope", family: "'Manrope Variable'" },
  { value: "Inter", family: "'Inter Variable'" },
  { value: "Montserrat", family: "'Montserrat Variable'" },
  { value: "Nunito", family: "'Nunito Variable'" }
] as const

/** What the popup looks like before settings have loaded. Matches the
    defaults new accounts get. */
export const FALLBACK_THEME: Theme = {
  colors: { primary: "#D9D9D9", secondary: "#5FA8B0", base: "#1C1C1C" },
  font: "Manrope"
}

type RGB = [number, number, number]

function toRgb(hex: string): RGB {
  const clean = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1] ?? "1C1C1C"
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16)) as RGB
}

function mix(a: RGB, b: RGB, amount: number): RGB {
  return a.map((v, i) => Math.round(v + (b[i] - v) * amount)) as RGB
}

/** 0 for black, 1 for white — how bright a colour looks to the eye. */
function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Black or white, whichever reads better on this colour. */
function readableOn(color: RGB): RGB {
  return luminance(color) > 0.35 ? [20, 20, 20] : [240, 240, 240]
}

const triplet = (c: RGB) => c.join(" ")

/** The CSS variables the Tailwind colours read from. */
export function themeStyle(theme: Theme): CSSProperties {
  const base = toRgb(theme.colors.base)
  const primary = toRgb(theme.colors.primary)
  const secondary = toRgb(theme.colors.secondary)
  const fg = readableOn(base)
  const font = FONTS.find((f) => f.value === theme.font) ?? FONTS[0]

  return {
    "--k-base": triplet(base),
    "--k-surface": triplet(mix(base, fg, 0.05)),
    "--k-raised": triplet(mix(base, fg, 0.09)),
    "--k-hover": triplet(mix(base, fg, 0.14)),
    "--k-line": triplet(mix(base, fg, 0.11)),
    "--k-fg": triplet(fg),
    "--k-muted": triplet(mix(base, fg, 0.55)),
    "--k-primary": triplet(primary),
    "--k-on-primary": triplet(readableOn(primary)),
    "--k-secondary": triplet(secondary),
    "--k-on-secondary": triplet(readableOn(secondary)),
    "--k-font": `${font.family}, ui-sans-serif, system-ui, sans-serif`
  } as CSSProperties
}

/** Text colour for a tag chip in this colour. */
export function chipTextColor(hex: string): string {
  return luminance(toRgb(hex)) > 0.35 ? "#141414" : "#F5F5F5"
}
