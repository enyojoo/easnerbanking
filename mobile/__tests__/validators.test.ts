import { validateRequired, validateEmail } from '../src/utils/validators'

describe('validators', () => {
  it('validateRequired rejects empty values', () => {
    expect(validateRequired('', 'Name').isValid).toBe(false)
    expect(validateRequired('  ', 'Name').isValid).toBe(false)
  })

  it('validateRequired accepts non-empty trimmed input', () => {
    expect(validateRequired('x', 'Name').isValid).toBe(true)
  })

  it('validateEmail rejects invalid addresses', () => {
    expect(validateEmail('bad').isValid).toBe(false)
    expect(validateEmail('a@b.co').isValid).toBe(true)
  })
})
