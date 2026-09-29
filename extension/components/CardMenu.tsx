import {
  RiArrowGoBackLine,
  RiDeleteBin7Line,
  RiDeleteBinLine,
  RiEqualizerLine,
  RiFileCopyLine,
  RiFolderTransferLine,
  RiHeartFill,
  RiHeartLine,
  RiLinksLine,
  RiPriceTag3Line,
  RiRefreshLine,
  RiSearchLine
} from "~lib/icons"
import { useMemo, useState } from "react"

import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"
import { useM, useQ } from "~lib/data"
import { PAGE_ICONS, PROGRESS_PAGES } from "~lib/pages"

import { CardDetails } from "./CardDetails"
import { titleOf, type GridItem } from "./MangaCard"
import { MangaDexPicker } from "./MangaDexPicker"
import { Chip, Menu, MenuItem } from "./ui"

/**
 * The ⋯ menu on a card. Library pages get Favourite, Copy Title, Copy
 * Link, Details, Move To, Add Tags, Update Details and Trash; the trash page gets
 * Details, Restore, Copy Title, Copy Link and Delete.
 */
export function CardMenu({
  item,
  inTrash,
  favouriteId,
  sites,
  onClose,
  onDelete
}: {
  item: GridItem
  inTrash: boolean
  favouriteId: Id<"userTags"> | undefined
  sites: Map<Id<"sites">, Doc<"sites">>
  onClose: () => void
  onDelete: () => void
}) {
  const { userManga } = item
  const setFavourite = useM(api.tags.setFavourite)
  const move = useM(api.library.moveToProgressPage)
  const softDelete = useM(api.trash.softDelete)
  const restore = useM(api.trash.restore)

  const isFavourite = favouriteId !== undefined && userManga.tagIds.includes(favouriteId)
  const link = userManga.currentChapterUrl
  const run = (action: () => unknown) => () => {
    void action()
    onClose()
  }

  const details = <CardDetails item={item} sites={sites} readOnly={inTrash} />
  const copyItems = (
    <>
      <MenuItem
        icon={RiFileCopyLine}
        label="Copy Title"
        onClick={run(() => navigator.clipboard.writeText(titleOf(item)))}
      />
      <MenuItem
        icon={RiLinksLine}
        label="Copy Link"
        disabled={!link}
        onClick={run(() => link && navigator.clipboard.writeText(link))}
      />
    </>
  )

  if (inTrash) {
    return (
      <Menu className="w-[137px]">
        <MenuItem icon={RiEqualizerLine} label="Details" submenu={details} />
        <MenuItem
          icon={RiArrowGoBackLine}
          label="Restore"
          onClick={run(() => restore({ userMangaId: userManga._id }))}
        />
        {copyItems}
        <MenuItem icon={RiDeleteBinLine} label="Delete" danger onClick={onDelete} />
      </Menu>
    )
  }

  return (
    <Menu className="w-[170px]">
      <MenuItem
        icon={isFavourite ? RiHeartFill : RiHeartLine}
        label={isFavourite ? "Unfavourite" : "Favourite"}
        onClick={run(() => setFavourite({ userMangaId: userManga._id, favourite: !isFavourite }))}
      />
      {copyItems}
      <MenuItem icon={RiEqualizerLine} label="Details" submenu={details} />
      <MenuItem
        icon={RiFolderTransferLine}
        label="Move To"
        submenu={
          <Menu className="w-[130px]">
            {PROGRESS_PAGES.map(({ key, label }) => (
              <MenuItem
                key={key}
                icon={PAGE_ICONS[key]}
                label={label}
                active={userManga.progressKey === key}
                onClick={run(() => move({ userMangaId: userManga._id, systemKey: key }))}
              />
            ))}
          </Menu>
        }
      />
      <MenuItem
        icon={RiPriceTag3Line}
        label="Add Tags"
        submenu={<TagPicker userManga={userManga} />}
      />
      {/* More places to get details from can be added to this list later. */}
      <MenuItem
        icon={RiRefreshLine}
        label="Update Details"
        submenu={
          <Menu className="w-[130px]">
            <MenuItem icon={RiSearchLine} label="MangaDex" submenu={<MangaDexPicker item={item} onDone={onClose} />} />
          </Menu>
        }
      />
      <MenuItem
        icon={RiDeleteBin7Line}
        label="Trash"
        onClick={run(() => softDelete({ userMangaId: userManga._id }))}
      />
    </Menu>
  )
}

/**
 * The Add Tags panel: a Search/Create box and your tags as chips.
 * Clicking a chip adds or removes it. Pressing Enter adds the tag you
 * typed, creating it first if it's new.
 */
export function TagPicker({ userManga }: { userManga: Doc<"userMangas"> }) {
  const tags = useQ(api.tags.list, {})
  const addTag = useM(api.tags.addTag)
  const removeTag = useM(api.tags.removeTag)
  const addByName = useM(api.tags.addTagByName)
  const [text, setText] = useState("")

  // Favourite has its own menu item, so it isn't offered here.
  const own = useMemo(() => (tags ?? []).filter((t) => t.builtIn === null), [tags])
  const needle = text.trim().toLowerCase()
  const shown = needle === "" ? own : own.filter((t) => t.name.toLowerCase().includes(needle))
  const exact = own.find((t) => t.name.toLowerCase() === needle)

  const toggle = (tagId: Id<"userTags">) =>
    userManga.tagIds.includes(tagId)
      ? removeTag({ userMangaId: userManga._id, tagId })
      : addTag({ userMangaId: userManga._id, tagId })

  const submit = () => {
    if (needle === "") return
    if (exact) void toggle(exact._id)
    else void addByName({ userMangaId: userManga._id, name: text })
    setText("")
  }

  return (
    <div className="w-[420px] p-2.5">
      <label className="flex h-8 items-center gap-2 rounded-lg bg-raised px-2.5 text-muted">
        <RiPriceTag3Line size={14} />
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Search/Create Tags"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-fg placeholder:text-muted focus:outline-none"
        />
      </label>
      <div className="mt-2.5 flex max-h-[140px] flex-wrap gap-1.5 overflow-y-auto k-scroll">
        {shown.map((tag) => {
          const on = userManga.tagIds.includes(tag._id)
          return (
            <Chip
              key={tag._id}
              name={tag.name}
              color={tag.color}
              selected={on}
              dimmed={!on}
              icon={RiPriceTag3Line}
              onClick={() => void toggle(tag._id)}
            />
          )
        })}
        {needle !== "" && !exact && (
          <button
            type="button"
            onClick={submit}
            className="h-6 rounded-md border border-dashed border-line px-2 text-xs text-muted hover:text-fg">
            Create “{text.trim()}”
          </button>
        )}
        {tags !== undefined && own.length === 0 && needle === "" && (
          <p className="text-xs text-muted">No tags yet. Type a name and press Enter to make one.</p>
        )}
      </div>
    </div>
  )
}
