import "./styles.css"

import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  useAuth
} from "@clerk/chrome-extension"
import { useMutation } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { useEffect, useState } from "react"
import type { ReactNode } from "react"

import { api } from "../convex/_generated/api"
import Home from "./Home"
import { convex } from "./convex-client"

const PUBLISHABLE_KEY = process.env.PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY
const SYNC_HOST = process.env.PLASMO_PUBLIC_CLERK_SYNC_HOST

if (!PUBLISHABLE_KEY || !SYNC_HOST) {
  throw new Error(
    "Missing PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY or PLASMO_PUBLIC_CLERK_SYNC_HOST"
  )
}

/**
 * Provisions the user row, settings and system pages on first open.
 * createUser is idempotent, so running it on every popup open is
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
    return <p className="p-3 text-sm text-red-400">Couldn't load your library: {error}</p>
  }
  if (!ready) {
    return <p className="p-3 text-sm text-neutral-400">Loading your library…</p>
  }
  return <>{children}</>
}

function IndexPopup() {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} syncHost={SYNC_HOST}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <div className="bg-black text-white w-[800px] h-[600px]">
          <SignedOut>
            <p className="mb-3 text-sm">
              Sign in to Kollect to sync your library.
            </p>
            <button
              className="rounded bg-white px-3 py-2 text-sm text-black"
              onClick={() =>
                chrome.tabs.create({ url: `${SYNC_HOST}:3000/sign-in` })
              }>
              Sign in on the web
            </button>
          </SignedOut>
          <SignedIn>
            <EnsureUser>
              <Home />
            </EnsureUser>
          </SignedIn>
        </div>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}

export default IndexPopup
