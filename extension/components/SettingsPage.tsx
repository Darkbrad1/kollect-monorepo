import {
  RiAddLine,
  RiArrowLeftLine,
  RiDeleteBinLine,
  RiLogoutBoxLine,
  RiPriceTag3Line,
  RiSearchLine,
  RiUser3Line
} from "~lib/icons"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"
import { useM, useQ } from "~lib/data"
import { FONTS } from "~lib/theme"

import { ImportExport } from "./ImportExport"
import { Button, Chip, ConfirmDialog, Floating, Select, Stepper, Switch } from "./ui"

export type Account = { imageUrl?: string; signOut: () => void }

type Settings = Doc<"settings">
type Tag = Doc<"userTags"> & { color: string }

/**
 * The Settings screen: Account, General, Theme and Tags, in the order
 * the design lays them out. Every change saves straight away.
 */
export function SettingsPage({
  user,
  settings,
  account,
  onBack
}: {
  user: Doc<"users">
  settings: Settings
  account: Account
  onBack: () => void
}) {
  const update = useM(api.settings.updateSettings)
  const emptyTrash = useM(api.trash.emptyTrash)
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2">
        <Button variant="ghost" icon={RiArrowLeftLine} onClick={onBack}>
          Back
        </Button>
        <h1 className="text-sm font-bold">Settings</h1>
      </div>

      <div className="k-scroll mt-1 min-h-0 flex-1 overflow-y-auto pr-1">
        <Section title="Account">
          <div className="flex items-center gap-2.5 px-2.5 py-3">
            {account.imageUrl ? (
              <img src={account.imageUrl} alt="" className="h-8 w-8 rounded-full" />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-raised text-muted">
                <RiUser3Line size={16} />
              </span>
            )}
            <NameField name={user.name} />
            <Button icon={RiLogoutBoxLine} className="ml-auto" onClick={account.signOut}>
              Sign Out
            </Button>
          </div>
        </Section>

        <Section title="General">
          <Row
            title="Percentage Bar"
            description="Show a bar with your progress through the chapter while reading.">
            <Switch
              label="Percentage Bar"
              checked={settings.hasPercentageBar}
              onChange={(v) => void update({ hasPercentageBar: v })}
            />
          </Row>
          <Row
            title="Kollect Options"
            description="Show the Kollect overlay with actions you can take on a manga.">
            <Switch
              label="Kollect Options"
              checked={settings.hasScreenOverlayOptions}
              onChange={(v) => void update({ hasScreenOverlayOptions: v })}
            />
          </Row>
          <Row
            title="Auto Complete On Finish"
            description="Move any manga you've finished reading to Completed automatically.">
            <Switch
              label="Auto Complete On Finish"
              checked={settings.autoCompleteOnFinish}
              onChange={(v) => void update({ autoCompleteOnFinish: v })}
            />
          </Row>
          <Row
            title="Scroll Threshold"
            description="How much of a chapter needs to be scrolled before it counts as read.">
            <Stepper
              label="Scroll Threshold"
              value={settings.scrollThreshold}
              step={5}
              min={0}
              max={100}
              format={(v) => `${v}%`}
              onChange={(v) => void update({ scrollThreshold: v })}
            />
          </Row>
          <Row title="Auto Clear Trash" description="Choose whether the trash is cleared automatically.">
            <Switch
              label="Auto Clear Trash"
              checked={settings.autoClearTrash}
              onChange={(v) => void update({ autoClearTrash: v })}
            />
          </Row>
          <Row
            title="Clear Trash Time"
            description="How long deleted manga stay in the trash before they're cleared.">
            <Stepper
              label="Clear Trash Time"
              value={settings.trashRetentionDays}
              step={1}
              min={1}
              max={365}
              disabled={!settings.autoClearTrash}
              format={(v) => (v === 1 ? "1 Day" : `${v} Days`)}
              onChange={(v) => void update({ trashRetentionDays: v })}
            />
          </Row>
          <Row title="Empty Trash" description="Permanently remove everything in the trash.">
            <Button icon={RiDeleteBinLine} onClick={() => setConfirmEmpty(true)}>
              Empty Trash
            </Button>
          </Row>
          <Row title="Import/Export" description="Import or export your whole library as a JSON file.">
            <ImportExport />
          </Row>
        </Section>

        <Section title="Theme">
          <Row title="Primary Color">
            <ColorSwatch
              label="Primary Color"
              value={settings.theme.colors.primary}
              onChange={(primary) =>
                void update({ theme: { ...settings.theme, colors: { ...settings.theme.colors, primary } } })
              }
            />
          </Row>
          <Row title="Secondary Color">
            <ColorSwatch
              label="Secondary Color"
              value={settings.theme.colors.secondary}
              onChange={(secondary) =>
                void update({ theme: { ...settings.theme, colors: { ...settings.theme.colors, secondary } } })
              }
            />
          </Row>
          <Row title="Base Color">
            <ColorSwatch
              label="Base Color"
              value={settings.theme.colors.base}
              onChange={(base) =>
                void update({ theme: { ...settings.theme, colors: { ...settings.theme.colors, base } } })
              }
            />
          </Row>
          <Row title="Font">
            <Select
              label="Font"
              className="w-[120px]"
              value={settings.theme.font}
              options={FONTS.map((f) => ({ value: f.value, label: f.value }))}
              onChange={(font) => void update({ theme: { ...settings.theme, font } })}
            />
          </Row>
        </Section>

        <Section title="Tags">
          <TagsSection />
        </Section>
      </div>

      {confirmEmpty && (
        <ConfirmDialog
          message="Everything in the trash will be removed and can't be restored."
          confirmLabel="Empty Trash"
          onCancel={() => setConfirmEmpty(false)}
          onConfirm={() => {
            void emptyTrash({})
            setConfirmEmpty(false)
          }}
        />
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-2 first:border-0 first:pt-0">
      <h2 className="px-1.5 pt-1 text-[13px] font-bold text-muted">{title}</h2>
      <div className="mb-2">{children}</div>
    </section>
  )
}

function Row({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-[48px] items-center gap-4 rounded-lg px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-5">{title}</p>
        {description && <p className="text-2xs text-muted">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function NameField({ name }: { name: string }) {
  const rename = useM(api.users.renameUser)
  const [value, setValue] = useState(name)
  useEffect(() => setValue(name), [name])
  const save = () => {
    const next = value.trim()
    if (next === "" ) setValue(name)
    else if (next !== name) void rename({ name: next })
  }
  return (
    <label className="flex flex-col gap-0.5">
      <span className="px-0.5 text-2xs text-muted">Preferred Name</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="h-6 w-[160px] rounded-md bg-raised px-2 text-[13px] font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  )
}

/** A colour square that opens the system colour picker. Changes save
    once you stop dragging. */
function ColorSwatch({
  value,
  onChange,
  label
}: {
  value: string
  onChange: (hex: string) => void
  label: string
}) {
  const [local, setLocal] = useState(value)
  const timer = useRef<number>()
  useEffect(() => setLocal(value), [value])
  return (
    <label className="relative block h-4 w-4 cursor-pointer" aria-label={label}>
      <span
        style={{ background: local }}
        className="block h-4 w-4 rounded ring-1 ring-fg/60 hover:ring-fg"
      />
      <input
        type="color"
        value={local}
        onChange={(e) => {
          const hex = e.target.value
          setLocal(hex)
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => onChange(hex), 300)
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  )
}

/* ── tags ───────────────────────────────────────────────────── */

function TagsSection() {
  const tags = useQ(api.tags.list, {}) as Tag[] | undefined
  const create = useM(api.tags.create)
  const [text, setText] = useState("")
  const [editing, setEditing] = useState<{ tag: Tag | null; anchor: DOMRect } | null>(null)

  // Favourite is managed from the card menu, so it isn't listed here.
  const own = (tags ?? []).filter((t) => t.builtIn === null)
  const needle = text.trim().toLowerCase()
  const shown = needle === "" ? own : own.filter((t) => t.name.toLowerCase().includes(needle))
  const exact = own.some((t) => t.name.toLowerCase() === needle)

  return (
    <div className="px-1.5 py-2">
      <div className="flex items-center gap-2">
        <label className="flex h-8 w-[200px] items-center gap-2 rounded-lg bg-raised px-2.5 text-muted">
          <RiSearchLine size={14} />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && needle !== "" && !exact) {
                void create({ name: text })
                setText("")
              }
            }}
            placeholder="Search/Create Tags"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-fg placeholder:text-muted focus:outline-none"
          />
        </label>
        <Button
          icon={RiAddLine}
          onClick={(e) => setEditing({ tag: null, anchor: e.currentTarget.getBoundingClientRect() })}>
          Add Tag
        </Button>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {shown.map((tag) => (
          <span key={tag._id} onClick={(e) => setEditing({ tag, anchor: e.currentTarget.getBoundingClientRect() })}>
            <Chip name={tag.name} color={tag.color} icon={RiPriceTag3Line} />
          </span>
        ))}
        {tags !== undefined && own.length === 0 && (
          <p className="text-xs text-muted">No tags yet. Use Add Tag, or type a name and press Enter.</p>
        )}
        {needle !== "" && shown.length === 0 && own.length > 0 && (
          <p className="text-xs text-muted">No tag matches. Press Enter to create “{text.trim()}”.</p>
        )}
      </div>

      {editing && (
        <Floating anchor={editing.anchor} onClose={() => setEditing(null)}>
          <TagEditor tag={editing.tag} onDone={() => setEditing(null)} />
        </Floating>
      )}
    </div>
  )
}

/**
 * The small tag editor from the design: a name box and a colour square.
 * For a new tag it creates on Enter; for an existing one it saves the
 * name when you leave the box and the colour as you pick it, and offers
 * Delete.
 */
function TagEditor({ tag, onDone }: { tag: Tag | null; onDone: () => void }) {
  const create = useM(api.tags.create)
  const update = useM(api.tags.update)
  const remove = useM(api.tags.remove)
  const [name, setName] = useState(tag?.name ?? "")
  const [color, setColor] = useState<string | undefined>(tag?.color)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    try {
      if (tag === null) {
        if (name.trim() === "") return
        await create({ name, color })
      } else if (name.trim() !== "" && name.trim() !== tag.name) {
        await update({ tagId: tag._id as Id<"userTags">, name })
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^.*Uncaught Error: /, "") : String(err))
    }
  }

  return (
    <div className="w-[240px] p-2">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-raised text-muted">
          <RiPriceTag3Line size={14} />
        </span>
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => e.key === "Enter" && void save()}
          placeholder="Tag Name"
          className="h-8 min-w-0 flex-1 rounded-lg bg-raised px-2.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <label className="relative h-8 w-8 shrink-0 cursor-pointer" aria-label="Tag colour">
          <span
            style={{ background: color ?? "rgb(var(--k-hover))" }}
            className="block h-8 w-8 rounded-lg ring-1 ring-line"
          />
          <input
            type="color"
            value={color ?? "#5B8FD6"}
            onChange={(e) => {
              setColor(e.target.value)
              if (tag) void update({ tagId: tag._id as Id<"userTags">, color: e.target.value })
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
      {error && <p className="mt-1.5 text-2xs text-danger">{error}</p>}
      <div className="mt-2 flex gap-1.5">
        {tag && (
          <Button variant="ghost" size="sm" icon={RiDeleteBinLine} onClick={() => setConfirm(true)}>
            Delete
          </Button>
        )}
        <Button variant="primary" size="sm" className="ml-auto" onClick={() => void save()}>
          {tag ? "Save" : "Add Tag"}
        </Button>
      </div>
      {confirm && tag && (
        <ConfirmDialog
          message={`“${tag.name}” will be taken off every manga and out of any filters that use it.`}
          confirmLabel="Delete"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            void remove({ tagId: tag._id as Id<"userTags"> })
            setConfirm(false)
            onDone()
          }}
        />
      )}
    </div>
  )
}
