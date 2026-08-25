import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const Module = require("module")
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {}
  return origLoad.apply(this, arguments)
}
