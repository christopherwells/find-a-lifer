/**
 * Compact 52-week frequency sparkline SVG.
 * Shows a small area chart of species reporting frequency across the year.
 * Supports interactive dragging to change the current week.
 */

import { useId, useRef, useCallback, useState } from 'react'

interface SparklineProps {
  /** 52-element array of average reporting frequencies (0-1) */
  data: number[]
  /** Current week number (1-52) for the marker line */
  currentWeek: number
  className?: string
  /** Called when user finishes dragging to a new week (on release) */
  onWeekChange?: (week: number) => void
}

export default function Sparkline({ data, currentWeek, className = '', onWeekChange }: SparklineProps) {
  // Unique ID per instance to avoid SVG gradient ID collisions
  const gradId = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragWeek, setDragWeek] = useState<number | null>(null)
  const isDragging = useRef(false)

  if (data.length === 0) return null

  const width = 160
  const height = 40
  const padding = { top: 2, bottom: 2, left: 1, right: 1 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const maxVal = Math.max(...data, 0.01)

  const points = data.map((val, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartW
    const y = padding.top + chartH - (val / maxVal) * chartH
    return { x, y }
  })

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${padding.top + chartH} L ${padding.left} ${padding.top + chartH} Z`

  const displayWeek = dragWeek ?? currentWeek
  const weekIdx = Math.min(Math.max(displayWeek - 1, 0), data.length - 1)
  const markerX = padding.left + (weekIdx / (data.length - 1)) * chartW
  const markerFreq = data[weekIdx]

  // Convert a client X position to a week number (1-52)
  const clientXToWeek = useCallback((clientX: number): number => {
    const svg = svgRef.current
    if (!svg) return currentWeek
    const rect = svg.getBoundingClientRect()
    const relX = (clientX - rect.left) / rect.width
    const week = Math.round(relX * (data.length - 1)) + 1
    return Math.max(1, Math.min(data.length, week))
  }, [currentWeek, data.length])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!onWeekChange) return
    isDragging.current = true
    const svg = svgRef.current
    if (svg) (svg as Element).setPointerCapture(e.pointerId)
    setDragWeek(clientXToWeek(e.clientX))
  }, [onWeekChange, clientXToWeek])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return
    setDragWeek(clientXToWeek(e.clientX))
  }, [clientXToWeek])

  const handlePointerUp = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    if (dragWeek !== null && onWeekChange) {
      onWeekChange(dragWeek)
    }
    setDragWeek(null)
  }, [dragWeek, onWeekChange])

  const interactive = !!onWeekChange

  return (
    <div className={`relative ${className}`}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={`w-full h-auto ${interactive ? 'cursor-ew-resize' : ''}`}
        style={interactive ? { touchAction: 'none', minHeight: '44px' } : undefined}
        role="img"
        aria-label={`Frequency sparkline: peak ${(Math.max(...data) * 100).toFixed(0)}%, week ${displayWeek} is ${(markerFreq * 100).toFixed(0)}%`}
        data-testid="sparkline-svg"
        onPointerDown={interactive ? handlePointerDown : undefined}
        onPointerMove={interactive ? handlePointerMove : undefined}
        onPointerUp={interactive ? handlePointerUp : undefined}
        onPointerCancel={interactive ? handlePointerUp : undefined}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="[stop-color:theme(colors.blue.700)] dark:[stop-color:theme(colors.blue.400)]" stopOpacity={0.3} />
            <stop offset="100%" className="[stop-color:theme(colors.blue.700)] dark:[stop-color:theme(colors.blue.400)]" stopOpacity={0.05} />
          </linearGradient>
        </defs>

        {/* Invisible hit area for touch targets */}
        {interactive && (
          <rect x={0} y={0} width={width} height={height} fill="transparent" />
        )}

        <path d={areaPath} fill={`url(#${gradId})`} />
        <path
          d={linePath}
          fill="none"
          className="stroke-blue-700 dark:stroke-blue-400"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />

        <line
          x1={markerX} y1={padding.top} x2={markerX} y2={padding.top + chartH}
          className="stroke-red-500"
          strokeWidth={isDragging.current || dragWeek !== null ? 2 : 1}
          strokeDasharray={isDragging.current || dragWeek !== null ? undefined : '2 2'}
          opacity={0.7}
        />
        <circle
          cx={markerX}
          cy={padding.top + chartH - (markerFreq / maxVal) * chartH}
          r={isDragging.current || dragWeek !== null ? 3.5 : 2.5}
          className="fill-red-500 stroke-white dark:stroke-gray-900"
          strokeWidth={1}
        />
      </svg>

      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-0.5 px-0.5">
        <span>Jan</span>
        <span className="text-red-500 dark:text-red-400 font-medium">
          Wk {displayWeek}: {(markerFreq * 100).toFixed(0)}%
        </span>
        <span>Dec</span>
      </div>
    </div>
  )
}
