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
// Which browser: the one in FIREFOX_BINARY if set, otherwise the first
// found of Firefox, Firefox Developer Edition, Firefox Nightly and Zen in
// the usual places. If none is found it says so and stops.
import { spawn } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const BUILD = "build/firefox-mv2-dev"
const PROFILE = ".firefox-profile"
const onWindows = process.platform === "win32"

function findFirefox() {
  if (process.env.FIREFOX_BINARY) return process.env.FIREFOX_BINARY
  // [app name, program inside it]. Zen is a browser built on Firefox, so
  // web-ext runs it the same way.
  const apps = [
    ["Firefox", "firefox"],
    ["Firefox Developer Edition", "firefox"],
    ["Firefox Nightly", "firefox"],
    ["Zen", "zen"],
    ["Zen Browser", "zen"]
  ]
  const candidates =
    process.platform === "darwin"
      ? ["/Applications", join(homedir(), "Applications")].flatMap((dir) =>
          apps.map(([app, program]) => join(dir, `${app}.app`, "Contents", "MacOS", program))
        )
      : onWindows
        ? [
            ["Mozilla Firefox", "firefox.exe"],
            ["Firefox Developer Edition", "firefox.exe"],
            ["Firefox Nightly", "firefox.exe"],
            ["Zen Browser", "zen.exe"]
          ].flatMap(([app, program]) =>
            [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]
              .filter(Boolean)
              .map((dir) => join(dir, app, program))
          )
        : ["/usr/bin/firefox", "/usr/bin/firefox-developer-edition", "/snap/bin/firefox", "/usr/bin/zen-browser", "/usr/bin/zen"]
  return candidates.find((path) => existsSync(path))
}

const firefox = findFirefox()
if (!firefox || !existsSync(firefox)) {
  console.error(
    [
      "",
      "Kollect couldn't find Firefox or Zen on this computer.",
      "Install Firefox from https://www.mozilla.org/firefox/ or Zen from https://zen-browser.app,",
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

// --no-cs-reload: Plasmo's live reload opens a connection to localhost
// from the reading-page script. Firefox (and Zen) apply a website's
// security rules to it, and on sites that forbid it (atsu.moe, for one)
// the error stops the whole script, so the Kollect button and progress
// bar never appear. Without it, web-ext still reloads the extension when
// the build changes; refresh an open reading page to see the change.
run("plasmo", ["dev", "--target=firefox-mv2", "--no-cs-reload"])

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
