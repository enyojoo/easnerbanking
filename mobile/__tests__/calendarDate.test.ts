import {
  formatCalendarDate,
  formatCalendarDateDisplay,
  parseCalendarDate,
} from '../src/lib/calendarDate'

describe('calendarDate', () => {
  it('parses YYYY-MM-DD in local time without UTC shift', () => {
    const date = parseCalendarDate('2000-01-02')
    expect(date).not.toBeNull()
    expect(date!.getFullYear()).toBe(2000)
    expect(date!.getMonth()).toBe(0)
    expect(date!.getDate()).toBe(2)
  })

  it('round-trips through formatCalendarDate', () => {
    const date = new Date(1990, 11, 31)
    expect(formatCalendarDate(date)).toBe('1990-12-31')
    expect(formatCalendarDate(parseCalendarDate('1990-12-31')!)).toBe('1990-12-31')
  })

  it('formats display from stored ISO date', () => {
    expect(formatCalendarDateDisplay('2000-01-02')).toMatch(/January 2, 2000/)
  })

  it('rejects invalid calendar dates', () => {
    expect(parseCalendarDate('2000-02-30')).toBeNull()
    expect(parseCalendarDate('')).toBeNull()
  })
})
