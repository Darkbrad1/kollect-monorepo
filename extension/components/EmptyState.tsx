import type { Icon } from "./ui"

/** The message shown when a page, the trash or a search has nothing in it. */
export function EmptyState({ icon: IconEl, text }: { icon: Icon; text: string }) {
  return (
    <div className="grid flex-1 place-items-center">
      <div className="flex max-w-[343px] flex-col items-center gap-3 text-center">
        <IconEl size={24} className="text-muted" />
        <p className="text-[13px] leading-[17px] text-muted">{text}</p>
      </div>
    </div>
  )
}
