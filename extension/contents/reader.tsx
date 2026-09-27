import cssText from "data-text:~styles.css"
import type { PlasmoCSConfig } from "plasmo"
import { useCallback, useEffect, useRef, useState } from "react"

import type { Doc } from "../../convex/_generated/dataModel"
import {
  guessPage,
  readPage,
  siteForUrl,
  type Guess,
  type PageInfo,
  type PageSource
} from "../../convex/lib/pageRead"
import { AddSiteBox, Overlay, ProgressBar, Toast, type NewSiteDraft } from "~components/Overlay"
import { addedMessage, ask, type PageState, type SettingsPatch, type TabMessage } from "~lib/messages"
import { PROGRESS_PAGES, type ProgressKey } from "~lib/pages"
import { FALLBACK_THEME, themeStyle } from "~lib/theme"

/* Runs on every website. On a site Kollect knows, it works out which
   manga and chapter the page is and reports how far you've read. On a
   site it doesn't know, the Kollect button can add the manga, and the
   website with it, after you check what Kollect found. It talks to
   Convex through the background worker, which holds your login. */

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
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
    link: (selector) =>
      document.querySelector<HTMLAnchorElement | HTMLLinkElement>(selector)?.href || undefined,
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
    what Kollect made of the page. Each message is logged once. */
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

/** What this page is to Kollect. */
type Reading =
  | { kind: "known"; page: PageInfo } // a manga page on a site Kollect knows
  | { kind: "new"; guess: Guess } // a chapter page on a site it doesn't
  | { kind: "none" } // anything else

function readThisPage(sites: Doc<"sites">[]): Reading {
  const site = siteForUrl(sites, location.href)
  if (site) {
    const page = readPage(site, pageSource())
    if (page) {
      explain("Read this page as:", page)
      return { kind: "known", page }
    }
    explain(`Not a series or chapter page on ${site.title} (addresses look like ${site.slugPattern}).`)
    return { kind: "none" }
  }
  const guess = guessPage(pageSource())
  if (guess) {
    explain("Kollect doesn't know this website; this looks like a chapter page:", guess)
    return { kind: "new", guess }
  }
  return { kind: "none" }
}

type Adding = { progressKey: ProgressKey; favourite?: boolean; guess: Guess }

export default function Reader() {
  const [sites, setSites] = useState<Doc<"sites">[] | null>(null)
  const [href, setHref] = useState(location.href)
  const [reading, setReading] = useState<Reading>({ kind: "none" })
  const [state, setState] = useState<PageState | undefined>(undefined)
  const [percent, setPercent] = useState(scrolledPercent)
  const [adding, setAdding] = useState<Adding | null>(null)
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null)

  // The newest values, for listeners set up once.
  const readingRef = useRef(reading)
  readingRef.current = reading
  const stateRef = useRef(state)
  stateRef.current = state
  const page = reading.kind === "known" ? reading.page : null

  const say = useCallback((message: string, error = false) => {
    setToast({ message, error })
    window.setTimeout(() => setToast((t) => (t?.message === message ? null : t)), 3000)
  }, [])
  const sayError = useCallback((error: unknown) => say(error instanceof Error ? error.message : String(error), true), [say])

  const loadSites = useCallback(async () => {
    try {
      setSites(await ask({ type: "sites" }))
    } catch (error) {
      explain("Couldn't load the list of reading websites.", error)
      setSites([])
    }
  }, [])

  useEffect(() => {
    void loadSites()
  }, [loadSites])

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
      setReading(readThisPage(sites))
      setAdding(null)
      setPercent(scrolledPercent())
    }, 500)
    return () => window.clearTimeout(timer)
  }, [sites, href])

  const refresh = useCallback(async () => {
    const current = readingRef.current
    try {
      const next = await ask({ type: "state", page: current.kind === "known" ? current.page : undefined })
      if (next === null) explain("You're signed out, so there's nothing to show. Open the Kollect popup and sign in.")
      setState(next)
    } catch (error) {
      explain("Couldn't ask Kollect about this page.", error)
      setState(null)
    }
  }, [])

  useEffect(() => {
    if (sites !== null) void refresh()
  }, [reading, sites, refresh])

  /* ── progress (only on sites Kollect knows) ── */

  const lastSent = useRef<{ url: string; percent: number } | null>(null)

  const send = useCallback((force = false) => {
    const current = readingRef.current
    const info = stateRef.current
    if (current.kind !== "known" || !current.page.chapter || !info?.supported) return
    const now = scrolledPercent()
    const last = lastSent.current?.url === current.page.url ? lastSent.current.percent : null
    // The first report on each chapter goes out whatever it says, so the
    // series' latest chapter gets noted. After that, only while it's in
    // your library, and only when something changed enough to matter.
    if (last !== null && !force) {
      if (!info.inLibrary) return
      const crossed = last < info.settings.scrollThreshold && now >= info.settings.scrollThreshold
      if (!crossed && now < last + 5 && !(now === 100 && last < 100)) return
    }
    lastSent.current = { url: current.page.url, percent: now }
    void ask({ type: "progress", page: current.page, percentage: now }).catch(() => {})
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

  /* ── adding ── */

  /** Add To <page> in the menu, the right-click menu, or the shortcut. */
  const add = useCallback(
    async (opts: { progressKey?: ProgressKey; favourite?: boolean }) => {
      const current = readingRef.current
      if (current.kind === "new") {
        // A website Kollect doesn't know: check what it found first.
        setAdding({ progressKey: opts.progressKey ?? "reading", favourite: opts.favourite, guess: current.guess })
        return
      }
      if (current.kind === "none") {
        say("Open a chapter page to add a manga.", true)
        return
      }
      try {
        const { action } = await ask({ type: "add", page: current.page, ...opts })
        await refresh()
        const where = stateRef.current?.progressKey ?? opts.progressKey ?? null
        const moved = action === "noop" && opts.progressKey !== undefined
        say(moved ? `Moved to ${label(opts.progressKey!)}` : addedMessage(action, where, opts.favourite))
        send(true)
      } catch (error) {
        sayError(error)
      }
    },
    [refresh, say, sayError, send]
  )

  /** "Add" in the box for a new website. */
  const addNewSite = async (draft: NewSiteDraft) => {
    if (!adding) return
    const { guess, progressKey, favourite } = adding
    try {
      const { action } = await ask({
        type: "add",
        page: { ...guess.page, title: draft.title, chapter: { number: draft.chapter, label: `Chapter ${draft.chapter}` } },
        progressKey,
        favourite,
        newSite: { title: draft.siteName, slugPattern: guess.slugPattern, icon: guess.icon }
      })
      setAdding(null)
      say(addedMessage(action, progressKey, favourite))
      // The website is known now: reload the list so this page is tracked.
      await loadSites()
    } catch (error) {
      sayError(error)
    }
  }

  /* ── messages from the background (right-click menu, shortcut) ── */

  useEffect(() => {
    const onMessage = (message: TabMessage) => {
      if (message.type === "add") void add({ favourite: message.favourite })
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => chrome.runtime.onMessage.removeListener(onMessage)
  }, [add])

  /* ── settings from the Kollect menu ── */

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
      ask({ type: "settings", patch: all }).catch(sayError)
    }, 400)
  }

  // Signed out, or still loading: nothing to show.
  if (!state) return toast ? <Toast {...toast} /> : null

  const addBox = adding && (
    <AddSiteBox
      heading={`Add to ${label(adding.progressKey)}${adding.favourite ? " and favourite" : ""}`}
      draft={{ siteName: adding.guess.siteName, title: adding.guess.page.title, chapter: adding.guess.page.chapter!.number }}
      pattern={adding.guess.slugPattern}
      onConfirm={(draft) => void addNewSite(draft)}
      onCancel={() => setAdding(null)}
    />
  )

  return (
    <div style={themeStyle(state.settings.theme ?? FALLBACK_THEME)}>
      {state.settings.showProgressBar && page?.chapter && <ProgressBar percent={percent} />}
      {state.settings.showButton || adding ? (
        <Overlay
          progressKey={state.progressKey ?? undefined}
          canAdd={reading.kind !== "none"}
          onPick={(key) => void add({ progressKey: key })}
          panel={addBox}
          showProgressBar={state.settings.showProgressBar}
          onShowProgressBar={(on) => changeSettings({ hasPercentageBar: on })}
          scrollThreshold={state.settings.scrollThreshold}
          onScrollThreshold={(value) => changeSettings({ scrollThreshold: value })}
        />
      ) : null}
      {toast && <Toast {...toast} />}
    </div>
  )
}

function label(key: ProgressKey): string {
  return PROGRESS_PAGES.find((p) => p.key === key)?.label ?? key
}
