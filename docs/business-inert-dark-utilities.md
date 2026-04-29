# Easner Business: `dark:` utility classes

The Business web app pins the document to the light theme (`<html className="light">` per design-system §9.3). Tailwind `dark:*` variants therefore never apply at runtime: those branches are **inert**. Prefer tokens and `light:` / unprefixed utilities that match the Light column; stripping `dark:*` from shared UI is optional cleanup, not required for correct styling.
