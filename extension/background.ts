import { createClerkClient } from "@clerk/chrome-extension/background"
import { ConvexHttpClient } from "convex/browser"

import { api } from "../convex/_generated/api"
import type { Reply, Request, TabMessage } from "~lib/messages"

/* The background worker: the one part of the extension that talks to
   Convex while you're on a website. Pages send it messages (see
   lib/messages.ts); it also owns the right-click menu and the Add
   keyboard shortcut, which it hands to the page to carry out. */

const PUBLISHABLE_KEY = process.env.PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY
const SYNC_HOST = process.env.PLASMO_PUBLIC_CLERK_SYNC_HOST
const CONVEX_URL = process.env.PLASMO_PUBLIC_CONVEX_URL

const convex = CONVEX_URL ? new ConvexHttpClient(CONVEX_URL) : null

/** Your login, borrowed from the sign-in website like the popup does. */
async function signIn(): Promise<ConvexHttpClient> {
  if (!convex || !PUBLISHABLE_KEY || !SYNC_HOST) {
    throw new Error("Kollect isn't set up: the Clerk or Convex settings are missing.")
  }
  const clerk = await createClerkClient({ publishableKey: PUBLISHABLE_KEY, syncHost: SYNC_HOST })
  const token = clerk.session ? await clerk.session.getToken({ template: "convex" }) : null
  if (token) convex.setAuth(token)
  else {
    console.info("[Kollect] No login found in the background worker; pages will treat you as signed out.")
    convex.clearAuth()
  }
  return convex
}

async function handle(request: Request): Promise<unknown> {
  const client = await signIn()
  switch (request.type) {
    case "sites":
      // Built-in sites, plus the ones you added (when signed in).
      return await client.query(api.sites.list, {})
    case "state":
      return await client.query(api.reading.pageState, { page: request.page })
    case "add":
      return await client.mutation(api.reading.addFromPage, {
        page: request.page,
        progressKey: request.progressKey,
        favourite: request.favourite,
        newSite: request.newSite,
        currentChapter: request.currentChapter,
        choice: request.choice
      })
    case "learn":
      return await client.mutation(api.reading.learnSitePattern, {
        domain: request.domain,
        slugPattern: request.slugPattern
      })
    case "progress":
      return await client.mutation(api.reading.recordProgress, {
        page: request.page,
        percentage: request.percentage
      })
    case "reject":
      return await client.mutation(api.reading.rejectMatch, { page: request.page })
    case "settings":
      await client.mutation(api.settings.updateSettings, request.patch)
      return
  }
}

chrome.runtime.onMessage.addListener((request: Request, _sender, sendResponse) => {
  handle(request).then(
    (value) => sendResponse({ ok: true, value } satisfies Reply<unknown>),
    (error: unknown) => {
      console.warn(`[Kollect] ${request.type} failed:`, error)
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies Reply<unknown>)
    }
  )
  return true // the answer comes later
})

/* ── right-click menu and keyboard shortcut ─────────────────────── */

const MENU = { parent: "kollect", add: "kollect-add", favourite: "kollect-favourite" }

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    const shared = {
      contexts: ["all"] as chrome.contextMenus.ContextType[],
      documentUrlPatterns: ["http://*/*", "https://*/*"]
    }
    chrome.contextMenus.create({ id: MENU.parent, title: "Kollect", ...shared })
    chrome.contextMenus.create({ id: MENU.add, parentId: MENU.parent, title: "Add to Kollect", ...shared })
    chrome.contextMenus.create({ id: MENU.favourite, parentId: MENU.parent, title: "Favourite", ...shared })
  })
})

/** The page does the adding, since it may need to ask you about a new website first. */
function tellTab(tabId: number, message: TabMessage) {
  // Fails quietly on pages Kollect can't run on, such as chrome:// pages.
  chrome.tabs.sendMessage(tabId, message).catch(() => {})
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id === undefined) return
  if (info.menuItemId === MENU.add) tellTab(tab.id, { type: "add" })
  if (info.menuItemId === MENU.favourite) tellTab(tab.id, { type: "add", favourite: true })
})

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "add-manga") return
  const tabId = tab?.id ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id
  if (tabId !== undefined) tellTab(tabId, { type: "add" })
})
