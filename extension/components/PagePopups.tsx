import {
  RiArrowDownLine,
  RiArrowUpLine,
  RiBookOpenLine,
  RiCalendarLine,
  RiCalendarScheduleLine,
  RiDeleteBinLine,
  RiFilter3Line,
  RiFilterOffLine,
  RiLinksLine,
  RiPriceTag3Line,
  RiSortAsc
} from "~lib/icons"
import { useEffect, useRef, useState, type ReactNode } from "react"

import type { FilterRule } from "../../convex/lib/filters"
import type { SortRule } from "../../convex/lib/sort"
import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"
import { useM, useQ } from "~lib/data"

import { SiteIcon } from "./MangaCard"
import { Button, cx, Select, type Icon, type Option } from "./ui"

/* The Filter and Sort popups from the top bar. Both edit the current
   page's saved list and save each change straight away; "Clear All"
   saves an empty list. */

function PopupShell({
  count,
  noun,
  addLabel,
  onClear,
  onAdd,
  addDisabled,
  children
}: {
  count: number
  noun: string
  addLabel: string
  onClear: () => void
  onAdd: () => void
  addDisabled?: boolean
  children: ReactNode
}) {
  return (
    <div className="w-[540px] p-3">
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-muted">
          {count} {count === 1 ? noun : `${noun}s`}
        </span>
        <Button variant="ghost" size="sm" icon={RiFilterOffLine} className="ml-auto" onClick={onClear}>
          Clear All
        </Button>
        <Button variant="primary" size="sm" icon={RiFilter3Line} onClick={onAdd} disabled={addDisabled}>
          {addLabel}
        </Button>
      </div>
      <p className="mt-2 text-xs font-bold text-muted">{noun.toLowerCase()}s</p>
      <div className="k-scroll mt-1.5 flex max-h-[360px] flex-col gap-1.5 overflow-y-auto">
        {count === 0 ? (
          <p className="py-2 text-xs text-muted">Nothing yet. Use “{addLabel}” to add one.</p>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

/** Saves the latest value once edits pause. */
function useAutosave<T>(value: T, save: (value: T) => void, ms = 350) {
  const first = useRef(true)
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const id = window.setTimeout(() => saveRef.current(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
}

function DeleteRow({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Remove"
      onClick={onClick}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-raised text-muted hover:bg-hover hover:text-fg">
      <RiDeleteBinLine size={14} />
    </button>
  )
}

function NumberBox({
  value,
  onChange,
  label
}: {
  value: number
  onChange: (value: number) => void
  label: string
}) {
  // Keep what's typed as text, so the box can be empty while you type a
  // new number; only real numbers are passed on.
  const [text, setText] = useState(String(value))
  useEffect(() => {
    if (Number(text) !== value) setText(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <input
      type="number"
      aria-label={label}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value !== "" && Number.isFinite(n)) onChange(n)
      }}
      className="k-number h-8 w-14 rounded-lg bg-raised px-2 text-center text-[13px] text-fg focus:outline-none focus:ring-1 focus:ring-primary"
    />
  )
}

/* ── filters ────────────────────────────────────────────────── */

type Field = FilterRule["field"]
type Op = FilterRule["op"]

const FIELD_OPTIONS: Option<Field>[] = [
  { value: "lastReadChapter", label: "Read Chapter", icon: RiBookOpenLine },
  { value: "latestChapter", label: "Latest Chapter", icon: RiBookOpenLine },
  { value: "dateAdded", label: "Date Added", icon: RiCalendarLine },
  { value: "source", label: "Source", icon: RiLinksLine },
  { value: "tag", label: "Tag", icon: RiPriceTag3Line },
  { value: "progress", label: "Progress", icon: RiBookOpenLine }
]

const OPS: Record<Field, Option<Op>[]> = {
  lastReadChapter: [
    { value: "greaterThan", label: "Greater Than", icon: RiArrowUpLine },
    { value: "equal", label: "Equal", icon: RiFilter3Line },
    { value: "lessThan", label: "Less Than", icon: RiArrowDownLine },
    { value: "between", label: "Between", icon: RiFilter3Line }
  ],
  latestChapter: [],
  dateAdded: [
    { value: "greaterThan", label: "More Than", icon: RiArrowUpLine },
    { value: "lessThan", label: "Less Than", icon: RiArrowDownLine },
    { value: "between", label: "Between", icon: RiFilter3Line }
  ],
  source: [
    { value: "equal", label: "Equal", icon: RiFilter3Line },
    { value: "contains", label: "Contains", icon: RiFilter3Line }
  ],
  tag: [
    { value: "has", label: "Has", icon: RiFilter3Line },
    { value: "doesNotHave", label: "Doesn't Have", icon: RiFilter3Line }
  ],
  progress: [
    { value: "notStarted", label: "Not Started", icon: RiFilter3Line },
    { value: "started", label: "Started", icon: RiFilter3Line }
  ]
}
OPS.latestChapter = OPS.lastReadChapter

/** A sensible starting rule for a field, used when adding a row or
    switching a row to a different field. */
function defaultRule(
  field: Field,
  sites: Doc<"sites">[],
  tags: Doc<"userTags">[]
): FilterRule | null {
  switch (field) {
    case "lastReadChapter":
    case "latestChapter":
      return { field, op: "greaterThan", value: 0 }
    case "dateAdded":
      return { field, op: "lessThan", value: 7 }
    case "source":
      return sites[0] ? { field, op: "equal", siteId: sites[0]._id } : null
    case "tag":
      return tags[0] ? { field, op: "has", tagId: tags[0]._id } : null
    case "progress":
      return { field, op: "notStarted" }
  }
}

/** Changes a rule's operator, keeping its value where that makes sense. */
function withOp(rule: FilterRule, op: Op): FilterRule {
  if (rule.field === "source") return { ...rule, op: op as "equal" | "contains" }
  if (rule.field === "tag") return { ...rule, op: op as "has" | "doesNotHave" }
  if (rule.field === "progress") return { ...rule, op: op as "notStarted" | "started" }
  const single = "value" in rule ? rule.value : rule.min
  const field = rule.field
  if (op === "between") {
    return field === "dateAdded"
      ? { field, op, min: single, max: single + 7 }
      : { field, op, min: single, max: single + 10 }
  }
  return field === "dateAdded"
    ? { field, op: op as "greaterThan" | "lessThan", value: single }
    : { field, op: op as "greaterThan" | "equal" | "lessThan", value: single }
}

export function FilterPopup({ page }: { page: Doc<"userPages"> }) {
  const sites = useQ(api.sites.list, {}) ?? []
  const tags = useQ(api.tags.list, {}) ?? []
  const setFilters = useM(api.pages.setFilters)
  const [rules, setRules] = useState<FilterRule[]>(page.filters)

  useAutosave(rules, (filters) => void setFilters({ pageId: page._id, filters }))

  const update = (i: number, rule: FilterRule) =>
    setRules((all) => all.map((r, j) => (j === i ? rule : r)))
  const fieldOptions = FIELD_OPTIONS.filter(
    (f) => defaultRule(f.value, sites, tags) !== null
  )

  return (
    <PopupShell
      count={rules.length}
      noun="Filter"
      addLabel="Add Filter"
      onClear={() => setRules([])}
      onAdd={() => setRules((all) => [...all, defaultRule("lastReadChapter", sites, tags)!])}>
      {rules.map((rule, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Select
            label="Filter by"
            className="w-[158px]"
            value={rule.field}
            options={fieldOptions}
            onChange={(field) => field !== rule.field && update(i, defaultRule(field, sites, tags)!)}
          />
          <Select
            label="Condition"
            className="w-[156px]"
            value={rule.op}
            options={OPS[rule.field]}
            onChange={(op) => update(i, withOp(rule, op))}
          />
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {rule.field === "source" ? (
              <Select
                label="Site"
                className="w-full"
                value={rule.siteId as string}
                options={sites.map((s) => ({
                  value: s._id as string,
                  label: s.title,
                  lead: <SiteIcon site={s} size={14} />
                }))}
                onChange={(siteId) => update(i, { ...rule, siteId: siteId as Id<"sites"> })}
              />
            ) : rule.field === "tag" ? (
              <Select
                label="Tag"
                className="w-full"
                value={rule.tagId as string}
                options={tags.map((t) => ({ value: t._id as string, label: t.name }))}
                onChange={(tagId) => update(i, { ...rule, tagId: tagId as Id<"userTags"> })}
              />
            ) : rule.field === "progress" ? null : rule.op === "between" ? (
              <>
                <NumberBox label="From" value={rule.min} onChange={(min) => update(i, { ...rule, min })} />
                <span className="text-2xs text-muted">and</span>
                <NumberBox label="To" value={rule.max} onChange={(max) => update(i, { ...rule, max })} />
              </>
            ) : (
              <NumberBox label="Value" value={rule.value} onChange={(value) => update(i, { ...rule, value })} />
            )}
            {rule.field === "dateAdded" && <span className="text-2xs text-muted">days ago</span>}
          </div>
          <DeleteRow onClick={() => setRules((all) => all.filter((_, j) => j !== i))} />
        </div>
      ))}
    </PopupShell>
  )
}

/* ── sort ───────────────────────────────────────────────────── */

type SortField = SortRule["field"]

const SORT_FIELDS: (Option<SortField> & { icon: Icon })[] = [
  { value: "lastRead", label: "Last Read", icon: RiCalendarScheduleLine },
  { value: "dateAdded", label: "Date Added", icon: RiCalendarScheduleLine },
  { value: "lastReadChapter", label: "Read Chapters", icon: RiBookOpenLine },
  { value: "latestChapter", label: "Latest Chapter", icon: RiBookOpenLine },
  { value: "source", label: "Sources", icon: RiLinksLine },
  { value: "title", label: "Title", icon: RiSortAsc }
]

export function SortPopup({ page }: { page: Doc<"userPages"> }) {
  const setSort = useM(api.pages.setSort)
  const [rules, setRules] = useState<SortRule[]>(page.sort)

  useAutosave(rules, (sort) => void setSort({ pageId: page._id, sort }), 0)

  const used = new Set(rules.map((r) => r.field))
  const next = SORT_FIELDS.find((f) => !used.has(f.value))
  const update = (i: number, rule: SortRule) =>
    setRules((all) => all.map((r, j) => (j === i ? rule : r)))

  return (
    <PopupShell
      count={rules.length}
      noun="Sort"
      addLabel="Add Sort"
      addDisabled={!next}
      onClear={() => setRules([])}
      onAdd={() => next && setRules((all) => [...all, { field: next.value, direction: "desc" }])}>
      {rules.map((rule, i) => (
        <div key={rule.field} className="flex items-center gap-1.5">
          <Select
            label="Sort by"
            className="w-[150px]"
            value={rule.field}
            options={SORT_FIELDS.filter((f) => f.value === rule.field || !used.has(f.value))}
            onChange={(field) => update(i, { ...rule, field })}
          />
          {(["asc", "desc"] as const).map((direction) => (
            <button
              key={direction}
              type="button"
              onClick={() => update(i, { ...rule, direction })}
              className={cx(
                "flex h-8 flex-1 items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition-colors",
                rule.direction === direction
                  ? "bg-primary text-on-primary"
                  : "bg-raised text-fg hover:bg-hover"
              )}>
              {direction === "asc" ? <RiArrowUpLine size={14} /> : <RiArrowDownLine size={14} />}
              {direction === "asc" ? "Asc" : "Dec"}
            </button>
          ))}
          <DeleteRow onClick={() => setRules((all) => all.filter((_, j) => j !== i))} />
        </div>
      ))}
    </PopupShell>
  )
}
