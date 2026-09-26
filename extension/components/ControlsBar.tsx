import {
  RiArrowDownSLine,
  RiCloseLine,
  RiFilter3Line,
  RiSearchLine,
  RiSettings3Line,
  RiSortDesc
} from "~lib/icons"
import { useState } from "react"

import type { Doc } from "../../convex/_generated/dataModel"
import { PAGE_ICONS, TRASH_ICON } from "~lib/pages"

import { cx, Floating, IconButton, Menu, MenuItem } from "./ui"

export type View = { kind: "page"; page: Doc<"userPages"> } | { kind: "trash" }

/**
 * The bar across the top: page tabs, a dropdown listing every page by
 * name, the library search, Filter, Sort and Settings.
 */
export function ControlsBar({
  pages,
  view,
  onSelect,
  search,
  onSearch,
  filterCount,
  sortCount,
  onFilter,
  onSort,
  onSettings
}: {
  pages: Doc<"userPages">[]
  view: View | null
  onSelect: (view: View) => void
  search: string
  onSearch: (text: string) => void
  filterCount: number
  sortCount: number
  onFilter: (anchor: DOMRect) => void
  onSort: (anchor: DOMRect) => void
  onSettings: () => void
}) {
  const [listAnchor, setListAnchor] = useState<DOMRect | null>(null)
  const isActive = (v: View) =>
    view?.kind === v.kind && (v.kind === "trash" || (view.kind === "page" && view.page._id === v.page._id))
  // Filter and sort belong to a page; the trash and search results have neither.
  const tools = view?.kind === "page" && search.trim() === ""

  return (
    <div className="flex h-8 shrink-0 items-center gap-2">
      <div className="flex h-8 items-center gap-0.5 rounded-lg bg-surface px-[3px]">
        {pages.map((page) => (
          <IconButton
            key={page._id}
            icon={PAGE_ICONS[page.systemKey]}
            label={page.title}
            active={isActive({ kind: "page", page })}
            onClick={() => onSelect({ kind: "page", page })}
          />
        ))}
        <IconButton
          icon={TRASH_ICON}
          label="Deleted"
          active={view?.kind === "trash"}
          onClick={() => onSelect({ kind: "trash" })}
        />
        <IconButton
          icon={RiArrowDownSLine}
          label="All pages"
          onClick={(e) => setListAnchor(e.currentTarget.getBoundingClientRect())}
        />
      </div>

      <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg bg-surface px-2.5 text-muted focus-within:text-fg">
        <RiSearchLine size={15} className="shrink-0" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-fg placeholder:text-muted focus:outline-none"
        />
        {search !== "" && (
          <button type="button" aria-label="Clear search" onClick={() => onSearch("")}>
            <RiCloseLine size={14} />
          </button>
        )}
      </label>

      <BarButton
        icon={RiFilter3Line}
        label="Filter"
        count={filterCount}
        disabled={!tools}
        onClick={(anchor) => onFilter(anchor)}
      />
      <BarButton
        icon={RiSortDesc}
        label="Sort"
        count={sortCount}
        disabled={!tools}
        onClick={(anchor) => onSort(anchor)}
      />
      <button
        type="button"
        aria-label="Settings"
        onClick={onSettings}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface text-muted hover:text-fg">
        <RiSettings3Line size={15} />
      </button>

      {listAnchor && (
        <Floating anchor={listAnchor} onClose={() => setListAnchor(null)}>
          <Menu>
            {pages.map((page) => (
              <MenuItem
                key={page._id}
                icon={PAGE_ICONS[page.systemKey]}
                label={page.title}
                active={isActive({ kind: "page", page })}
                onClick={() => {
                  onSelect({ kind: "page", page })
                  setListAnchor(null)
                }}
              />
            ))}
            <MenuItem
              icon={TRASH_ICON}
              label="Deleted"
              active={view?.kind === "trash"}
              onClick={() => {
                onSelect({ kind: "trash" })
                setListAnchor(null)
              }}
            />
          </Menu>
        </Floating>
      )}
    </div>
  )
}

function BarButton({
  icon: IconEl,
  label,
  count,
  disabled,
  onClick
}: {
  icon: typeof RiFilter3Line
  label: string
  count: number
  disabled: boolean
  onClick: (anchor: DOMRect) => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => onClick(e.currentTarget.getBoundingClientRect())}
      className={cx(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-surface px-2.5 text-[13px] transition-colors",
        "text-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted"
      )}>
      <IconEl size={15} />
      <span className="text-fg">{label}</span>
      {count > 0 && (
        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-2xs font-bold text-on-primary">
          {count}
        </span>
      )}
    </button>
  )
}
