import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog'
import { Sheet, SheetContent, SheetTitle } from './sheet'
import { FullSheet } from '@/components/shared/ui'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Button } from './button'

describe('viewport-bounded overlays', () => {
  it('composes legacy picker triggers as one button and portals above overlays', () => {
    render(<Popover open><PopoverTrigger asChild><Button>Currency</Button></PopoverTrigger><PopoverContent>USD</PopoverContent></Popover>)
    expect(screen.getAllByRole('button', { name: 'Currency' })).toHaveLength(1)
    expect(document.querySelector('button button')).toBeNull()
    const popup = document.querySelector('[data-slot="popover-content"]')!
    expect(popup.className).toContain('available-height')
    expect(popup.className).toContain('z-[60]')
  })
  it('keeps the dialog close outside its min-height-zero scroll body', () => {
    render(<Dialog open><DialogContent><DialogHeader><DialogTitle>Long form</DialogTitle></DialogHeader><button>Last action</button></DialogContent></Dialog>)
    const popup = screen.getByRole('dialog')
    const body = popup.querySelector('[data-slot="dialog-body"]')!
    expect(body).not.toBeNull()
    expect(body.className).toContain('min-h-0')
    expect(body.className).toContain('overflow-y-auto')
    expect(body.contains(screen.getByRole('button', { name: 'Close' }))).toBe(false)
    expect(body.contains(screen.getByRole('button', { name: 'Last action' }))).toBe(true)
    expect(popup.className).toContain('100dvh')
  })
  it('bounds primitive sheets and supplies scrolling and safe-area padding', () => {
    render(<Sheet open><SheetContent side="bottom"><SheetTitle>Calendar</SheetTitle><button>Last day</button></SheetContent></Sheet>)
    const popup = screen.getByRole('dialog')
    expect(popup.className).toContain('100dvh')
    expect(popup.querySelector('[data-slot="sheet-body"]')!.className).toContain('overflow-y-auto')
    expect(popup.className).toContain('safe-area-inset-bottom')
  })
  it('bounds the desktop full sheet from its actual top offset, including footerless sheets', () => {
    render(<FullSheet open onClose={() => {}} title="Group settings"><button>Delete group</button></FullSheet>)
    const popup = screen.getByRole('dialog')
    expect(popup.className).toContain('100dvh-max(1rem,5dvh)-1rem')
    const body = popup.querySelector('[data-slot="sheet-body"]')!
    expect(body).not.toBeNull()
    expect(body.className).toContain('min-h-0')
    expect(body.className).toContain('safe-area-inset-bottom')
    expect(body.contains(screen.getByRole('button', { name: 'Close' }))).toBe(false)
  })
  it('keeps full-sheet footer actions outside the scrolling body', () => {
    render(<FullSheet open onClose={() => {}} title="Split options" footer={<button>Done</button>}><button>Last participant</button></FullSheet>)
    const popup = screen.getByRole('dialog')
    const body = popup.querySelector('[data-slot="sheet-body"]')!
    expect(body.contains(screen.getByRole('button', { name: 'Last participant' }))).toBe(true)
    expect(body.contains(screen.getByRole('button', { name: 'Done' }))).toBe(false)
    expect(screen.getByRole('button', { name: 'Done' }).parentElement!.className).toContain('shrink-0')
    expect(screen.getByRole('button', { name: 'Done' }).parentElement!.className).toContain('safe-area-inset-bottom')
  })
})
