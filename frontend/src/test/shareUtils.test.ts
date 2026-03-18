import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateMilestoneCard, shareOrDownload } from '../lib/shareUtils'

// --- Canvas mock setup ---

/** Minimal mock for CanvasRenderingContext2D */
function createMockContext(): Record<string, unknown> {
  return {
    fillStyle: '',
    font: '',
    textAlign: '',
    fillRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    roundRect: vi.fn(),
  }
}

describe('shareUtils', () => {
  let mockCtx: Record<string, unknown>
  let mockCanvas: {
    width: number
    height: number
    getContext: ReturnType<typeof vi.fn>
    toBlob: ReturnType<typeof vi.fn>
  }
  let originalCreateElement: typeof document.createElement

  beforeEach(() => {
    mockCtx = createMockContext()
    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockCtx),
      toBlob: vi.fn((callback: (blob: Blob) => void) => {
        callback(new Blob(['fake-png-data'], { type: 'image/png' }))
      }),
    }

    originalCreateElement = document.createElement.bind(document)

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return mockCanvas as unknown as HTMLCanvasElement
      }
      return originalCreateElement(tag)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // --- generateMilestoneCard ---
  describe('generateMilestoneCard', () => {
    it('returns a Blob of type image/png', async () => {
      const blob = await generateMilestoneCard({
        count: 42,
        milestone: 50,
        percentComplete: 84.0,
      })
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('image/png')
    })

    it('creates a canvas with correct dimensions (400x250)', async () => {
      await generateMilestoneCard({
        count: 100,
        milestone: 100,
        percentComplete: 100.0,
      })
      expect(mockCanvas.width).toBe(400)
      expect(mockCanvas.height).toBe(250)
    })

    it('obtains a 2d rendering context', async () => {
      await generateMilestoneCard({
        count: 10,
        milestone: 10,
        percentComplete: 10.0,
      })
      expect(mockCanvas.getContext).toHaveBeenCalledWith('2d')
    })

    it('calls toBlob with image/png type', async () => {
      await generateMilestoneCard({
        count: 25,
        milestone: 25,
        percentComplete: 25.0,
      })
      expect(mockCanvas.toBlob).toHaveBeenCalledWith(
        expect.any(Function),
        'image/png'
      )
    })

    it('draws text on the canvas including milestone number', async () => {
      await generateMilestoneCard({
        count: 500,
        milestone: 500,
        percentComplete: 50.0,
      })
      const fillTextCalls = (mockCtx.fillText as ReturnType<typeof vi.fn>).mock.calls
      // Should have drawn app name, milestone number, "Species Milestone", and progress text
      expect(fillTextCalls.length).toBeGreaterThanOrEqual(4)
      // Check milestone number is drawn
      const milestoneDrawn = fillTextCalls.some(
        (call: unknown[]) => call[0] === '500'
      )
      expect(milestoneDrawn).toBe(true)
    })

    it('draws the app name "Find-A-Lifer"', async () => {
      await generateMilestoneCard({
        count: 10,
        milestone: 10,
        percentComplete: 10.0,
      })
      const fillTextCalls = (mockCtx.fillText as ReturnType<typeof vi.fn>).mock.calls
      const appNameDrawn = fillTextCalls.some(
        (call: unknown[]) => call[0] === 'Find-A-Lifer'
      )
      expect(appNameDrawn).toBe(true)
    })

    it('draws progress bar background and fill', async () => {
      await generateMilestoneCard({
        count: 75,
        milestone: 100,
        percentComplete: 75.0,
      })
      // roundRect called at least twice (bar background + bar fill)
      expect(mockCtx.roundRect as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2)
    })
  })

  // --- shareOrDownload ---
  describe('shareOrDownload', () => {
    let appendChildSpy: ReturnType<typeof vi.fn>
    let removeChildSpy: ReturnType<typeof vi.fn>
    let revokeObjectURLSpy: ReturnType<typeof vi.fn>
    let createObjectURLSpy: ReturnType<typeof vi.fn>
    let mockAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn> }

    beforeEach(() => {
      mockAnchor = { href: '', download: '', click: vi.fn() }

      // Override createElement to also handle 'a' tags
      const currentCreateElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'canvas') {
          return mockCanvas as unknown as HTMLCanvasElement
        }
        if (tag === 'a') {
          return mockAnchor as unknown as HTMLAnchorElement
        }
        return currentCreateElement(tag)
      })

      appendChildSpy = vi.fn()
      removeChildSpy = vi.fn()
      vi.spyOn(document.body, 'appendChild').mockImplementation(appendChildSpy)
      vi.spyOn(document.body, 'removeChild').mockImplementation(removeChildSpy)

      createObjectURLSpy = vi.fn().mockReturnValue('blob:mock-url')
      revokeObjectURLSpy = vi.fn()
      globalThis.URL.createObjectURL = createObjectURLSpy
      globalThis.URL.revokeObjectURL = revokeObjectURLSpy
    })

    it('uses navigator.share when available and files are shareable', async () => {
      const shareSpy = vi.fn().mockResolvedValue(undefined)
      const canShareSpy = vi.fn().mockReturnValue(true)
      Object.defineProperty(navigator, 'share', {
        value: shareSpy,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(navigator, 'canShare', {
        value: canShareSpy,
        writable: true,
        configurable: true,
      })

      const blob = new Blob(['data'], { type: 'image/png' })
      await shareOrDownload(blob, 'test.png')

      expect(shareSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Find-A-Lifer Milestone',
          text: 'Check out my birding milestone!',
          files: expect.arrayContaining([expect.any(File)]),
        })
      )
      // Download fallback should NOT be called
      expect(mockAnchor.click).not.toHaveBeenCalled()

      // Clean up
      Object.defineProperty(navigator, 'share', {
        value: undefined,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(navigator, 'canShare', {
        value: undefined,
        writable: true,
        configurable: true,
      })
    })

    it('falls back to download when navigator.share is not available', async () => {
      // Ensure share is not available
      Object.defineProperty(navigator, 'share', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      const blob = new Blob(['data'], { type: 'image/png' })
      await shareOrDownload(blob, 'milestone.png')

      expect(createObjectURLSpy).toHaveBeenCalledWith(blob)
      expect(mockAnchor.href).toBe('blob:mock-url')
      expect(mockAnchor.download).toBe('milestone.png')
      expect(mockAnchor.click).toHaveBeenCalled()
      expect(appendChildSpy).toHaveBeenCalled()
      expect(removeChildSpy).toHaveBeenCalled()
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url')
    })

    it('falls back to download when canShare returns false', async () => {
      const shareSpy = vi.fn()
      const canShareSpy = vi.fn().mockReturnValue(false)
      Object.defineProperty(navigator, 'share', {
        value: shareSpy,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(navigator, 'canShare', {
        value: canShareSpy,
        writable: true,
        configurable: true,
      })

      const blob = new Blob(['data'], { type: 'image/png' })
      await shareOrDownload(blob)

      expect(shareSpy).not.toHaveBeenCalled()
      expect(mockAnchor.click).toHaveBeenCalled()

      Object.defineProperty(navigator, 'share', {
        value: undefined,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(navigator, 'canShare', {
        value: undefined,
        writable: true,
        configurable: true,
      })
    })

    it('falls back to download when navigator.share throws', async () => {
      const shareSpy = vi.fn().mockRejectedValue(new Error('User cancelled'))
      const canShareSpy = vi.fn().mockReturnValue(true)
      Object.defineProperty(navigator, 'share', {
        value: shareSpy,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(navigator, 'canShare', {
        value: canShareSpy,
        writable: true,
        configurable: true,
      })

      const blob = new Blob(['data'], { type: 'image/png' })
      await shareOrDownload(blob, 'fallback.png')

      // Share was attempted but failed, so download fallback is used
      expect(shareSpy).toHaveBeenCalled()
      expect(mockAnchor.click).toHaveBeenCalled()
      expect(mockAnchor.download).toBe('fallback.png')

      Object.defineProperty(navigator, 'share', {
        value: undefined,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(navigator, 'canShare', {
        value: undefined,
        writable: true,
        configurable: true,
      })
    })

    it('uses default filename when none provided', async () => {
      Object.defineProperty(navigator, 'share', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      const blob = new Blob(['data'], { type: 'image/png' })
      await shareOrDownload(blob)

      expect(mockAnchor.download).toBe('milestone.png')

    })

    it('revokes the object URL after download', async () => {
      Object.defineProperty(navigator, 'share', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      const blob = new Blob(['data'], { type: 'image/png' })
      await shareOrDownload(blob)

      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url')
    })
  })
})
