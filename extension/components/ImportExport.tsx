import { RiArrowDownSLine, RiDownload2Line, RiUpload2Line } from "~lib/icons"
import { useRef, useState } from "react"

import { api } from "../../convex/_generated/api"
import { useM, useOnce } from "~lib/data"

import { Button, Floating, Menu, MenuItem } from "./ui"

type ImportOption = "titles" | "titlesAndPages" | "all"

const OPTIONS: { value: ImportOption; label: string }[] = [
  { value: "titles", label: "Title only" },
  { value: "titlesAndPages", label: "Title Page" },
  { value: "all", label: "All Settings" }
]

// Manga sent per request. Small enough that the "Importing…" title
// keeps moving, big enough that a large library doesn't take forever.
const BATCH = 10

type Report = {
  added: number
  merged: number
  alreadyInLibrary: number
  skipped: { title: string; reason: string }[]
}

type Status =
  | { kind: "idle" }
  | { kind: "running"; title: string; done: number; total: number }
  | { kind: "finished"; report: Report }
  | { kind: "failed"; message: string }

/**
 * The Import ▾ and Export buttons in Settings. Import asks for a file,
 * then brings it in step by step (tags, manga in small batches, then
 * settings) while showing which manga it's on. Export downloads
 * everything as a JSON file.
 */
export function ImportExport() {
  const importTags = useM(api.transfer.importTags)
  const importMangas = useM(api.transfer.importMangas)
  const importSettings = useM(api.transfer.importSettings)
  const once = useOnce()

  const fileInput = useRef<HTMLInputElement>(null)
  const [option, setOption] = useState<ImportOption>("titles")
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [status, setStatus] = useState<Status>({ kind: "idle" })

  const exportFile = async () => {
    const data = await once(api.transfer.exportLibrary, {})
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `kollect-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const runImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      if (typeof data?.kollect !== "number" || !Array.isArray(data.mangas)) {
        throw new Error("That file isn't a Kollect export.")
      }
      const kollect: number = data.kollect
      const mangas = data.mangas as { title: string }[]
      const report: Report = { added: 0, merged: 0, alreadyInLibrary: 0, skipped: [] }

      setStatus({ kind: "running", title: mangas[0]?.title ?? "your library", done: 0, total: mangas.length })

      if (option !== "titles") await importTags({ kollect, tags: data.tags ?? [] })

      for (let i = 0; i < mangas.length; i += BATCH) {
        const batch = mangas.slice(i, i + BATCH)
        setStatus({ kind: "running", title: batch[0].title, done: i, total: mangas.length })
        const part = await importMangas({
          kollect,
          mode: option === "titles" ? "titles" : "titlesAndPages",
          mangas: batch as never
        })
        report.added += part.added
        report.merged += part.merged
        report.alreadyInLibrary += part.alreadyInLibrary
        report.skipped.push(...part.skipped)
      }

      if (option === "all") await importSettings({ kollect, settings: data.settings })
      setStatus({ kind: "finished", report })
    } catch (err) {
      setStatus({ kind: "failed", message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button icon={RiDownload2Line} onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}>
          Import <RiArrowDownSLine size={14} className="text-muted" />
        </Button>
        <Button icon={RiUpload2Line} onClick={() => void exportFile()}>
          Export
        </Button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) void runImport(file)
        }}
      />

      {anchor && (
        <Floating anchor={anchor} placement="bottom-start" onClose={() => setAnchor(null)}>
          <Menu className="w-[130px]">
            {OPTIONS.map((o) => (
              <MenuItem
                key={o.value}
                label={o.label}
                onClick={() => {
                  setOption(o.value)
                  setAnchor(null)
                  fileInput.current?.click()
                }}
              />
            ))}
          </Menu>
        </Floating>
      )}

      {status.kind === "running" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-base">
          <div className="flex w-[280px] flex-col items-center gap-3 text-center">
            <RiDownload2Line size={24} className="text-muted" />
            <p className="text-sm leading-5 text-muted">Importing {status.title}…</p>
            <div className="h-1 w-40 overflow-hidden rounded-full bg-raised">
              <div
                className="h-full bg-secondary transition-all"
                style={{ width: `${status.total ? (status.done / status.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-2xs text-muted">
              {status.done} of {status.total}
            </p>
          </div>
        </div>
      )}

      {(status.kind === "finished" || status.kind === "failed") && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
          <div className="w-[340px] rounded-xl bg-surface p-4 shadow-pop">
            <h2 className="text-sm font-bold">
              {status.kind === "finished" ? "Import Finished" : "Import Failed"}
            </h2>
            {status.kind === "failed" ? (
              <p className="mt-2 text-xs text-muted">{status.message}</p>
            ) : (
              <>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Added", status.report.added],
                    ["Merged", status.report.merged],
                    ["Already Had", status.report.alreadyInLibrary]
                  ].map(([label, n]) => (
                    <div key={label} className="rounded-lg bg-raised py-2">
                      <dd className="text-base font-bold text-white">{n}</dd>
                      <dt className="text-2xs text-muted">{label}</dt>
                    </div>
                  ))}
                </dl>
                {status.report.skipped.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-bold text-muted">
                      Skipped ({status.report.skipped.length})
                    </p>
                    <ul className="k-scroll mt-1 max-h-[140px] overflow-y-auto text-xs">
                      {status.report.skipped.map((s, i) => (
                        <li key={i} className="border-b border-line py-1 last:border-0">
                          <span className="font-semibold">{s.title}</span>
                          <span className="text-muted"> — {s.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            <Button variant="primary" className="mt-4 w-full" onClick={() => setStatus({ kind: "idle" })}>
              OK
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
