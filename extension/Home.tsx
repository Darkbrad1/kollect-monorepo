import { UserButton } from "@clerk/chrome-extension"

export default function Home() {
  return (
    <div>
      You are on the home page
      <UserButton />
    </div>
  )
}
