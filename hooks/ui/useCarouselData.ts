"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type CarouselFetchResult<T> = {
  items: T[]
  hasMore: boolean
}

type FetchFn<T> = (cursor: string | null) => Promise<CarouselFetchResult<T>>

export function useCarouselData<T>(fetchFn: FetchFn<T>) {
  const [items, setItems] = useState<T[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const loadingRef = useRef(false)

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingRef.current) return
    loadingRef.current = true

    const res = await fetchFn(cursor)

    setItems(prev => [...prev, ...res.items])
    setHasMore(res.hasMore)
    setCursor(res.items.at(-1)?.id ?? cursor)

    loadingRef.current = false
  }, [cursor, fetchFn, hasMore])

  useEffect(() => {
    loadMore()
  }, [])

  return { items, loadMore, hasMore }
}
