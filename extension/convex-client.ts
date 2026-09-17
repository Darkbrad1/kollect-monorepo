// extension/convex-client.ts
import { ConvexReactClient } from "convex/react";

export const convex = new ConvexReactClient(
  process.env.PLASMO_PUBLIC_CONVEX_URL!
);