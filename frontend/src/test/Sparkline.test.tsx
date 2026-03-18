import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Sparkline from '../components/Sparkline'

/** Generate a 52-element array of synthetic frequency data (sine wave pattern) */
function makeSineData(): number[] {
  return Array.from({ length: 52 }, (_, i) =>
    Math.max(0, 0.3 + 0.2 * Math.sin((i / 52) * 2 * Math.PI))
  )
}

/** Generate a flat array of zeros */
function makeZeroData(length = 52): number[] {
  return Array.from({ length }, () => 0)
}

describe('Sparkline', () => {
  // --- Rendering ---
  it('renders an SVG element', () => {
    render(<Sparkline data={makeSineData()} currentWeek={10} />)
    const svg = screen.getByTestId('sparkline-svg')
    expect(svg).toBeInTheDocument()
    expect(svg.tagName).toBe('svg')
  })

  it('returns null when data array is empty', () => {
    const { container } = render(<Sparkline data={[]} currentWeek={1} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders with 52 data points without errors', () => {
    const data = makeSineData()
    expect(data).toHaveLength(52)
    const { container } = render(<Sparkline data={data} currentWeek={26} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders with fewer than 52 data points', () => {
    const data = [0.1, 0.2, 0.3, 0.4, 0.5]
    const { container } = render(<Sparkline data={data} currentWeek={2} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  // --- SVG structure ---
  it('contains an area fill path and a line path', () => {
    const { container } = render(<Sparkline data={makeSineData()} currentWeek={10} />)
    const paths = container.querySelectorAll('path')
    // Two paths: area fill and line
    expect(paths.length).toBe(2)
  })

  it('contains a gradient definition', () => {
    const { container } = render(<Sparkline data={makeSineData()} currentWeek={10} />)
    const gradient = container.querySelector('linearGradient')
    expect(gradient).toBeInTheDocument()
    expect(gradient?.getAttribute('id')).toBe('sparkline-grad')
  })

  // --- Current week marker ---
  it('renders a dashed marker line for the current week', () => {
    const { container } = render(<Sparkline data={makeSineData()} currentWeek={25} />)
    const line = container.querySelector('line')
    expect(line).toBeInTheDocument()
    expect(line?.getAttribute('stroke')).toBe('#E74C3C')
    expect(line?.getAttribute('stroke-dasharray')).toBe('2 2')
  })

  it('renders a circle marker at the current week data point', () => {
    const { container } = render(<Sparkline data={makeSineData()} currentWeek={25} />)
    const circle = container.querySelector('circle')
    expect(circle).toBeInTheDocument()
    expect(circle?.getAttribute('fill')).toBe('#E74C3C')
  })

  // --- Frequency labels ---
  it('displays Jan and Dec labels', () => {
    render(<Sparkline data={makeSineData()} currentWeek={10} />)
    expect(screen.getByText('Jan')).toBeInTheDocument()
    expect(screen.getByText('Dec')).toBeInTheDocument()
  })

  it('displays current week info with frequency percentage', () => {
    const data = makeZeroData()
    data[9] = 0.45 // Week 10 = index 9
    render(<Sparkline data={data} currentWeek={10} />)
    // Should show "Wk 10: 45%"
    expect(screen.getByText('Wk 10: 45%')).toBeInTheDocument()
  })

  it('displays week 1 info correctly', () => {
    const data = makeZeroData()
    data[0] = 0.1 // Week 1 = index 0
    render(<Sparkline data={data} currentWeek={1} />)
    expect(screen.getByText('Wk 1: 10%')).toBeInTheDocument()
  })

  it('displays week 52 info correctly', () => {
    const data = makeZeroData()
    data[51] = 0.82 // Week 52 = index 51
    render(<Sparkline data={data} currentWeek={52} />)
    expect(screen.getByText('Wk 52: 82%')).toBeInTheDocument()
  })

  // --- Edge cases ---
  it('clamps currentWeek to valid range (week 0 becomes index 0)', () => {
    const data = makeSineData()
    // currentWeek = 0 should clamp to index 0
    const { container } = render(<Sparkline data={data} currentWeek={0} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('handles all-zero data gracefully (uses 0.01 floor for maxVal)', () => {
    const data = makeZeroData()
    const { container } = render(<Sparkline data={data} currentWeek={1} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
    // Should not throw or produce NaN
    const paths = container.querySelectorAll('path')
    for (const path of paths) {
      expect(path.getAttribute('d')).not.toContain('NaN')
    }
  })

  // --- CSS className passthrough ---
  it('applies custom className', () => {
    const { container } = render(
      <Sparkline data={makeSineData()} currentWeek={10} className="my-custom" />
    )
    const wrapper = container.firstElementChild
    expect(wrapper?.className).toContain('my-custom')
  })

  it('has relative positioning on wrapper div', () => {
    const { container } = render(<Sparkline data={makeSineData()} currentWeek={10} />)
    const wrapper = container.firstElementChild
    expect(wrapper?.className).toContain('relative')
  })
})
