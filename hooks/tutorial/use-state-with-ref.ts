import { useState, useRef, useCallback } from "react"

/**
 * Keeps a state value and a ref in sync so that:
 * - React re-renders are triggered (via state)
 * - Stale-closure effects always read the latest value (via ref)
 *
 * Returns [value, ref, setter].
 */
export function useStateWithRef<T>(
  initial: T
): [T, React.MutableRefObject<T>, (value: T) => void] {
  const [value, setValue] = useState<T>(initial)
  const ref = useRef<T>(initial)

  const setBoth = useCallback((next: T) => {
    ref.current = next
    setValue(next)
  }, [])

  return [value, ref, setBoth]
}
