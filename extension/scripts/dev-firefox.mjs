// pnpm dev:firefox — builds the extension for Firefox and opens Firefox
// with it loaded, using web-ext (Mozilla's tool for running extensions).
//
// 1. Plasmo builds into build/firefox-mv2-dev and keeps rebuilding as you
//    edit.
// 2. Once the first build is there, web-ext opens Firefox with Kollect
//    installed, and reloads it whenever the build changes.
//
// Firefox keeps its own profile in .firefox-profile, so your login (and
// anything else you do in that Firefox) survives between runs.
//
// The Firefox build uses Manifest V2: Firefox grants website access when
// the extension is installed, instead of asking on every site.
import { spawn } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"

const BUILD = "build/firefox-mv2-dev"
const PROFILE = ".firefox-profile"
const onWindows = process.platform === "win32"

const children = []
function run(command, args) {
  const child = spawn(command, args, { stdio: "inherit", shell: onWindows })
  children.push(child)
  child.on("exit", (code) => stop(code ?? 0))
  return child
}

let stopping = false
function stop(code) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill()
  process.exit(code)
}
process.on("SIGINT", () => stop(0))
process.on("SIGTERM", () => stop(0))

run("plasmo", ["dev", "--target=firefox-mv2"])

// Wait for the first build before opening Firefox.
const waiting = setInterval(() => {
  if (!existsSync(`${BUILD}/manifest.json`)) return
  clearInterval(waiting)
  mkdirSync(PROFILE, { recursive: true })
  run("web-ext", [
    "run",
    "--source-dir", BUILD,
    "--target", "firefox-desktop",
    "--firefox-profile", PROFILE,
    "--profile-create-if-missing",
    "--keep-profile-changes",
    "--start-url", "http://localhost:3000"
  ])
}, 1000)
