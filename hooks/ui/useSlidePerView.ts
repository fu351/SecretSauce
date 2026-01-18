"use client"

import { useEffect, useState } from "react"

export function useSlidesPerView(ref: React.RefObject<HTMLElement>) {
  const [slides, setSlides] = useState(1)

  useEffect(() => {
    if (!ref.current) return

    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width

      if (width < 640) setSlides(1)
      else if (width < 1024) setSlides(2)
      else if (width < 1280) setSlides(3)
      else setSlides(4)
    })

    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return slides
}
