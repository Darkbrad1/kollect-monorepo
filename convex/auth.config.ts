// convex/auth.config.ts
export default {
  providers: [
    {
      domain: "https://your-clerk.clerk.accounts.dev", // web app
      applicationID: "convex",
    },
    {
      domain: "https://your-extension-issuer.com", // extension
      applicationID: "convex",
    },
  ],
};