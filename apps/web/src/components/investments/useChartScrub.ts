import { useState, type PointerEvent } from 'react'

/**
 * Press-and-drag (or hover) scrubbing for an evenly spaced chart, like mobile
 * broker apps: the caller shows the value at the finger instead of a floating tooltip.
 *
 * Uses pointer events on a wrapper so mouse and touch behave the same. Pair it with
 * `touch-action: pan-y` on that wrapper: a horizontal drag scrubs, a vertical swipe still
 * scrolls the page (the browser cancels the pointer and the scrub resets).
 */
export function useChartScrub(length: number, inset: { left: number; right: number } = { left: 0, right: 0 }, onChange?: (index: number | null) => void) {
  const [index, setIndexState] = useState<number | null>(null)
  function setIndex(next: number | null) {
    if (next === index) return
    setIndexState(next)
    onChange?.(next)
  }

  function indexAt(event: PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const width = rect.width - inset.left - inset.right
    if (width <= 0 || length < 2) return null
    const ratio = (event.clientX - rect.left - inset.left) / width
    return Math.min(length - 1, Math.max(0, Math.round(ratio * (length - 1))))
  }

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.pointerType !== 'mouse') event.currentTarget.setPointerCapture?.(event.pointerId)
      setIndex(indexAt(event))
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      // Touch only scrubs while pressed; a mouse scrubs on hover.
      if (event.pointerType !== 'mouse' && event.buttons === 0) return
      setIndex(indexAt(event))
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      if (event.pointerType !== 'mouse') setIndex(null)
    },
    onPointerCancel() { setIndex(null) },
    onPointerLeave(event: PointerEvent<HTMLElement>) {
      if (event.pointerType === 'mouse') setIndex(null)
    },
  }

  return { index: index !== null && index < length ? index : null, handlers }
}
