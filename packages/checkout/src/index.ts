import {
  mountInline,
  PLATFORM_KEY_PLACEHOLDER,
  PLATFORM_TEST_KEY_PLACEHOLDER,
  VALIDATE_URL_PLACEHOLDER,
} from "./inline"
import { openOverlay as openOverlayImpl } from "./overlay"
import type { EasnerCheckoutApi, EasnerCheckoutMountOptions, EasnerCheckoutOverlayOptions, MountedCheckout } from "./types"
import { resolveElement } from "./validation"

const mounts = new Set<MountedCheckout>()

function runtime() {
  return {
    platformKey: PLATFORM_KEY_PLACEHOLDER,
    platformTestKey: PLATFORM_TEST_KEY_PLACEHOLDER,
    validateUrl: VALIDATE_URL_PLACEHOLDER,
  }
}

async function mount(
  target: string | Element,
  options: EasnerCheckoutMountOptions,
): Promise<MountedCheckout> {
  const mounted = await mountInline(target, options, runtime())
  mounts.add(mounted)
  const original = mounted.destroy
  mounted.destroy = () => {
    mounts.delete(mounted)
    original()
  }
  return mounted
}

async function openOverlay(options: EasnerCheckoutOverlayOptions): Promise<MountedCheckout> {
  const mounted = await openOverlayImpl(options, runtime())
  mounts.add(mounted)
  const original = mounted.destroy
  mounted.destroy = () => {
    mounts.delete(mounted)
    original()
  }
  return mounted
}

function destroy(target?: string | Element | MountedCheckout): void {
  if (target && typeof target === "object" && "destroy" in target) {
    target.destroy()
    mounts.delete(target)
    return
  }
  const el = resolveElement(target ?? null)
  if (el) el.replaceChildren()
  for (const mounted of [...mounts]) mounted.destroy()
  mounts.clear()
}

const api: EasnerCheckoutApi = { mount, openOverlay, destroy }
export default api
export { mount, openOverlay, destroy }
