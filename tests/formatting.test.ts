import { describe, expect, it } from 'vitest'

import { runGroupLabel } from '../src/utils/formatting'

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
