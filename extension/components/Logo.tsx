import { cx } from "./ui"

/**
 * The Kollect pin: a green map pin with a bookmark running down the
 * middle. Traced from the logo file so it stays sharp at any size.
 * `size` is the height in pixels.
 */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 45 53"
      height={size}
      width={(size * 45) / 53}
      className={cx("shrink-0", className)}
      aria-hidden="true">
      <path
        fill="#0DCF87"
        fillRule="evenodd"
        d="M11.75 40.12A21.5 21.5 0 1 1 33.25 40.12Q26.3 44.1 22.5 52Q18.7 44.1 11.75 40.12Z
           M16.5 11.91A12 10.5 0 0 0 16.5 30.09Z
           M28.5 11.91A12 10.5 0 0 1 28.5 30.09Z"
      />
      <path fill="#000" d="M18.5 0H26.5V36L22.5 32.5L18.5 36Z" />
    </svg>
  )
}

/** "KOLLECT" with the pin standing in for the O. */
export function Wordmark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label="Kollect"
      className={cx("inline-flex items-start font-extrabold leading-none text-brand", className)}
      style={{ fontFamily: "'Montserrat Variable', sans-serif", fontSize: size, letterSpacing: "0.02em" }}>
      <span>K</span>
      <LogoMark size={size * 0.98} className="mx-[0.04em] -mt-[0.03em]" />
      <span>LLECT</span>
    </span>
  )
}
