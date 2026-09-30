// extension/convex-client.ts
import { ConvexReactClient } from "convex/react"

// Read into a const and check it: a bare `process.env.X!` satisfies the
// type checker but still hands ConvexReactClient undefined at runtime,
// which throws on popup load with nothing pointing at the cause.
const CONVEX_URL = process.env.PLASMO_PUBLIC_CONVEX_URL

if (!CONVEX_URL) {
  throw new Error(
    "Missing PLASMO_PUBLIC_CONVEX_URL. `plasmo dev` reads extension/.env.development; " +
      "`plasmo build` reads .env.chrome, which does not define it."
  )
}

export const convex = new ConvexReactClient(CONVEX_URL)
