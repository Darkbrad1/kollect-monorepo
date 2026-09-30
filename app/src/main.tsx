import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider, useAuth } from '@clerk/react'
import { ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import './index.css'
import App from './App.tsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!PUBLISHABLE_KEY) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY')

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL
if (!CONVEX_URL) throw new Error('Missing VITE_CONVEX_URL')

const convex = new ConvexReactClient(CONVEX_URL)

// This app is the Clerk sync host: the extension shares its session
// through PLASMO_PUBLIC_CLERK_SYNC_HOST. The Convex provider is here so
// the same identity reaches Convex from both surfaces.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <App />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  </StrictMode>,
)
