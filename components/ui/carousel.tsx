"use client"

import * as React from "react"
import {
  CarouselContext,
  useCarouselContext,
} from "@/contexts/carousel-context"
import { useCarousel } from "@/hooks/ui/use-carousel"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { EmblaOptionsType } from "embla-carousel-react"

/* ------------------------------ Carousel ------------------------------ */

interface CarouselProps extends React.HTMLAttributes<HTMLDivElement> {
  opts?: EmblaOptionsType
  orientation?: "horizontal" | "vertical"
  onReachEnd?: () => void
  onReachStart?: () => void
  renderLayout?: (content: React.ReactNode) => React.ReactNode
}

const Carousel = React.forwardRef<HTMLDivElement, CarouselProps>(
  (
    {
      orientation = "horizontal",
      opts,
      className,
      children,
      onReachEnd,
      onReachStart,
      renderLayout,
      ...props
    },
    ref
  ) => {
    const {
      emblaRef,
      emblaApi,
      canScrollPrev,
      canScrollNext,
      scrollPrev,
      scrollNext,
      scrollToIndex,
    } = useCarousel({
      ...opts,
      axis: orientation === "horizontal" ? "x" : "y",
    })

    React.useEffect(() => {
      if (!emblaApi) return
      const handleSelect = () => {
        if (!emblaApi.canScrollNext() && onReachEnd) onReachEnd()
        if (!emblaApi.canScrollPrev() && onReachStart) onReachStart()
      }
      handleSelect()
      emblaApi.on("select", handleSelect)
      return () => {
        emblaApi.off("select", handleSelect)
      }
    }, [emblaApi, onReachEnd, onReachStart])

    const onKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault()
          scrollPrev()
        } else if (e.key === "ArrowRight") {
          e.preventDefault()
          scrollNext()
        }
      },
      [scrollPrev, scrollNext]
    )

    const carouselContent = (
      <div
        ref={emblaRef}
        className="overflow-hidden flex-1 min-w-0 touch-pan-y"
      >
        {children}
      </div>
    )

    return (
      <CarouselContext.Provider
        value={{
          api: emblaApi,
          scrollPrev,
          scrollNext,
          scrollTo: scrollToIndex,
          canScrollPrev,
          canScrollNext,
        }}
      >
        <div
          ref={ref}
          onKeyDown={onKeyDown}
          className={cn("relative w-full", className)}
          role="region"
          aria-label="Carousel"
          {...props}
        >
          {renderLayout ? renderLayout(carouselContent) : carouselContent}
        </div>
      </CarouselContext.Provider>
    )
  }
)
Carousel.displayName = "Carousel"

/* ---------------------------- Subcomponents ---------------------------- */

const CarouselContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, style, ...props }, ref) => (
  <div
    ref={ref}
    style={{ "--gap": "12px", ...style } as React.CSSProperties}
    className={cn("flex gap-[var(--gap)]", className)}
    role="list"
    {...props}
  />
))
CarouselContent.displayName = "CarouselContent"

interface CarouselItemProps extends React.HTMLAttributes<HTMLDivElement> {
  itemsPerView?: number
}

const CarouselItem = React.forwardRef<HTMLDivElement, CarouselItemProps>(
  ({ className, style, itemsPerView = 1, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="listitem"
        style={{
          flex: `0 0 calc(${
            100 / itemsPerView
          }% - (var(--gap) * ${itemsPerView - 1} / ${itemsPerView}))`,
          ...style,
        }}
        className={cn("min-w-0 shrink-0 grow-0", className)}
        {...props}
      />
    )
  }
)
CarouselItem.displayName = "CarouselItem"

/* ---------------------------- Navigation ---------------------------- */

const NavButtonBase =
  "h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm border shadow-sm transition-opacity hover:bg-background"

const CarouselPrevious = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button>
>(({ className, ...props }, ref) => {
  const { scrollPrev, canScrollPrev } = useCarouselContext()
  return (
    <Button
      ref={ref}
      variant="outline"
      size="icon"
      className={cn(NavButtonBase, className)}
      disabled={!canScrollPrev}
      onClick={scrollPrev}
      {...props}
    >
      <ChevronLeft className="h-4 w-4" />
      <span className="sr-only">Previous slide</span>
    </Button>
  )
})
CarouselPrevious.displayName = "CarouselPrevious"

const CarouselNext = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button>
>(({ className, ...props }, ref) => {
  const { scrollNext, canScrollNext } = useCarouselContext()
  return (
    <Button
      ref={ref}
      variant="outline"
      size="icon"
      className={cn(NavButtonBase, className)}
      disabled={!canScrollNext}
      onClick={scrollNext}
      {...props}
    >
      <ChevronRight className="h-4 w-4" />
      <span className="sr-only">Next slide</span>
    </Button>
  )
})
CarouselNext.displayName = "CarouselNext"

export {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  useCarouselContext,
}