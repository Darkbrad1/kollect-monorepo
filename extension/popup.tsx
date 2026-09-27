import "./styles.css"

import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  useAuth,
  useClerk,
  useUser
} from "@clerk/chrome-extension"
import { useMutation } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { useEffect, useState } from "react"
import type { ReactNode } from "react"

import { api } from "../convex/_generated/api"
import { App } from "./components/App"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { SignInScreen } from "./components/SignInScreen"
import { convex } from "./convex-client"
import { themeStyle, FALLBACK_THEME } from "./lib/theme"

const PUBLISHABLE_KEY = process.env.PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY
const SYNC_HOST = process.env.PLASMO_PUBLIC_CLERK_SYNC_HOST

if (!PUBLISHABLE_KEY || !SYNC_HOST) {
  throw new Error(
    "Missing PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY or PLASMO_PUBLIC_CLERK_SYNC_HOST"
  )
}

const POPUP_URL = chrome.runtime.getURL("popup.html")

/** A centred message on the default theme, for the moments before the
    library has loaded. */
function Screen({ children }: { children: ReactNode }) {
  return (
    <div
      style={themeStyle(FALLBACK_THEME)}
      className="grid h-[600px] w-[800px] place-items-center bg-base font-sans text-fg">
      <div className="flex max-w-[320px] flex-col items-center gap-3 text-center">{children}</div>
    </div>
  )
}

/**
 * Provisions the user row, settings, pages and Favourite tag on first
 * open. createUser is idempotent, so running it on every popup open is
 * cheap and means nothing downstream has to handle a missing user.
 */
function EnsureUser({ children }: { children: ReactNode }) {
  const createUser = useMutation(api.users.createUser)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    createUser()
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [createUser])

  if (error) {
    return (
      <Screen>
        <p className="text-sm font-bold">Couldn't load your library</p>
        <p className="text-xs text-muted">{error}</p>
      </Screen>
    )
  }
  // App draws its own loading placeholders, so show it straight away.
  return ready ? <>{children}</> : <Screen>{null}</Screen>
}

function SignedInApp() {
  const { user } = useUser()
  const { signOut } = useClerk()
  return (
    <ErrorBoundary>
      <App account={{ imageUrl: user?.imageUrl, signOut: () => void signOut() }} />
    </ErrorBoundary>
  )
}

function IndexPopup() {
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      syncHost={SYNC_HOST}
      // Without this, signing out sends the popup to the extension's "/",
      // which doesn't exist, and Chrome shows ERR_FILE_NOT_FOUND.
      afterSignOutUrl={POPUP_URL}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <SignedOut>
          <SignInScreen
            onSignIn={() => chrome.tabs.create({ url: `${SYNC_HOST}:3000/sign-in` })}
            onSignUp={() => chrome.tabs.create({ url: `${SYNC_HOST}:3000/sign-up` })}
          />
        </SignedOut>
        <SignedIn>
          <EnsureUser>
            <SignedInApp />
          </EnsureUser>
        </SignedIn>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}

export default IndexPopup
