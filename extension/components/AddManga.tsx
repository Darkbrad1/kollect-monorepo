import { RiAddLine, RiArrowGoBackLine, RiSearchLine } from "~lib/icons"
import { useEffect, useState } from "react"

import { api } from "../../convex/_generated/api"
import { useM, useQ } from "~lib/data"
import { PAGE_ICONS, PROGRESS_PAGES, type ProgressKey } from "~lib/pages"

import { Cover } from "./MangaCard"
import { cx } from "./ui"

/**
 * The + button's panel in the top bar: search every manga anyone has
 * added to Kollect and add one to your library. New manga go on the
 * page you're looking at (or Reading, from Favourites, the trash or a
 * search). Manga you already have show which page they're on.
 */
export function AddMangaPopup({ target }: { target: ProgressKey }) {
  const [text, setText] = useState("")
  const [needle, setNeedle] = useState("")
  const addManga = useM(api.library.addManga)

  // Wait for a pause in typing before searching.
  useEffect(() => {
    const timer = window.setTimeout(() => setNeedle(text.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [text])

  const results = useQ(api.catalogue.search, needle === "" ? "skip" : { text: needle })
  const targetLabel = label(target)

  return (
    <div className="w-[420px] p-2.5">
      <div className="flex items-baseline justify-between px-0.5">
        <p className="text-[13px] font-bold">Add Manga</p>
        <p className="text-2xs text-muted">New ones go on {targetLabel}</p>
      </div>
      <label className="mt-2 flex h-8 items-center gap-2 rounded-lg bg-raised px-2.5 text-muted focus-within:text-fg">
        <RiSearchLine size={14} className="shrink-0" />
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search by title"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-fg placeholder:text-muted focus:outline-none"
        />
      </label>

      <div className="k-scroll mt-2 max-h-[340px] overflow-y-auto">
        {needle === "" ? (
          <Note>Search every manga people have added to Kollect.</Note>
        ) : results === undefined ? (
          <Note>Searching…</Note>
        ) : results.length === 0 ? (
          <Note>
            Nothing found for “{needle}”. Open it on its website and use the Kollect button to add it.
          </Note>
        ) : (
          <ul className="flex flex-col gap-1">
            {results.map(({ manga, status }) => {
              const onPage = status !== "new" && status !== "trash" ? status : null
              const PageIcon = onPage ? PAGE_ICONS[onPage] : null
              return (
                <li key={manga._id} className="flex items-center gap-2.5 rounded-lg p-1 hover:bg-raised">
                  <Cover src={manga.image} className="h-[52px] w-9 shrink-0 rounded-md object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{manga.title}</p>
                    <p className="text-2xs text-muted">
                      {manga.latestChapter !== undefined ? `Latest: Ch. ${manga.latestChapter}` : "Latest chapter unknown"}
                    </p>
                  </div>
                  {onPage && PageIcon ? (
                    <span className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-2xs text-muted">
                      <PageIcon size={12} /> On {label(onPage)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void addManga({ mangaId: manga._id, progressKey: target })}
                      className={cx(
                        "flex h-7 shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-semibold",
                        "bg-primary text-on-primary hover:opacity-90"
                      )}>
                      {status === "trash" ? (
                        <>
                          <RiArrowGoBackLine size={13} /> Restore
                        </>
                      ) : (
                        <>
                          <RiAddLine size={13} /> Add
                        </>
                      )}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-6 text-center text-xs leading-5 text-muted">{children}</p>
}

function label(key: ProgressKey): string {
  return PROGRESS_PAGES.find((p) => p.key === key)?.label ?? key
}
