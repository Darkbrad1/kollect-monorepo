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
//
// Which Firefox: the one in FIREFOX_BINARY if set, otherwise the first
// found of Firefox, Firefox Developer Edition and Firefox Nightly in the
// usual places. If none is found it says so and stops.
import { spawn } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const BUILD = "build/firefox-mv2-dev"
const PROFILE = ".firefox-profile"
const onWindows = process.platform === "win32"

function findFirefox() {
  if (process.env.FIREFOX_BINARY) return process.env.FIREFOX_BINARY
  const apps = ["Firefox", "Firefox Developer Edition", "Firefox Nightly"]
  const candidates =
    process.platform === "darwin"
      ? ["/Applications", join(homedir(), "Applications")].flatMap((dir) =>
          apps.map((app) => join(dir, `${app}.app`, "Contents", "MacOS", "firefox"))
        )
      : onWindows
        ? ["Mozilla Firefox", "Firefox Developer Edition", "Firefox Nightly"].flatMap((app) =>
            [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]
              .filter(Boolean)
              .map((dir) => join(dir, app, "firefox.exe"))
          )
        : ["/usr/bin/firefox", "/usr/bin/firefox-developer-edition", "/snap/bin/firefox"]
  return candidates.find((path) => existsSync(path))
}

const firefox = findFirefox()
if (!firefox || !existsSync(firefox)) {
  console.error(
    [
      "",
      "Kollect couldn't find Firefox on this computer.",
      "Install it from https://www.mozilla.org/firefox/ (Firefox Developer Edition works too),",
      "or, if it's somewhere unusual, say where and run this again:",
      "",
      '  FIREFOX_BINARY="/path/to/Firefox.app/Contents/MacOS/firefox" pnpm dev:firefox',
      ""
    ].join("\n")
  )
  process.exit(1)
}

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
    "--firefox", firefox,
    "--firefox-profile", PROFILE,
    "--profile-create-if-missing",
    "--keep-profile-changes",
    "--start-url", "http://localhost:3000"
  ])
}, 1000)
