import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, act, waitFor, cleanup } from '@testing-library/react'
import 'fake-indexeddb/auto'

import { LifeListProvider, useLifeList } from '../LifeListContext'

afterEach(() => {
  cleanup()
})

// Test component that exposes context values
function TestConsumer({ onRender }: { onRender: (ctx: ReturnType<typeof useLifeList>) => void }) {
  const ctx = useLifeList()
  onRender(ctx)
  return <div data-testid="consumer">seen: {ctx.getTotalSeen()}</div>
}

function renderWithProvider(onRender: (ctx: ReturnType<typeof useLifeList>) => void) {
  return render(
    <LifeListProvider>
      <TestConsumer onRender={onRender} />
    </LifeListProvider>
  )
}

describe('LifeListContext', () => {
  it('provides an empty life list initially', async () => {
    let ctx: ReturnType<typeof useLifeList> | undefined

    renderWithProvider((c) => { ctx = c })

    await waitFor(() => {
      expect(screen.getByTestId('consumer')).toBeInTheDocument()
    })

    expect(ctx!.getTotalSeen()).toBe(0)
    expect(ctx!.isSpeciesSeen('amerob')).toBe(false)
  })

  it('marks a species as seen', async () => {
    let ctx: ReturnType<typeof useLifeList> | undefined

    renderWithProvider((c) => { ctx = c })

    await waitFor(() => {
      expect(screen.getByTestId('consumer')).toBeInTheDocument()
    })

    await act(async () => {
      await ctx!.markSpeciesSeen('amerob', 'American Robin')
    })

    expect(ctx!.isSpeciesSeen('amerob')).toBe(true)
    expect(ctx!.getTotalSeen()).toBe(1)
  })

  it('marks a species as unseen', async () => {
    let ctx: ReturnType<typeof useLifeList> | undefined

    renderWithProvider((c) => { ctx = c })

    await waitFor(() => {
      expect(screen.getByTestId('consumer')).toBeInTheDocument()
    })

    await act(async () => {
      await ctx!.markSpeciesSeen('amerob', 'American Robin')
    })

    await act(async () => {
      await ctx!.markSpeciesUnseen('amerob')
    })

    expect(ctx!.isSpeciesSeen('amerob')).toBe(false)
    expect(ctx!.getTotalSeen()).toBe(0)
  })

  it('toggles species seen/unseen', async () => {
    let ctx: ReturnType<typeof useLifeList> | undefined

    renderWithProvider((c) => { ctx = c })

    await waitFor(() => {
      expect(screen.getByTestId('consumer')).toBeInTheDocument()
    })

    // Toggle on
    await act(async () => {
      await ctx!.toggleSpecies('amerob', 'American Robin')
    })
    expect(ctx!.isSpeciesSeen('amerob')).toBe(true)

    // Toggle off
    await act(async () => {
      await ctx!.toggleSpecies('amerob', 'American Robin')
    })
    expect(ctx!.isSpeciesSeen('amerob')).toBe(false)
  })

  it('clears all species', async () => {
    let ctx: ReturnType<typeof useLifeList> | undefined

    renderWithProvider((c) => { ctx = c })

    await waitFor(() => {
      expect(screen.getByTestId('consumer')).toBeInTheDocument()
    })

    await act(async () => {
      await ctx!.markSpeciesSeen('amerob', 'American Robin')
      await ctx!.markSpeciesSeen('houspa', 'House Sparrow')
    })

    expect(ctx!.getTotalSeen()).toBe(2)

    await act(async () => {
      await ctx!.clearAllSpecies()
    })

    expect(ctx!.getTotalSeen()).toBe(0)
  })

  it('imports a species list', async () => {
    let ctx: ReturnType<typeof useLifeList> | undefined

    renderWithProvider((c) => { ctx = c })

    await waitFor(() => {
      expect(screen.getByTestId('consumer')).toBeInTheDocument()
    })

    // Mark one as already seen
    await act(async () => {
      await ctx!.markSpeciesSeen('amerob', 'American Robin')
    })

    // Import list that includes the already-seen species plus new ones
    let result: { newCount: number; existingCount: number } | undefined
    await act(async () => {
      result = await ctx!.importSpeciesList(
        ['amerob', 'houspa', 'baleag'],
        ['American Robin', 'House Sparrow', 'Bald Eagle']
      )
    })

    expect(result!.newCount).toBe(2)
    expect(result!.existingCount).toBe(1)
    expect(ctx!.getTotalSeen()).toBe(3)
    expect(ctx!.isSpeciesSeen('baleag')).toBe(true)
  })

  it('throws when useLifeList is used outside provider', () => {
    function BadComponent() {
      useLifeList()
      return null
    }

    expect(() => render(<BadComponent />)).toThrow(
      'useLifeList must be used within a LifeListProvider'
    )
  })
})
