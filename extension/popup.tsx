import "./styles.css"
import { ClerkProvider, SignedIn, SignedOut, UserButton } from "@clerk/chrome-extension"

const PUBLISHABLE_KEY = process.env.PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY
const SYNC_HOST = process.env.PLASMO_PUBLIC_CLERK_SYNC_HOST

if (!PUBLISHABLE_KEY || !SYNC_HOST) {
  throw new Error(
    "Missing PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY or PLASMO_PUBLIC_CLERK_SYNC_HOST"
  )
}

function IndexPopup() {
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      syncHost={SYNC_HOST}>
      <div className="bg-black text-white w-[320px] p-4">
        <SignedOut>
          <p className="mb-3 text-sm">Sign in to Kollect to sync your library.</p>
          <button
            className="rounded bg-white px-3 py-2 text-sm text-black"
            onClick={() =>
              chrome.tabs.create({ url: `${SYNC_HOST}:3000/sign-in` })
            }>
            Sign in on the web
          </button>
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>
    </ClerkProvider>
  )
}

export default IndexPopup