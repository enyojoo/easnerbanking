import { isWorkspaceSurfacePath } from "@/lib/surface-paths"

/** Hard navigation so expired sessions leave workspace immediately without flashing cached UI. */
export function redirectToWorkspaceLogin(): void {
  if (typeof window === "undefined") return
  if (!isWorkspaceSurfacePath(window.location.pathname, window.location.hostname)) return
  if (window.location.pathname.startsWith("/auth/")) return
  window.location.replace("/auth/login")
}
