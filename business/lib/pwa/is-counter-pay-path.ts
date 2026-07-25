/** Routes that belong to the public counter-payment experience. */
export function isCounterPayPath(pathname: string): boolean {
  return pathname === "/pay" || pathname.startsWith("/pay/")
}
