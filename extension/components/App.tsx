import { useMemo, useState } from "react"

import { api } from "../../convex/_generated/api"
import { useM, useQ } from "~lib/data"
import type { ProgressKey } from "~lib/pages"
import { FALLBACK_THEME, themeStyle } from "~lib/theme"

import { AddMangaPopup } from "./AddManga"
import { GridSkeleton } from "./CardGrid"
import { ControlsBar, type View } from "./ControlsBar"
import { Library } from "./Library"
import { FilterPopup, SortPopup } from "./PagePopups"
import { SettingsPage, type Account } from "./SettingsPage"
import { Floating } from "./ui"

/**
 * The whole popup once you're signed in: the top bar and library, or
 * the Settings screen. Your theme colours and font from Settings style
 * everything.
 */
export function App({ account }: { account: Account }) {
  const me = useQ(api.users.me, {})
  const tags = useQ(api.tags.list, {})
  const updateSettings = useM(api.settings.updateSettings)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [popup, setPopup] = useState<{ kind: "filter" | "sort" | "add"; anchor: DOMRect } | null>(null)
  // The tab you just clicked, shown straight away while the choice saves.
  const [picked, setPicked] = useState<View | null>(null)

  const pages = useMemo(() => [...(me?.pages ?? [])].sort((a, b) => a.order - b.order), [me?.pages])

  // Open on the page you were last on (saved as settings.activeView).
  const view: View | null = useMemo(() => {
    if (picked) {
      if (picked.kind === "trash") return picked
      const fresh = pages.find((p) => p._id === picked.page._id)
      if (fresh) return { kind: "page", page: fresh }
    }
    if (!me) return null
    if (me.settings.activeView === "trash") return { kind: "trash" }
    const saved = pages.find((p) => p._id === me.settings.activeView)
    const fallback = pages.find((p) => p.systemKey === "reading") ?? pages[0]
    const page = saved ?? fallback
    return page ? { kind: "page", page } : null
  }, [picked, pages, me])

  const select = (next: View) => {
    setPicked(next)
    setSearch("")
    setPopup(null)
    void updateSettings({ activeView: next.kind === "trash" ? "trash" : next.page._id })
  }

  const theme = me?.settings.theme ?? FALLBACK_THEME
  const favouriteId = tags?.find((t) => t.builtIn === "favourite")?._id
  const page = view?.kind === "page" ? view.page : undefined

  return (
    <div
      style={themeStyle(theme)}
      className="flex h-[600px] w-[800px] flex-col gap-2.5 bg-base p-2.5 font-sans text-fg">
      {me && settingsOpen ? (
        <SettingsPage
          user={me.user}
          settings={me.settings}
          account={account}
          onBack={() => setSettingsOpen(false)}
        />
      ) : (
        <>
          <ControlsBar
            pages={pages}
            view={view}
            onSelect={select}
            search={search}
            onSearch={setSearch}
            filterCount={page?.filters.length ?? 0}
            sortCount={page?.sort.length ?? 0}
            onFilter={(anchor) => setPopup({ kind: "filter", anchor })}
            onSort={(anchor) => setPopup({ kind: "sort", anchor })}
            onAddManga={(anchor) => setPopup({ kind: "add", anchor })}
            onSettings={() => setSettingsOpen(true)}
          />
          {me && view ? (
            <Library view={view} search={search} settings={me.settings} favouriteId={favouriteId} />
          ) : (
            <GridSkeleton />
          )}
        </>
      )}

      {popup?.kind === "add" && !settingsOpen && (
        <Floating anchor={popup.anchor} placement="bottom-end" onClose={() => setPopup(null)}>
          <AddMangaPopup target={isProgressKey(page?.systemKey) ? page.systemKey : "reading"} />
        </Floating>
      )}
      {popup && popup.kind !== "add" && page && !settingsOpen && (
        <Floating anchor={popup.anchor} placement="bottom-end" onClose={() => setPopup(null)}>
          {popup.kind === "filter" ? (
            <FilterPopup key={page._id} page={page} />
          ) : (
            <SortPopup key={page._id} page={page} />
          )}
        </Floating>
      )}
    </div>
  )
}

function isProgressKey(key: string | undefined): key is ProgressKey {
  return key === "reading" || key === "planned" || key === "paused" || key === "completed"
}
