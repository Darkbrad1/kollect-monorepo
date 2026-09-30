import { Component, type ReactNode } from "react"

/**
 * Catches a crash in part of the popup and shows what went wrong in its
 * place, instead of the whole popup going blank. `resetKey`: when it
 * changes (for example, a panel is reopened), it tries again.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: unknown; compact?: boolean },
  { error: Error | null; key: unknown }
> {
  state = { error: null as Error | null, key: this.props.resetKey }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  static getDerivedStateFromProps(
    props: { resetKey?: unknown },
    state: { error: Error | null; key: unknown }
  ) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }

  componentDidCatch(error: Error) {
    console.error("[Kollect]", error)
  }

  render() {
    const { error } = this.state
    if (error === null) return this.props.children
    return (
      <div
        role="alert"
        className={
          this.props.compact
            ? "w-[320px] p-3 text-xs"
            : "flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-xs"
        }>
        <p className="text-[13px] font-bold">Something went wrong</p>
        <p className="select-text whitespace-pre-wrap break-words text-2xs leading-4 text-muted">
          {readable(error)}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-1 h-7 rounded-md bg-raised px-3 text-xs hover:bg-hover">
          Try again
        </button>
      </div>
    )
  }
}

/** Convex errors start with "[CONVEX Q(name)] [Request ID: …] Server Error";
    keep the part that says what happened. */
function readable(error: Error): string {
  const message = error.message || String(error)
  const uncaught = /Uncaught \w*Error: ([^\n]+)/.exec(message)
  const where = /\[CONVEX [A-Z]\(([^)]+)\)\]/.exec(message)
  if (uncaught) return where ? `${uncaught[1]} (in ${where[1]})` : uncaught[1]
  return message.split("\n")[0]
}
