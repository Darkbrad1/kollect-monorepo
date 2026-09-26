const DAY_MS = 24 * 60 * 60 * 1000

/** "Today", "1 Day", "12 Days" — how long ago something happened. */
export function daysAgo(time: number | undefined, now = Date.now()): string {
  if (time === undefined) return ""
  const days = Math.floor((now - time) / DAY_MS)
  if (days <= 0) return "Today"
  return days === 1 ? "1 Day" : `${days} Days`
}

/** "3 Days Left" until a trashed manga is removed for good. */
export function daysLeft(until: number | undefined, now = Date.now()): string {
  if (until === undefined) return ""
  const days = Math.max(0, Math.ceil((until - now) / DAY_MS))
  return days === 1 ? "1 Day Left" : `${days} Days Left`
}

/** "Ch. 98/259" on a card: the chapter you're on, and the newest one
    out when it's known. */
export function chapterProgress(current: number | undefined, latest: number | undefined): string {
  if (current === undefined) return latest === undefined ? "Not Started" : `Ch. 0/${latest}`
  return latest === undefined ? `Ch. ${current}` : `Ch. ${current}/${latest}`
}
