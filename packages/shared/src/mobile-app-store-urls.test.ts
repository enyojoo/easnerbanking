import { afterEach, describe, expect, it } from "vitest"
import { resolveMobileAppStoreUrls } from "./mobile-app-store-urls"

describe("resolveMobileAppStoreUrls", () => {
  const env = { ...process.env }

  afterEach(() => {
    process.env = { ...env }
  })

  it("defaults download page to www.easner.com/app", () => {
    delete process.env.EASNER_DOWNLOAD_PAGE_URL
    delete process.env.EASNER_APP_STORE_URL
    delete process.env.EASNER_PLAY_STORE_URL

    const urls = resolveMobileAppStoreUrls()
    expect(urls.downloadPage).toBe("https://www.easner.com/app")
    expect(urls.appStore).toBe("https://www.easner.com/app?platform=ios")
    expect(urls.playStore).toBe("https://www.easner.com/app?platform=android")
    expect(urls.appWeb).toBe("https://app.easner.com")
  })

  it("prefers explicit env overrides", () => {
    process.env.EASNER_DOWNLOAD_PAGE_URL = "https://www.easner.com/app"
    process.env.EASNER_APP_STORE_URL = "https://apps.apple.com/us/app/easner/id6762069433"
    process.env.EASNER_PLAY_STORE_URL =
      "https://github.com/enyojoo/easner/releases/latest/download/Easner-Beta.apk"

    const urls = resolveMobileAppStoreUrls()
    expect(urls.downloadPage).toBe("https://www.easner.com/app")
    expect(urls.appStore).toBe("https://apps.apple.com/us/app/easner/id6762069433")
    expect(urls.playStore).toBe(
      "https://github.com/enyojoo/easner/releases/latest/download/Easner-Beta.apk",
    )
  })
})
