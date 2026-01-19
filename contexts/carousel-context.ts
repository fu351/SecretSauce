"use client"
import { createContext, useContext } from "react"
import type { EmblaCarouselType } from "embla-carousel-react"

export type CarouselApi = EmblaCarouselType | null

export interface CarouselContextProps {
  api: CarouselApi
  scrollPrev: () => void
  scrollNext: () => void
  scrollTo: (index: number) => void
  canScrollPrev: boolean
  canScrollNext: boolean
}

export const CarouselContext = createContext<CarouselContextProps | null>(null)

export function useCarouselContext() {
  const context = useContext(CarouselContext)
  if (!context) {
    throw new Error(
      "useCarouselContext must be used within a <Carousel /> component"
    )
  }
  return context
}
