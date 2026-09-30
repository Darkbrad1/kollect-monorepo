import {
  RiArchive2Line,
  RiBookOpenLine,
  RiCalendarScheduleLine,
  RiDeleteBin7Line,
  RiHeartLine,
  RiPauseCircleLine
} from "~lib/icons"

import type { Icon } from "~components/ui"

export type SystemKey = "reading" | "planned" | "paused" | "completed" | "favourites"
export type ProgressKey = Exclude<SystemKey, "favourites">

export const PAGE_ICONS: Record<SystemKey, Icon> = {
  favourites: RiHeartLine,
  reading: RiBookOpenLine,
  planned: RiCalendarScheduleLine,
  paused: RiPauseCircleLine,
  completed: RiArchive2Line
}

export const TRASH_ICON: Icon = RiDeleteBin7Line

/** Names for the four progress pages, in the order the Move To menu
    lists them. */
export const PROGRESS_PAGES: { key: ProgressKey; label: string }[] = [
  { key: "reading", label: "Reading" },
  { key: "planned", label: "Planned" },
  { key: "paused", label: "Paused" },
  { key: "completed", label: "Completed" }
]
