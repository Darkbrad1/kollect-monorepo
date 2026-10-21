# Kollect on phones

Notes from a talk on 2026-10-21 about using Kollect on a phone. Nothing here is built or decided yet. It's a list of options to come back to.

The problem: Kollect is a Chrome extension, and Chrome on phones doesn't run extensions.

## Option 1: Firefox for Android

Firefox on Android runs extensions, and Kollect already builds for Firefox (`pnpm --filter extension build:firefox`). This is the smallest job and reuses almost all the code.

What works the same:

- The Kollect button on reading pages, the progress bar, tracking as you scroll, and "back to where you left off".
- Login and talking to Convex, through the background worker.

What's different:

- Phones have no right-click menu and no Alt+Shift+K, so the Kollect button becomes the main way to add a manga.
- The popup opens as a full page, so the library screens need a layout for a narrow screen.
- The Kollect button fades to full when the mouse is over it. Phones have no mouse, so it needs to be visible and easy to tap.

Work involved:

- Add a `gecko_android` entry next to `gecko` in `browser_specific_settings` in `extension/package.json`.
- Tick "Android" when uploading to addons.mozilla.org.
- Fix the popup layout and the Kollect button for touch.

## Option 2: Safari on iPhone

iPhones run extensions in Safari, but it needs a Mac with Xcode, a paid Apple developer account ($99 a year), and an App Store listing. Most of the code carries over, but the setup is a lot of work. Best done after Firefox for Android works.

Orion, a browser on iPhone, can load Chrome and Firefox extensions, but its support is partial.

## Option 3: no extension

- A "share to Kollect" button: tap Share on a reading page and pick Kollect to save the address. Works in any browser, but can't watch you scroll, so no automatic tracking or progress bar.
- A bookmarklet (a bookmark that runs code on the page). Clumsy on phones, and some sites block it.
- The library page on the web app (already in "For the future" in `CLAUDE.md`). Shows your library on a phone but doesn't track reading.

Kiwi Browser used to run Chrome extensions on Android but shut down in early 2025. Edge on Android has limited extension support so far.

## Option 4: a Kollect Android app

An app with a library screen (like the popup) and a reader screen. The reader screen has a WebView, which is a browser window built into the app. You read manga sites inside it, and the app runs its own JavaScript in each page to track the chapter and how far you've scrolled, the same way the extension's reading-page script does. The app then talks to Convex like the background worker does now.

### How to build it

- **Expo** (React Native): phone apps in React and TypeScript, like the extension. Convex and Clerk both have libraries for it. It can build an iPhone version later from mostly the same code. This is the pick.
- Kotlin (Android's own language) means learning a new language and reusing almost nothing.

The code that works out which manga and chapter a page is can be reused. It needs a small change to send messages to the app instead of to the background worker.

### Problems

- **Google Play may not allow it.** Sites like Asura Scans post translations without the publisher's permission, and Google has removed apps for helping people read on them. Mihon, the best-known manga app, isn't on Google Play for this reason and is shared as an APK file from GitHub. Kollect would probably have to do the same.
- **Some sites block in-app browsers.** Cloudflare's "checking your browser" page can keep failing inside a WebView.
- **Separate logins.** Being logged in to a site in Chrome doesn't carry over to the app.
- **Two products.** Every new screen or feature gets built in both the extension and the app.

### Built-in ad blocking

The app can block ads itself, like Brave does. Three pieces:

1. **Block ad requests.** A page loads many files besides itself: pictures, scripts, ads. Android's WebView lets the app check every request first (`shouldInterceptRequest` in Kotlin) and hand back an empty answer for ad addresses. The ad lists already exist: EasyList and EasyPrivacy, used by uBlock Origin and Adblock Plus. The app downloads them about once a week. For quick checks against the lists, use adblock-rust (what Brave uses). A simpler start is a plain list of ad websites like `doubleclick.net`.
2. **Hide empty ad boxes.** The lists also say which parts of a page to hide. The app adds styling to each page to hide them.
3. **Stop pop-ups and redirects.** Turn off new windows. Before the WebView goes to a new address, check it, and cancel jumps to other websites that you didn't tap a link for.

Expo's ready-made WebView handles pieces 2 and 3, but not piece 1. Piece 1 needs a small Kotlin add-on, written as an Expo module (about one file).

What it won't catch:

- Ads served from the site's own address. The hiding rules cover some of these.
- "Please turn off your ad blocker" walls. The lists have fixes for many, not all.
- New ad addresses, so the lists must refresh on their own.

Order to build it in: piece 3 first (easy, removes the worst of it), then piece 1 with a plain list of ad websites, then adblock-rust and full EasyList only if too many ads get through.

## Firefox for Android compared with the app

| | Your own app | Firefox for Android |
|---|---|---|
| Work to build | Large: a whole new app | Small to medium: layout fixes |
| Ad blocking | Has to be built | Yes, from other extensions |
| Cloudflare checks | Can fail | Work |
| Getting it to users | APK file, maybe not Google Play | addons.mozilla.org |
| Feels like a real app | Yes | No, it's inside Firefox |
| iPhone later | Yes, with Expo | No |

## Suggested order

1. Firefox for Android.
2. The library page on the web app, so the library can be checked from any phone.
3. The Expo app, if still wanted, once the backend is settled.
4. Safari, after that.

## Open questions

Product decisions to settle before building:

- On phones, is the Kollect button always fully visible, or faded until tapped?
- Do the library screens get a separate phone layout, or stretch to fill the screen?
- Is sharing the app as an APK file instead of on Google Play fine?
- Does the app only track reading inside the app, or also offer "share to Kollect" for reading in a normal browser?
- Android only, or Android and iPhone from the start?
- Is ad blocking always on, or a switch in Settings? Suggested: a switch that starts on.
- Should Kollect block ads at all? Ads are how these sites pay for their servers.
