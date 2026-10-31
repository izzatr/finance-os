import { fireEvent, render, screen } from '@testing-library/react'
import { useChartScrub } from './useChartScrub'

function Probe({ onChange }: { onChange?: (index: number | null) => void }) {
  const { index, handlers } = useChartScrub(5, { left: 0, right: 0 }, onChange)
  return <div data-testid="chart" {...handlers}>{index === null ? 'none' : `index ${index}`}</div>
}

function setup(onChange?: (index: number | null) => void) {
  render(<Probe onChange={onChange} />)
  const chart = screen.getByTestId('chart')
  chart.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 100, right: 400, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
  return chart
}

describe('useChartScrub', () => {
  it('follows a pressed finger and resets on release', () => {
    const onChange = vi.fn()
    const chart = setup(onChange)
    fireEvent.pointerDown(chart, { clientX: 100, pointerType: 'touch', buttons: 1 })
    expect(screen.getByText('index 1')).toBeInTheDocument()
    fireEvent.pointerMove(chart, { clientX: 390, pointerType: 'touch', buttons: 1 })
    expect(screen.getByText('index 4')).toBeInTheDocument()
    fireEvent.pointerUp(chart, { clientX: 390, pointerType: 'touch' })
    expect(screen.getByText('none')).toBeInTheDocument()
    expect(onChange.mock.calls.map(([value]) => value)).toEqual([1, 4, null])
  })

  it('ignores touch moves without a press and resets when the page scrolls instead', () => {
    const chart = setup()
    fireEvent.pointerMove(chart, { clientX: 200, pointerType: 'touch', buttons: 0 })
    expect(screen.getByText('none')).toBeInTheDocument()
    fireEvent.pointerDown(chart, { clientX: 200, pointerType: 'touch', buttons: 1 })
    fireEvent.pointerCancel(chart)
    expect(screen.getByText('none')).toBeInTheDocument()
  })

  it('scrubs on mouse hover and clears when the mouse leaves', () => {
    const chart = setup()
    fireEvent.pointerMove(chart, { clientX: 200, pointerType: 'mouse', buttons: 0 })
    expect(screen.getByText('index 2')).toBeInTheDocument()
    fireEvent.pointerLeave(chart, { pointerType: 'mouse' })
    expect(screen.getByText('none')).toBeInTheDocument()
  })
})
