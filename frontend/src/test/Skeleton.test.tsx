import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  SpeciesItemSkeleton,
  FamilyGroupSkeleton,
  LocationCardSkeleton,
  ProgressSkeleton,
  ListSkeleton,
} from '../components/Skeleton'

describe('Skeleton components', () => {
  it('renders SpeciesItemSkeleton with animate-pulse', () => {
    const { container } = render(<SpeciesItemSkeleton />)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('renders FamilyGroupSkeleton with correct item count', () => {
    const { container } = render(<FamilyGroupSkeleton itemCount={5} />)
    // Family header + 5 item skeletons
    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThanOrEqual(5)
  })

  it('renders LocationCardSkeleton', () => {
    const { container } = render(<LocationCardSkeleton />)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('renders ProgressSkeleton with stats cards', () => {
    const { container } = render(<ProgressSkeleton />)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('renders ListSkeleton with default count', () => {
    const { container } = render(<ListSkeleton />)
    // Each LocationCardSkeleton is a direct child of the space-y-2 wrapper
    const wrapper = container.querySelector('.space-y-2')
    expect(wrapper).toBeTruthy()
    expect(wrapper!.children.length).toBe(5)
  })

  it('renders ListSkeleton with custom count', () => {
    const { container } = render(<ListSkeleton count={3} />)
    const wrapper = container.querySelector('.space-y-2')
    expect(wrapper).toBeTruthy()
    expect(wrapper!.children.length).toBe(3)
  })
})
