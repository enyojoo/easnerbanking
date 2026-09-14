import { hostedKycUrlForWebEmbed } from '../hostedKycUrl'

describe('hostedKycUrlForWebEmbed', () => {
  it('rewrites Persona verify links for the web iframe modal', () => {
    const out = hostedKycUrlForWebEmbed(
      'https://withpersona.com/verify?inquiry-id=abc',
      'https://app.easner.com',
    )
    const parsed = new URL(out)
    expect(parsed.pathname).toContain('/widget')
    expect(parsed.searchParams.get('iframe-origin')).toBe('https://app.easner.com')
  })

  it('adds iframe-origin to Noah hosted checkout', () => {
    const out = hostedKycUrlForWebEmbed(
      'https://checkout.noah.com/kyc?session=abc',
      'https://app.easner.com',
    )
    expect(new URL(out).searchParams.get('iframe-origin')).toBe('https://app.easner.com')
  })

  it('leaves native-style non-hosted URLs unchanged', () => {
    expect(hostedKycUrlForWebEmbed('https://easner.com/privacy', 'https://app.easner.com')).toBe(
      'https://easner.com/privacy',
    )
  })
})
