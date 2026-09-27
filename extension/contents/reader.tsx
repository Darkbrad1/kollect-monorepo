import cssText from "data-text:~styles.css"
import type { PlasmoCSConfig } from "plasmo"
import { useCallback, useEffect, useRef, useState } from "react"

import type { Doc } from "../../convex/_generated/dataModel"
import { readPage, siteForUrl, type PageInfo, type PageSource } from "../../convex/lib/pageRead"
import { Overlay, ProgressBar, Toast } from "~components/Overlay"
import { addedMessage, ask, type PageState, type SettingsPatch, type TabMessage } from "~lib/messages"
import type { ProgressKey } from "~lib/pages"
import { FALLBACK_THEME, themeStyle } from "~lib/theme"

/* Runs on supported reading websites. It works out which manga and
   chapter the page is, shows the Kollect button and progress bar (if
   they're switched on), and reports how far you've read. It talks to
   Convex through the background worker, which holds your login. */

// Keep in step with SITE_MATCHES in lib/sites.ts.
export const config: PlasmoCSConfig = {
  matches: ["https://asurascans.com/*", "https://*.asurascans.com/*"],
  run_at: "document_idle"
}

// The button lives in its own little bubble (a shadow root), so the
// website's styles can't touch it. Tailwind sizes things in rem, which
// follows the website's font size, so turn them into fixed pixels.
export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText.replace(/(-?\d*\.?\d+)rem\b/g, (_, n: string) => `${parseFloat(n) * 16}px`)
  return style
}

/** The real page, as the shared page reader expects it. */
function pageSource(): PageSource {
  return {
    url: location.href,
    documentTitle: document.title,
    meta: (name) =>
      document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute("content") ??
      undefined,
    text: (selector) => document.querySelector(selector)?.textContent?.trim() || undefined,
    link: (selector) => document.querySelector<HTMLAnchorElement>(selector)?.href || undefined,
    data: () => {
      const script = document.getElementById("__NEXT_DATA__")
      try {
        return script?.textContent ? JSON.parse(script.textContent) : undefined
      } catch {
        return undefined
      }
    }
  }
}

/** Explains in the page's console (right-click → Inspect → Console)
    why the Kollect button isn't showing. Each message is logged once. */
const logged = new Set<string>()
function explain(message: string, ...details: unknown[]) {
  if (logged.has(message)) return
  logged.add(message)
  console.info(`[Kollect] ${message}`, ...details)
}

function scrolledPercent(): number {
  const room = document.documentElement.scrollHeight - window.innerHeight
  return room > 0 ? Math.min(100, (window.scrollY / room) * 100) : 100
}

export default function Reader() {
  const [sites, setSites] = useState<Doc<"sites">[] | null>(null)
  const [href, setHref] = useState(location.href)
  const [page, setPage] = useState<PageInfo | null>(null)
  const [state, setState] = useState<PageState | undefined>(undefined)
  const [percent, setPercent] = useState(scrolledPercent)
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null)

  // The newest values, for listeners set up once.
  const pageRef = useRef(page)
  pageRef.current = page
  const stateRef = useRef(state)
  stateRef.current = state

  const say = useCallback((message: string, error = false) => {
    setToast({ message, error })
    window.setTimeout(() => setToast((t) => (t?.message === message ? null : t)), 3000)
  }, [])

  useEffect(() => {
    ask({ type: "sites" })
      .then((list) => {
        if (list.length === 0) {
          explain("No reading websites are set up yet. Run `pnpm --filter app exec convex run sites:seed`.")
        }
        setSites(list)
      })
      .catch((error: unknown) => {
        explain("Couldn't load the list of reading websites.", error)
        setSites([])
      })
  }, [])

  // Many reading sites change pages without a full reload, so watch the address.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (location.href !== href) setHref(location.href)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [href])

  // Read the page once the site list is in, and again after moving to
  // another page (after a moment, so the new page has drawn).
  useEffect(() => {
    if (sites === null) return
    const timer = window.setTimeout(() => {
      const site = siteForUrl(sites, location.href)
      const info = site ? readPage(site, pageSource()) : null
      if (sites.length > 0 && !site) {
        explain(
          `${location.hostname} isn't in the list of reading websites.`,
          sites.map((s) => s.domain)
        )
      } else if (site && !info) {
        explain(
          `This page doesn't look like a series or chapter page on ${site.title} (expected addresses like ${site.slugPattern}).`,
          location.pathname
        )
      } else if (info) {
        explain("Read this page as:", info)
      }
      setPage(info)
      setPercent(scrolledPercent())
    }, 500)
    return () => window.clearTimeout(timer)
  }, [sites, href])

  const refresh = useCallback(async () => {
    const current = pageRef.current
    if (current === null) return setState(undefined)
    try {
      const next = await ask({ type: "state", page: current })
      if (next === null) explain("You're signed out, so there's nothing to show. Open the Kollect popup and sign in.")
      else if (!next.settings.showButton && !next.settings.showProgressBar) {
        explain('The Kollect button and progress bar are both switched off ("Kollect Options" and "Percentage Bar" in Settings).')
      }
      setState(next)
    } catch (error) {
      explain("Couldn't ask Kollect about this page.", error)
      setState(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [page, refresh])

  /* ── progress ── */

  const lastSent = useRef<{ url: string; percent: number } | null>(null)

  const send = useCallback((force = false) => {
    const current = pageRef.current
    const info = stateRef.current
    if (!current?.chapter || !info?.supported) return
    const now = scrolledPercent()
    const last = lastSent.current?.url === current.url ? lastSent.current.percent : null
    // The first report on each chapter goes out whatever it says, so the
    // series' latest chapter gets noted. After that, only while it's in
    // your library, and only when something changed enough to matter.
    if (last !== null && !force) {
      if (!info.inLibrary) return
      const crossed = last < info.settings.scrollThreshold && now >= info.settings.scrollThreshold
      if (!crossed && now < last + 5 && !(now === 100 && last < 100)) return
    }
    lastSent.current = { url: current.url, percent: now }
    void ask({ type: "progress", page: current, percentage: now }).catch(() => {})
  }, [])

  useEffect(() => {
    const onScroll = () => setPercent(scrolledPercent())
    const onHide = () => document.visibilityState === "hidden" && send(true)
    window.addEventListener("scroll", onScroll, { passive: true })
    document.addEventListener("visibilitychange", onHide)
    const timer = window.setInterval(() => send(), 2000)
    return () => {
      window.removeEventListener("scroll", onScroll)
      document.removeEventListener("visibilitychange", onHide)
      window.clearInterval(timer)
    }
  }, [send])

  // Report as soon as we know what the page is.
  useEffect(() => {
    if (state?.supported) send()
  }, [state, send])

  /* ── messages from the background (right-click menu, shortcut) ── */

  useEffect(() => {
    const onMessage = (message: TabMessage, _sender: unknown, reply: (value: unknown) => void) => {
      if (message.type === "getPage") reply(pageRef.current)
      if (message.type === "added") {
        say(message.message)
        void refresh().then(() => send(true))
      }
      if (message.type === "error") say(message.message, true)
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => chrome.runtime.onMessage.removeListener(onMessage)
  }, [refresh, say, send])

  /* ── the Kollect button ── */

  const pick = async (key: ProgressKey) => {
    if (!page) return
    try {
      const { action } = await ask({ type: "add", page, progressKey: key })
      say(action === "noop" ? addedMessage("noop", key).replace("Already on", "Moved to") : addedMessage(action, key))
      await refresh()
      send(true)
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), true)
    }
  }

  const saveTimer = useRef<number>()
  const pending = useRef<SettingsPatch>({})
  const changeSettings = (patch: SettingsPatch) => {
    // Show the change straight away; save it a moment later.
    setState((s) =>
      s
        ? {
            ...s,
            settings: {
              ...s.settings,
              ...(patch.scrollThreshold !== undefined && { scrollThreshold: patch.scrollThreshold }),
              ...(patch.hasPercentageBar !== undefined && { showProgressBar: patch.hasPercentageBar })
            }
          }
        : s
    )
    pending.current = { ...pending.current, ...patch }
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const all = pending.current
      pending.current = {}
      ask({ type: "settings", patch: all }).catch((error: unknown) =>
        say(error instanceof Error ? error.message : String(error), true)
      )
    }, 400)
  }

  // Nothing to show off manga pages, when signed out, or on unknown sites.
  if (!page || !state?.supported) return toast ? <Toast {...toast} /> : null

  return (
    <div style={themeStyle(state.settings.theme ?? FALLBACK_THEME)}>
      {state.settings.showProgressBar && page.chapter && <ProgressBar percent={percent} />}
      {state.settings.showButton && (
        <Overlay
          progressKey={state.progressKey ?? undefined}
          onPick={(key) => void pick(key)}
          showProgressBar={state.settings.showProgressBar}
          onShowProgressBar={(on) => changeSettings({ hasPercentageBar: on })}
          scrollThreshold={state.settings.scrollThreshold}
          onScrollThreshold={(value) => changeSettings({ scrollThreshold: value })}
        />
      )}
      {toast && <Toast {...toast} />}
    </div>
  )
}
