import "../styles.css"

import { useMemo, useState } from "react"

import { App } from "~components/App"
import { SampleDataProvider } from "~lib/data"
import { createSampleStore, sampleSource } from "~lib/sample"

/**
 * The popup with sample data instead of your account — for checking the
 * design without signing in. Open it from the extension at
 * tabs/preview.html. Changes you make here only last until you reload.
 */
export default function Preview() {
  const [store, setStore] = useState(createSampleStore)
  const source = useMemo(() => sampleSource(store, setStore), [store])
  return (
    <SampleDataProvider source={source}>
      <App account={{ signOut: () => window.alert("Sign out does nothing in the preview.") }} />
    </SampleDataProvider>
  )
}
