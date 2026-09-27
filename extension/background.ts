import { createClerkClient } from "@clerk/chrome-extension/background"
import { ConvexHttpClient } from "convex/browser"

import { api } from "../convex/_generated/api"
import type { PageInfo } from "../convex/lib/pageRead"
import { addedMessage, type AddResult, type PageState, type Reply, type Request, type TabMessage } from "~lib/messages"
import { SITE_MATCHES } from "~lib/sites"

/* The background worker: the one part of the extension that talks to
   Convex while you're on a reading website. Reading pages send it
   messages (see lib/messages.ts); it also owns the right-click menu and
   the Add keyboard shortcut. */

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
    console.info("[Kollect] No login found in the background worker; reading pages will treat you as signed out.")
    convex.clearAuth()
  }
  return convex
}

async function handle(request: Request): Promise<unknown> {
  // The site list needs no login.
  if (request.type === "sites") {
    if (!convex) return []
    return await convex.query(api.sites.list, {})
  }
  const client = await signIn()
  switch (request.type) {
    case "state":
      return await client.query(api.reading.pageState, { page: request.page })
    case "add":
      return await client.mutation(api.reading.addFromPage, {
        page: request.page,
        progressKey: request.progressKey,
        favourite: request.favourite
      })
    case "progress":
      await client.mutation(api.reading.recordProgress, {
        page: request.page,
        percentage: request.percentage
      })
      return
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
    // Only shown on supported reading websites.
    const shared = { contexts: ["all"] as chrome.contextMenus.ContextType[], documentUrlPatterns: SITE_MATCHES }
    chrome.contextMenus.create({ id: MENU.parent, title: "Kollect", ...shared })
    chrome.contextMenus.create({ id: MENU.add, parentId: MENU.parent, title: "Add to Kollect", ...shared })
    chrome.contextMenus.create({ id: MENU.favourite, parentId: MENU.parent, title: "Favourite", ...shared })
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id === undefined) return
  if (info.menuItemId === MENU.add) void addFromTab(tab.id, {})
  if (info.menuItemId === MENU.favourite) void addFromTab(tab.id, { favourite: true })
})

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "add-manga") return
  const tabId = tab?.id ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id
  if (tabId !== undefined) await addFromTab(tabId, {})
})

/** Asks the reading page what it is, adds it, and tells the page how it went. */
async function addFromTab(tabId: number, opts: { favourite?: boolean }) {
  const tell = (message: TabMessage) => chrome.tabs.sendMessage(tabId, message).catch(() => {})
  try {
    const page: PageInfo | null = await chrome.tabs.sendMessage(tabId, { type: "getPage" } satisfies TabMessage)
    if (!page) {
      await tell({ type: "error", message: "This page isn't a manga Kollect can read." })
      return
    }
    const { action } = (await handle({ type: "add", page, favourite: opts.favourite })) as AddResult
    const state = (await handle({ type: "state", page })) as PageState
    await tell({ type: "added", message: addedMessage(action, state?.progressKey ?? null, opts.favourite) })
  } catch (error) {
    await tell({ type: "error", message: error instanceof Error ? error.message : String(error) })
  }
}
