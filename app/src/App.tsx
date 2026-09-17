import { Show, SignIn, UserButton } from '@clerk/react'

function App() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <Show when="signed-out">
        <SignIn routing="hash" />
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