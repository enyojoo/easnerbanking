import {
  DESKTOP_MIN_WIDTH,
  REGULAR_WIDTH_BREAKPOINT,
  getLayoutMode,
} from '../src/theme/layoutMetrics'

describe('getLayoutMode', () => {
  it('returns mobile below tablet breakpoint', () => {
    expect(getLayoutMode(0)).toBe('mobile')
    expect(getLayoutMode(375)).toBe('mobile')
    expect(getLayoutMode(REGULAR_WIDTH_BREAKPOINT - 1)).toBe('mobile')
  })

  it('returns tablet at regular width until desktop', () => {
    expect(getLayoutMode(REGULAR_WIDTH_BREAKPOINT)).toBe('tablet')
    expect(getLayoutMode(768)).toBe('tablet')
    expect(getLayoutMode(DESKTOP_MIN_WIDTH - 1)).toBe('tablet')
  })

  it('returns desktop at desktop breakpoint and above', () => {
    expect(getLayoutMode(DESKTOP_MIN_WIDTH)).toBe('desktop')
    expect(getLayoutMode(1920)).toBe('desktop')
  })
})
