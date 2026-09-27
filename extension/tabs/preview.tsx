import "../styles.css"

import { useEffect, useMemo, useState } from "react"

import { App } from "~components/App"
import { Overlay, ProgressBar } from "~components/Overlay"
import { SignInScreen } from "~components/SignInScreen"
import { SampleDataProvider } from "~lib/data"
import type { ProgressKey } from "~lib/pages"
import { createSampleStore, sampleSource } from "~lib/sample"
import { FALLBACK_THEME, themeStyle } from "~lib/theme"

/**
 * Every screen with made-up data instead of your account, for checking
 * the design without signing in. Open it from the extension at
 * tabs/preview.html. Add #sign-in for the signed-out screen, or
 * #reading-page for the overlay on a pretend chapter. Changes only last
 * until you reload.
 */
export default function Preview() {
  const [screen, setScreen] = useState(() => location.hash.slice(1))
  useEffect(() => {
    const onHash = () => setScreen(location.hash.slice(1))
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  if (screen === "sign-in") {
    const say = (what: string) => () => window.alert(`${what} opens the Kollect website in the real popup.`)
    return <SignInScreen onSignIn={say("Sign In")} onSignUp={say("Sign Up")} />
  }
  if (screen === "reading-page") return <ReadingPagePreview />
  return <PopupPreview />
}

function PopupPreview() {
  const [store, setStore] = useState(createSampleStore)
  const source = useMemo(() => sampleSource(store, setStore), [store])
  return (
    <SampleDataProvider source={source}>
      <App account={{ signOut: () => window.alert("Sign out does nothing in the preview.") }} />
    </SampleDataProvider>
  )
}

/** A pretend chapter page with the overlay and progress bar on top. */
function ReadingPagePreview() {
  const [progressKey, setProgressKey] = useState<ProgressKey | undefined>(undefined)
  const [showBar, setShowBar] = useState(true)
  const [threshold, setThreshold] = useState(80)
  const [percent, setPercent] = useState(0)

  useEffect(() => {
    // The popup styles fix the page at 800 × 600; a reading page scrolls.
    for (const el of [document.documentElement, document.body]) {
      el.style.width = "auto"
      el.style.height = "auto"
      el.style.overflow = "auto"
    }
    const onScroll = () => {
      const room = document.documentElement.scrollHeight - window.innerHeight
      setPercent(room > 0 ? (window.scrollY / room) * 100 : 100)
    }
    onScroll()
    window.addEventListener("scroll", onScroll)
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <div style={themeStyle(FALLBACK_THEME)} className="min-h-screen bg-black">
      <div className="mx-auto flex w-[640px] max-w-full flex-col">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="grid h-[900px] place-items-center text-2xl font-bold text-white/30"
            style={{ background: `linear-gradient(160deg, hsl(${260 + i * 12} 45% 22%), hsl(${200 + i * 12} 40% 10%))` }}>
            Page {i + 1}
          </div>
        ))}
      </div>
      {showBar && <ProgressBar percent={percent} />}
      <Overlay
        progressKey={progressKey}
        onPick={setProgressKey}
        showProgressBar={showBar}
        onShowProgressBar={setShowBar}
        scrollThreshold={threshold}
        onScrollThreshold={setThreshold}
      />
    </div>
  )
}
