import { RiArrowDownSLine, RiArrowRightSLine, RiCheckLine } from "~lib/icons"
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentType,
  type ReactNode
} from "react"

import { chipTextColor } from "~lib/theme"

/* Small building blocks shared by every screen. Sizes follow the
   design: 12–13px text, 8px corners on controls, 12px on panels. */

export type Icon = ComponentType<{ size?: number | string; className?: string }>

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ")
}

/* ── buttons ────────────────────────────────────────────────── */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost" | "danger"
  icon?: Icon
  size?: "sm" | "md"
}

export function Button({
  variant = "default",
  icon: IconEl,
  size = "md",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-40",
        size === "md" ? "h-8 px-3 text-[13px]" : "h-7 px-2.5 text-xs",
        variant === "default" && "bg-raised text-fg hover:bg-hover",
        variant === "primary" && "bg-primary text-on-primary hover:opacity-90",
        variant === "ghost" && "text-fg hover:bg-raised",
        variant === "danger" && "bg-danger text-white hover:opacity-90",
        className
      )}>
      {IconEl && <IconEl size={size === "md" ? 15 : 14} />}
      {children}
    </button>
  )
}

export function IconButton({
  icon: IconEl,
  label,
  active,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: Icon
  label: string
  active?: boolean
}) {
  return (
    <Tooltip text={label}>
      <button
        type="button"
        aria-label={label}
        {...rest}
        className={cx(
          "grid h-[26px] w-[26px] place-items-center rounded-md transition-colors",
          active ? "bg-primary text-on-primary" : "text-muted hover:bg-hover hover:text-fg",
          className
        )}>
        <IconEl size={14} />
      </button>
    </Tooltip>
  )
}

/* ── switch and stepper ─────────────────────────────────────── */

export function Switch({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-[14px] w-[27px] shrink-0 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-hover"
      )}>
      <span
        className={cx(
          "absolute top-[2px] h-[10px] w-[10px] rounded-full transition-all",
          checked ? "left-[15px] bg-on-primary" : "left-[2px] bg-fg"
        )}
      />
    </button>
  )
}

export function Stepper({
  value,
  onChange,
  step,
  min,
  max,
  format,
  label,
  disabled
}: {
  value: number
  onChange: (next: number) => void
  step: number
  min: number
  max: number
  format: (value: number) => string
  label: string
  disabled?: boolean
}) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)))
  return (
    <div
      className={cx("flex items-center gap-1.5", disabled && "pointer-events-none opacity-40")}
      aria-label={label}>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => set(value - step)}
        className="grid h-5 w-5 place-items-center rounded text-fg hover:bg-raised disabled:opacity-30">
        −
      </button>
      <span className="min-w-[52px] text-center text-[13px] font-semibold tabular-nums">
        {format(value)}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => set(value + step)}
        className="grid h-5 w-5 place-items-center rounded text-fg hover:bg-raised disabled:opacity-30">
        +
      </button>
    </div>
  )
}

/* ── tag chip ───────────────────────────────────────────────── */

export function Chip({
  name,
  color,
  selected,
  dimmed,
  onClick,
  icon: IconEl
}: {
  name: string
  color: string
  selected?: boolean
  dimmed?: boolean
  onClick?: () => void
  icon?: Icon
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={dimmed ? undefined : { background: color, color: chipTextColor(color) }}
      className={cx(
        "inline-flex h-6 max-w-[180px] items-center gap-1 rounded-md px-2 text-xs font-semibold transition-opacity",
        dimmed && "bg-raised text-muted hover:text-fg",
        !dimmed && "hover:opacity-90"
      )}>
      {IconEl && <IconEl size={12} className="shrink-0" />}
      <span className="truncate">{name}</span>
      {selected && <RiCheckLine size={12} className="shrink-0" />}
    </button>
  )
}

/* ── tooltip ────────────────────────────────────────────────── */

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const [show, setShow] = useState(false)
  const timer = useRef<number>()
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => (timer.current = window.setTimeout(() => setShow(true), 450))}
      onMouseLeave={() => {
        window.clearTimeout(timer.current)
        setShow(false)
      }}>
      {children}
      {show && (
        <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-raised px-2 py-1 text-2xs text-fg shadow-pop">
          {text}
        </span>
      )}
    </span>
  )
}

/* ── floating panels ────────────────────────────────────────── */

type Placement = "bottom-start" | "bottom-end" | "right-start"

const MARGIN = 6

/**
 * A panel pinned next to an anchor (a menu, a popup). It stays inside
 * the 800 × 600 popup: a side menu with no room on the right opens on
 * the left, and anything too low moves up. Clicking outside it or
 * pressing Escape closes it.
 */
export function Floating({
  anchor,
  placement = "bottom-start",
  onClose,
  className,
  children
}: {
  anchor: DOMRect
  placement?: Placement
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  // Callers pass a new onClose on every render; keep the latest in a ref
  // so the listeners below are set up once.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // Depend on the anchor's numbers, not the object: callers measure a
  // fresh DOMRect each render, and re-running on every new object would
  // loop forever.
  const { left: aLeft, top: aTop, right: aRight, bottom: aBottom } = anchor

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    let left: number
    let top: number
    if (placement === "right-start") {
      left = aRight + 4
      if (left + width > vw - MARGIN) left = aLeft - width - 4
      top = aTop - 6
    } else {
      left = placement === "bottom-end" ? aRight - width : aLeft
      top = aBottom + 6
      if (top + height > vh - MARGIN) top = aTop - height - 6
    }
    left = Math.max(MARGIN, Math.min(left, vw - width - MARGIN))
    top = Math.max(MARGIN, Math.min(top, vh - height - MARGIN))
    setPos((prev) => (prev?.left === left && prev?.top === top ? prev : { left, top }))
  })

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current()
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current()
    // Wait a tick so the click that opened the panel doesn't close it.
    const id = window.setTimeout(() => document.addEventListener("mousedown", onDown))
    document.addEventListener("keydown", onKey)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [])

  return (
    <div
      ref={ref}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      className={cx("fixed z-40 rounded-xl bg-surface shadow-pop", className)}>
      {children}
    </div>
  )
}

/* ── menus ──────────────────────────────────────────────────── */

const MenuCtx = createContext<{
  openSub: string | null
  setOpenSub: (key: string | null) => void
}>({ openSub: null, setOpenSub: () => {} })

export function Menu({ children, className }: { children: ReactNode; className?: string }) {
  const [openSub, setOpenSub] = useState<string | null>(null)
  return (
    <MenuCtx.Provider value={{ openSub, setOpenSub }}>
      <div className={cx("flex min-w-[140px] flex-col gap-0.5 p-1.5", className)} role="menu">
        {children}
      </div>
    </MenuCtx.Provider>
  )
}

/**
 * One row in a menu. Give it `submenu` to open a side menu on hover;
 * `active` highlights it the way the design shows the current choice.
 */
export function MenuItem({
  icon: IconEl,
  label,
  onClick,
  active,
  disabled,
  danger,
  checked,
  submenu,
  subKey,
  lead
}: {
  icon?: Icon
  /** Something drawn before the label instead of an icon, such as a site's favicon. */
  lead?: ReactNode
  label: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  danger?: boolean
  checked?: boolean
  submenu?: ReactNode
  subKey?: string
}) {
  const { openSub, setOpenSub } = useContext(MenuCtx)
  const ref = useRef<HTMLButtonElement>(null)
  const key = subKey ?? label
  const isOpen = submenu !== undefined && openSub === key

  return (
    <>
      <button
        ref={ref}
        type="button"
        role="menuitem"
        disabled={disabled}
        onMouseEnter={() => setOpenSub(submenu !== undefined ? key : null)}
        onClick={() => (submenu !== undefined ? setOpenSub(key) : onClick?.())}
        className={cx(
          "flex h-[29px] w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-40",
          active || isOpen ? "bg-primary text-on-primary" : "text-fg hover:bg-raised",
          danger && !active && "text-danger"
        )}>
        {lead ?? (IconEl && <IconEl size={14} className="shrink-0" />)}
        <span className="flex-1 truncate">{label}</span>
        {checked && <RiCheckLine size={14} />}
        {submenu !== undefined && <RiArrowRightSLine size={14} />}
      </button>
      {isOpen && ref.current && (
        <Floating
          anchor={ref.current.getBoundingClientRect()}
          placement="right-start"
          onClose={() => setOpenSub(null)}>
          {submenu}
        </Floating>
      )}
    </>
  )
}

/* ── dropdown select ────────────────────────────────────────── */

export type Option<T extends string> = { value: T; label: string; icon?: Icon; lead?: ReactNode }

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  placeholder = "Choose…"
}: {
  value: T | undefined
  options: readonly Option<T>[]
  onChange: (value: T) => void
  label: string
  className?: string
  placeholder?: string
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const current = options.find((o) => o.value === value)
  const CurrentIcon = current?.icon
  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
        className={cx(
          "inline-flex h-8 items-center gap-1.5 rounded-lg bg-raised px-2.5 text-[13px] text-fg hover:bg-hover",
          className
        )}>
        {current?.lead ?? (CurrentIcon && <CurrentIcon size={14} className="shrink-0 text-muted" />)}
        <span className="flex-1 truncate text-left">{current?.label ?? placeholder}</span>
        <RiArrowDownSLine size={14} className="shrink-0 text-muted" />
      </button>
      {anchor && (
        <Floating anchor={anchor} onClose={() => setAnchor(null)}>
          <Menu>
            {options.map((o) => (
              <MenuItem
                key={o.value}
                icon={o.icon}
                lead={o.lead}
                label={o.label}
                checked={o.value === value}
                onClick={() => {
                  onChange(o.value)
                  setAnchor(null)
                }}
              />
            ))}
          </Menu>
        </Floating>
      )}
    </>
  )
}

/* ── dialog ─────────────────────────────────────────────────── */

/** The "Are You Sure?" popup from the design. */
export function ConfirmDialog({
  title = "Are You Sure?",
  message,
  confirmLabel,
  onConfirm,
  onCancel
}: {
  title?: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50" onMouseDown={onCancel}>
      <div
        role="alertdialog"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-[308px] rounded-xl bg-surface p-4 text-center shadow-pop">
        <h2 className="text-sm font-bold">{title}</h2>
        <p className="mt-2 text-xs text-muted">{message}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="danger" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}
