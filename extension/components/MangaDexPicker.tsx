import { useEffect, useState } from "react"

import { api } from "../../convex/_generated/api"
import { useA } from "~lib/data"
import { RiSearchLine } from "~lib/icons"

import { Cover, titleOf, type GridItem } from "./MangaCard"

type Result = {
  mangadexId: string
  title: string
  cover?: string
  type: string
  year?: number
  status?: string
}

const TYPE_LABELS: Record<string, string> = { manga: "Manga", manhwa: "Manhwa", manhua: "Manhua" }
const STATUS_LABELS: Record<string, string> = {
  ongoing: "Ongoing",
  completed: "Completed",
  hiatus: "Hiatus",
  cancelled: "Cancelled"
}

/**
 * Update Details → MangaDex: a search box filled in with the manga's
 * title, and every result MangaDex gives. Picking one links the manga
 * to it: the cover, other titles, latest chapter and status change for
 * everyone, and its title becomes your own title.
 */
export function MangaDexPicker({ item, onDone }: { item: GridItem; onDone: (title: string) => void }) {
  const search = useA(api.mangadex.search)
  const pick = useA(api.mangadex.pick)
  const [text, setText] = useState(titleOf(item))
  const [results, setResults] = useState<Result[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState<string | null>(null)

  // Search a moment after you stop typing.
  useEffect(() => {
    const query = text.trim()
    if (query === "") {
      setResults([])
      return
    }
    let stale = false
    setResults(null)
    const timer = window.setTimeout(() => {
      search({ text: query })
        .then((found) => !stale && (setResults(found), setError(null)))
        .catch((e: unknown) => !stale && setError(e instanceof Error ? e.message : String(e)))
    }, 400)
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
    // search is a new function on every render; the text is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  const choose = async (result: Result) => {
    setPicking(result.mangadexId)
    try {
      await pick({ userMangaId: item.userManga._id, mangadexId: result.mangadexId })
      onDone(result.title)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPicking(null)
    }
  }

  return (
    <div className="w-[340px] p-2.5">
      <label className="flex h-8 items-center gap-2 rounded-lg bg-raised px-2.5 text-muted">
        <RiSearchLine size={14} />
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search MangaDex"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-fg placeholder:text-muted focus:outline-none"
        />
      </label>
      <div className="mt-2 flex max-h-[300px] flex-col gap-1 overflow-y-auto k-scroll">
        {error && <p className="px-1 py-2 text-xs text-danger">{error}</p>}
        {!error && results === null && <p className="px-1 py-2 text-xs text-muted">Searching MangaDex…</p>}
        {!error && results?.length === 0 && text.trim() !== "" && (
          <p className="px-1 py-2 text-xs text-muted">MangaDex has nothing by that name. Try another title.</p>
        )}
        {results?.map((r) => {
          const details = [TYPE_LABELS[r.type], r.year, r.status && STATUS_LABELS[r.status]].filter(Boolean).join(" · ")
          const current = item.manga.mangadexId === r.mangadexId
          return (
            <button
              key={r.mangadexId}
              type="button"
              disabled={picking !== null}
              onClick={() => void choose(r)}
              className="flex w-full items-center gap-2.5 rounded-lg p-1 text-left hover:bg-raised disabled:opacity-60">
              <Cover src={r.cover ?? ""} className="h-[56px] w-[40px] shrink-0 rounded-md" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="line-clamp-2 text-[13px] font-semibold leading-4">{r.title}</span>
                {details && <span className="text-2xs text-muted">{details}</span>}
                {current && (
                  <span className="w-fit rounded bg-primary px-1.5 text-2xs font-semibold text-on-primary">Linked now</span>
                )}
                {picking === r.mangadexId && <span className="text-2xs text-muted">Updating…</span>}
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-2xs leading-4 text-muted">
        Picking one updates the cover and details for everyone who has this manga. The title changes only for you.
      </p>
    </div>
  )
}
