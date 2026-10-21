import { Show, SignIn, SignUp, UserButton } from '@clerk/react'

// The extension's Sign Up button opens /sign-up; everything else shows
// the sign-in form. Each form links to the other.
const wantsSignUp = window.location.pathname.startsWith('/sign-up')

function App() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <Show when="signed-out">
        {wantsSignUp ? (
          <SignUp routing="hash" signInUrl="/sign-in" />
        ) : (
          <SignIn routing="hash" signUpUrl="/sign-up" />
        )}
      </Show>
      <Show when="signed-in">
        <div style={{ textAlign: 'center' }}>
          <h1>You're signed in to Kollect</h1>
          <p>You can close this tab and open the extension.</p>
          <UserButton />
        </div>
      </Show>
    </main>
  )
}

export default App
