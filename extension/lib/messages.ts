import type { FunctionReturnType } from "convex/server"

import type { api } from "../../convex/_generated/api"
import type { Doc } from "../../convex/_generated/dataModel"
import type { PageInfo } from "../../convex/lib/pageRead"
import { PROGRESS_PAGES, type ProgressKey } from "~lib/pages"

/* The messages passed between a reading page (the content script) and
   the background worker. Only the background talks to Convex, because
   it holds the login; reading pages ask it. */

export type PageState = FunctionReturnType<typeof api.reading.pageState>
export type AddResult = FunctionReturnType<typeof api.reading.addFromPage>

export type SettingsPatch = {
  scrollThreshold?: number
  hasPercentageBar?: boolean
}

/** Reading page → background. */
export type Request =
  | { type: "sites" }
  | { type: "state"; page?: PageInfo }
  | {
      type: "add"
      page: PageInfo
      progressKey?: ProgressKey
      favourite?: boolean
      /** For a website Kollect doesn't know yet (see convex/reading.ts). */
      newSite?: { title: string; slugPattern?: string; icon?: string }
      /** The chapter typed in the check box on a page Kollect can't read. */
      currentChapter?: { number: number; label: string }
    }
  | { type: "learn"; domain: string; slugPattern: string }
  | { type: "progress"; page: PageInfo; percentage: number }
  | { type: "settings"; patch: SettingsPatch }

export type Response<R extends Request> = R extends { type: "sites" }
  ? Doc<"sites">[]
  : R extends { type: "state" }
    ? PageState
    : R extends { type: "add" }
      ? AddResult
      : R extends { type: "learn" }
        ? boolean
        : void

/** Background → reading page: the right-click menu or the shortcut was
    used, so add the manga on this page. */
export type TabMessage = { type: "add"; favourite?: boolean }

/** A reply that may carry an error, since exceptions don't cross between the two. */
export type Reply<T> = { ok: true; value: T } | { ok: false; error: string }

/** Asks the background worker to do something and waits for the answer. */
export async function ask<R extends Request>(request: R): Promise<Response<R>> {
  const reply: Reply<Response<R>> | undefined = await chrome.runtime.sendMessage(request)
  if (reply === undefined) throw new Error("Kollect's background worker didn't answer.")
  if ("error" in reply) throw new Error(reply.error)
  return reply.value
}

/** The note shown on the page after adding: "Added to Reading" and so on. */
export function addedMessage(
  action: AddResult["action"],
  progressKey: ProgressKey | null,
  favourite?: boolean
): string {
  const where = PROGRESS_PAGES.find((p) => p.key === progressKey)?.label ?? "your library"
  if (favourite) return action === "created" ? `Added to ${where} and favourited` : "Favourited"
  if (action === "created") return `Added to ${where}`
  if (action === "restored") return `Restored to ${where}`
  return `Already on ${where}`
}
