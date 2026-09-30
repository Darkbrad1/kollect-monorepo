import heroImage from "data-base64:~assets/sign-in-hero.webp"

import { FALLBACK_THEME, themeStyle } from "~lib/theme"

import { Wordmark } from "./Logo"

/**
 * What the popup shows when you're signed out: a picture of the app on
 * the left, and the logo with Sign In and Sign Up on the right. Both
 * buttons open the Kollect website in a new tab; the extension picks up
 * the login from there.
 */
export function SignInScreen({ onSignIn, onSignUp }: { onSignIn: () => void; onSignUp: () => void }) {
  return (
    <div
      style={themeStyle(FALLBACK_THEME)}
      className="flex h-[600px] w-[800px] gap-5 bg-base p-5 font-sans text-fg">
      <div className="w-[400px] shrink-0 overflow-hidden rounded-[20px] bg-brand">
        <img src={heroImage} alt="" className="h-full w-full object-cover object-left-top" />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center">
        <Wordmark size={34} />
        <p className="mt-3 text-[14px] text-fg">Kollect and save your favourite manga's</p>
        <button
          type="button"
          onClick={onSignIn}
          className="mt-10 h-8 w-[220px] rounded-md bg-brand text-sm font-bold text-on-brand transition-opacity hover:opacity-90">
          Sign In
        </button>
        <button
          type="button"
          onClick={onSignUp}
          className="mt-3.5 h-8 w-[220px] rounded-md bg-white text-sm font-bold text-on-brand transition-opacity hover:opacity-90">
          Sign Up
        </button>
      </div>
    </div>
  )
}
