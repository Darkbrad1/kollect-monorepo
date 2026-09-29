import cssText from "data-text:~styles.css"
import type { PlasmoCSConfig } from "plasmo"
import { useCallback, useEffect, useRef, useState } from "react"

import type { Doc } from "../../convex/_generated/dataModel"
import { labelledChapterNumber } from "../../convex/lib/pageMatch"
import {
  cleanTitle,
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
  // a chapter page on a website you added before Kollect knew its chapter
  // addresses: it learns them from this page
  | { kind: "learn"; site: Doc<"sites">; guess: Guess }
  | { kind: "none"; site?: Doc<"sites"> } // anything else

function readThisPage(sites: Doc<"sites">[]): Reading {
  const site = siteForUrl(sites, location.href)
  if (site) {
    const page = readPage(site, pageSource())
    if (page) {
      explain("Read this page as:", page)
      return { kind: "known", page }
    }
    if (site.slugPattern === undefined) {
      const guess = guessPage(pageSource())
      if (guess) return { kind: "learn", site, guess: { ...guess, page: { ...guess.page, domain: site.domain } } }
    }
    explain(`Not a series or chapter page on ${site.title}; Add will ask for the details.`)
    return { kind: "none", site }
  }
  const guess = guessPage(pageSource())
  if (guess) {
    explain("Kollect doesn't know this website; this looks like a chapter page:", guess)
    return { kind: "new", guess }
  }
  return { kind: "none" }
}

/** What Add can go on for a page Kollect can't read: the address, and
    whatever the page title says. You check it in the box. */
function pageBasics(site?: Doc<"sites">): { page: PageInfo; siteName: string; chapter?: number; icon?: string } {
  const source = pageSource()
  const domain = site?.domain ?? location.hostname.toLowerCase().replace(/^www\./, "")
  const siteName = site?.title ?? (source.meta("og:site_name")?.trim() || domain.split(".")[0].replace(/^./, (c) => c.toUpperCase()))
  const rawTitle = source.meta("og:title") ?? source.documentTitle
  return {
    page: {
      domain,
      url: location.origin + location.pathname,
      title: cleanTitle(rawTitle, siteName),
      image: source.meta("og:image") || undefined
    },
    siteName,
    chapter: labelledChapterNumber(rawTitle),
    icon: source.link('link[rel~="icon"]')
  }
}

/** The check box's contents while it's open. */
type Adding = {
  progressKey: ProgressKey
  favourite?: boolean
  page: PageInfo
  draft: NewSiteDraft
  /** The chapter-address shape learned from this page, if any. */
  pattern?: string
  /** True when the website is new to Kollect, so its name is asked for. */
  newSite: boolean
  icon?: string
}

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
  const page = reading.kind === "known" ? reading.page : reading.kind === "learn" ? reading.guess.page : null

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
      const progressKey = opts.progressKey ?? "reading"
      if (current.kind === "new") {
        // A website Kollect doesn't know: check what it found first.
        const { guess } = current
        setAdding({
          progressKey,
          favourite: opts.favourite,
          page: guess.page,
          draft: { siteName: guess.siteName, title: guess.page.title, chapter: guess.page.chapter?.number },
          pattern: guess.slugPattern,
          newSite: true,
          icon: guess.icon
        })
        return
      }
      if (current.kind === "none") {
        // A page Kollect can't read: fill in what it can, you check the rest.
        const basics = pageBasics(current.site)
        setAdding({
          progressKey,
          favourite: opts.favourite,
          page: basics.page,
          draft: { siteName: basics.siteName, title: basics.page.title, chapter: basics.chapter },
          newSite: current.site === undefined,
          icon: basics.icon
        })
        return
      }
      const known = current.kind === "known" ? current.page : current.guess.page
      try {
        const { action } = await ask({ type: "add", page: known, ...opts })
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

  /** "Add" in the check box. */
  const addChecked = async (draft: NewSiteDraft) => {
    if (!adding) return
    const { page: base, progressKey, favourite, pattern, newSite, icon } = adding
    const typed = draft.chapter !== undefined ? { number: draft.chapter, label: `Chapter ${draft.chapter}` } : undefined
    try {
      const { action } = await ask({
        type: "add",
        // With a learned pattern, tracking takes over from here; without
        // one, the chapter you typed becomes your current chapter.
        page: { ...base, title: draft.title, chapter: pattern ? typed : undefined },
        progressKey,
        favourite,
        newSite: newSite ? { title: draft.siteName, slugPattern: pattern, icon } : undefined,
        currentChapter: pattern ? undefined : typed
      })
      setAdding(null)
      say(addedMessage(action, progressKey, favourite))
      // The website may be new: reload the list so this page is tracked.
      await loadSites()
    } catch (error) {
      sayError(error)
    }
  }

  // A chapter page on a website you added from a page where Kollect
  // couldn't learn its addresses: learn them now, then track as usual.
  useEffect(() => {
    if (reading.kind !== "learn") return
    ask({ type: "learn", domain: reading.site.domain, slugPattern: reading.guess.slugPattern })
      .then((learned) => {
        if (learned) {
          explain(`Learned ${reading.site.title}'s chapter addresses:`, reading.guess.slugPattern)
          void loadSites()
        }
      })
      .catch((error: unknown) => explain("Couldn't save this website's chapter addresses.", error))
  }, [reading, loadSites])

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
      draft={adding.draft}
      pattern={adding.pattern}
      askSite={adding.newSite}
      onConfirm={(draft) => void addChecked(draft)}
      onCancel={() => setAdding(null)}
    />
  )

  return (
    <div style={themeStyle(state.settings.theme ?? FALLBACK_THEME)}>
      {state.settings.showProgressBar && page?.chapter && <ProgressBar percent={percent} />}
      {state.settings.showButton || adding ? (
        <Overlay
          progressKey={state.progressKey ?? undefined}
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
