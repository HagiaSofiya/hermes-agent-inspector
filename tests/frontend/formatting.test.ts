import { describe, expect, it } from 'vitest'

import { formatCost, formatTokens, runGroupLabel } from '../../src/utils/formatting'

describe('runGroupLabel', () => {
  it('labels a timestamp from today as Today', () => {
    expect(runGroupLabel(Date.now())).toBe('Today')
  })

  it('labels a timestamp from yesterday as Yesterday', () => {
    const now = new Date()
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12)

    expect(runGroupLabel(yesterday.getTime())).toBe('Yesterday')
  })

  it('labels an older date without repeating the year when it matches the current year', () => {
    const now = new Date()
    const earlier = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10, 12)
    const expected = earlier.toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: earlier.getFullYear() === now.getFullYear() ? undefined : 'numeric'
    })

    expect(runGroupLabel(earlier.getTime())).toBe(expected)
  })

  it('labels a date from a previous year with the year included', () => {
    const lastYear = new Date(2020, 5, 15, 12)
    const expected = lastYear.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })

    expect(runGroupLabel(lastYear.getTime())).toBe(expected)
  })
})

describe('formatTokens', () => {
  it('shows small counts exactly', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
  })

  it('abbreviates thousands and millions without trailing zeros', () => {
    expect(formatTokens(1_000)).toBe('1k')
    expect(formatTokens(20_000)).toBe('20k')
    expect(formatTokens(65_246)).toBe('65.2k')
    expect(formatTokens(1_400_000)).toBe('1.4M')
    expect(formatTokens(10_000_000)).toBe('10M')
  })

  it('renders an unknown count as a dash rather than a zero', () => {
    expect(formatTokens(null)).toBe('—')
    expect(formatTokens(undefined)).toBe('—')
  })
})

describe('formatCost', () => {
  it('distinguishes free from unknown', () => {
    expect(formatCost(0)).toBe('$0.00')
    expect(formatCost(null)).toBe('—')
    expect(formatCost(undefined)).toBe('—')
  })

  it('keeps sub-cent runs legible instead of rounding them to nothing', () => {
    expect(formatCost(0.0042)).toBe('$0.0042')
    expect(formatCost(0.00001)).toBe('<$0.0001')
  })

  it('uses ordinary currency precision above a cent', () => {
    expect(formatCost(0.5)).toBe('$0.50')
    expect(formatCost(1.239)).toBe('$1.24')
    expect(formatCost(12.5)).toBe('$12.50')
  })
})
