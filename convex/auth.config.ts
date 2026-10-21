// convex/auth.config.ts
export default {
  providers: [
    {
      // One entry, not two: the extension shares the web app's Clerk
      // session through PLASMO_PUBLIC_CLERK_SYNC_HOST, so both surfaces
      // present tokens signed by the same Clerk instance.
      //
      // Set CLERK_JWT_ISSUER_DOMAIN in the Convex dashboard under
      // Settings -> Environment Variables, to the Clerk Frontend API
      // origin (the same value as PLASMO_PUBLIC_CLERK_JWT_ISSUER_DOMAIN
      // in extension/.env.development).
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,

      // Must match the name of the Clerk JWT template, which is what
      // PLASMO_PUBLIC_JWT_TEMPLATE / ConvexProviderWithClerk request.
      applicationID: "convex",
    },
  ],
};
