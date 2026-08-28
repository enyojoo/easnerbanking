import { afterEach, describe, expect, it } from "vitest"
import {
  CONNECT_JS_LOAD_ERROR,
  CONNECT_JS_SRC,
  __resetConnectJsLoaderForTests,
  ensureConnectJsLoaded,
  isConnectJsReady,
} from "./load-connect-js"

type Listener = () => void

function installScriptDom() {
  const listeners = new Map<string, Listener[]>()
  const created: Array<{ src: string; fire: (type: "load" | "error") => void; removed: boolean }> =
    []

  const scriptEl = {
    src: "",
    async: false,
    addEventListener: (type: string, fn: Listener) => {
      const list = listeners.get(type) ?? []
      list.push(fn)
      listeners.set(type, list)
    },
    removeEventListener: (type: string, fn: Listener) => {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((listener) => listener !== fn),
      )
    },
    remove: () => {
      const current = created.filter((s) => !s.removed).at(-1)
      if (current) current.removed = true
    },
  }

  const documentStub = {
    head: {
      appendChild: (el: typeof scriptEl) => {
        created.push({
          src: el.src,
          removed: false,
          fire: (type) => {
            for (const fn of listeners.get(type) ?? []) fn()
          },
        })
        return el
      },
    },
    querySelector: (selector: string) => {
      if (!selector.includes("connect-js.stripe.com")) return null
      const last = created.filter((s) => !s.removed).at(-1)
      return last ? scriptEl : null
    },
    createElement: (tag: string) => {
      if (tag !== "script") throw new Error(`unexpected tag ${tag}`)
      listeners.clear()
      scriptEl.src = ""
      scriptEl.async = false
      return scriptEl
    },
  }

  Object.assign(globalThis, {
    window: globalThis,
    document: documentStub,
  })

  return {
    created,
    fire: (type: "load" | "error") => {
      created.filter((s) => !s.removed).at(-1)?.fire(type)
    },
  }
}

function teardown() {
  __resetConnectJsLoaderForTests()
  delete (globalThis as { StripeConnect?: unknown }).StripeConnect
  delete (globalThis as { window?: unknown }).window
  // @ts-expect-error test stub
  delete globalThis.document
}

describe("ensureConnectJsLoaded", () => {
  afterEach(teardown)

  it("injects Connect.js and resolves once StripeConnect.init exists", async () => {
    const dom = installScriptDom()
    __resetConnectJsLoaderForTests()

    const pending = ensureConnectJsLoaded()
    expect(dom.created).toHaveLength(1)
    expect(dom.created[0]?.src).toBe(CONNECT_JS_SRC)
    ;(globalThis as { StripeConnect?: { init: () => unknown } }).StripeConnect = {
      init: () => ({}),
    }
    dom.fire("load")
    await expect(pending).resolves.toBeUndefined()
    expect(isConnectJsReady()).toBe(true)
  })

  it("rejects when the script tag fails, then retries with a new tag", async () => {
    const dom = installScriptDom()
    __resetConnectJsLoaderForTests()

    const first = ensureConnectJsLoaded()
    expect(dom.created).toHaveLength(1)
    dom.fire("error")
    await expect(first).rejects.toThrow(CONNECT_JS_LOAD_ERROR)
    expect(dom.created[0]?.removed).toBe(true)

    const second = ensureConnectJsLoaded()
    expect(dom.created.filter((s) => !s.removed)).toHaveLength(1)
    ;(globalThis as { StripeConnect?: { init: () => unknown } }).StripeConnect = {
      init: () => ({}),
    }
    dom.fire("load")
    await expect(second).resolves.toBeUndefined()
    expect(isConnectJsReady()).toBe(true)
  })

  it("coalesces concurrent loads into one script tag", async () => {
    const dom = installScriptDom()
    __resetConnectJsLoaderForTests()

    const a = ensureConnectJsLoaded()
    const b = ensureConnectJsLoaded()
    expect(dom.created.filter((s) => !s.removed)).toHaveLength(1)
    ;(globalThis as { StripeConnect?: { init: () => unknown } }).StripeConnect = {
      init: () => ({}),
    }
    dom.fire("load")
    await expect(Promise.all([a, b])).resolves.toEqual([undefined, undefined])
  })
})
