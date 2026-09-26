import { useConvex, useMutation, useQuery } from "convex/react"
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType
} from "convex/server"
import { createContext, useContext, type ReactNode } from "react"

/* Screens read and write data through these helpers instead of calling
   Convex directly. In the real popup they are Convex's own hooks. The
   preview page (tabs/preview.tsx) swaps in sample data instead, so the
   design can be checked without signing in or a live database. */

type AnyQuery = FunctionReference<"query">
type AnyMutation = FunctionReference<"mutation">

export type DataSource = {
  query: (ref: AnyQuery, args: unknown) => unknown
  mutate: (ref: AnyMutation, args: unknown) => Promise<unknown>
}

const SampleData = createContext<DataSource | null>(null)

export function SampleDataProvider({
  source,
  children
}: {
  source: DataSource
  children: ReactNode
}) {
  return <SampleData.Provider value={source}>{children}</SampleData.Provider>
}

/** A live query. `undefined` while loading; pass "skip" to not run it. */
export function useQ<Q extends AnyQuery>(
  ref: Q,
  args: FunctionArgs<Q> | "skip"
): FunctionReturnType<Q> | undefined {
  const sample = useContext(SampleData)
  if (sample) {
    return args === "skip" ? undefined : (sample.query(ref, args) as FunctionReturnType<Q>)
  }
  // The provider never changes while the app runs, so this branch is
  // taken consistently and hooks keep their order.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useQuery(ref, args as never) as FunctionReturnType<Q> | undefined
}

/** A mutation, returned as a function to call. */
export function useM<M extends AnyMutation>(
  ref: M
): (args: FunctionArgs<M>) => Promise<FunctionReturnType<M>> {
  const sample = useContext(SampleData)
  if (sample) {
    return (args) => sample.mutate(ref, args) as Promise<FunctionReturnType<M>>
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useMutation(ref) as never
}

/** Runs a query once, for things like Export that aren't live views. */
export function useOnce(): <Q extends AnyQuery>(
  ref: Q,
  args: FunctionArgs<Q>
) => Promise<FunctionReturnType<Q>> {
  const sample = useContext(SampleData)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const convex = sample ? null : useConvex()
  return async (ref, args) =>
    sample
      ? (sample.query(ref, args) as FunctionReturnType<typeof ref>)
      : convex!.query(ref, args)
}
