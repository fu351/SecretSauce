"use client"

import * as React from "react"
import useEmblaCarousel, { type UseEmblaCarouselType } from "embla-carousel-react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/* -------------------------------- Types -------------------------------- */

type CarouselApi = UseEmblaCarouselType[1]
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>
type CarouselOptions = UseCarouselParameters[0]
type CarouselPlugin = UseCarouselParameters[1]

export type CarouselContextProps = {
  emblaApi: CarouselApi | null
  carouselRef: React.RefObject<HTMLDivElement | null>
  canScrollPrev: boolean
  canScrollNext: boolean
  scrollPrev: () => void
  scrollNext: () => void
  scrollToIndex: (index: number) => void
}

const CarouselContext = React.createContext<CarouselContextProps | null>(null)

export function useCarousel() {
  const context = React.useContext(CarouselContext)
  if (!context) {
    throw new Error("useCarousel must be used within a <Carousel />")
  }
  return context
}

/* ------------------------------ Carousel ------------------------------ */

interface CarouselProps extends React.HTMLAttributes<HTMLDivElement> {
  opts?: CarouselOptions
  plugins?: CarouselPlugin
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
      plugins,
      className,
      children,
      onReachEnd,
      onReachStart,
      renderLayout,
      ...props
    },
    ref
  ) => {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const [emblaRef, emblaApi] = useEmblaCarousel(
      {
        ...opts,
        axis: orientation === "horizontal" ? "x" : "y",
      },
      plugins
    )

    const [canScrollPrev, setCanScrollPrev] = React.useState(false)
    const [canScrollNext, setCanScrollNext] = React.useState(false)

    const handleSelect = React.useCallback(
      (api: CarouselApi) => {
        if (!api) return

        setCanScrollPrev(api.canScrollPrev())
        setCanScrollNext(api.canScrollNext())

        // Trigger loading when hitting boundaries
        if (!api.canScrollNext() && onReachEnd) onReachEnd()
        if (!api.canScrollPrev() && onReachStart) onReachStart()
      },
      [onReachEnd, onReachStart]
    )

    const scrollPrev = React.useCallback(() => emblaApi?.scrollPrev(), [emblaApi])
    const scrollNext = React.useCallback(() => emblaApi?.scrollNext(), [emblaApi])
    const scrollToIndex = React.useCallback((index: number) => emblaApi?.scrollTo(index), [emblaApi])

    React.useEffect(() => {
      if (!emblaApi) return
      handleSelect(emblaApi)
      emblaApi.on("select", handleSelect)
      emblaApi.on("reInit", handleSelect)
    }, [emblaApi, handleSelect])

    /* Keyboard Nav scoped to the container to prevent global conflicts */
    const onKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        scrollPrev()
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        scrollNext()
      }
    }, [scrollPrev, scrollNext])

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
          emblaApi: emblaApi || null,
          carouselRef: containerRef,
          canScrollPrev,
          canScrollNext,
          scrollPrev,
          scrollNext,
          scrollToIndex,
        }}
      >
        <div
          ref={ref}
          onKeyDown={onKeyDown}
          className={cn("relative w-full", className)}
          role="region"
          aria-label="Meal Planner Carousel"
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
    // We define --gap here (defaulting to 12px/gap-3) 
    // This allows the items to calculate their widths precisely.
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
          // (Total Width / Items) - (Total Gap Space / Items)
          flex: `0 0 calc(${100 / itemsPerView}% - (var(--gap) * ${itemsPerView - 1} / ${itemsPerView}))`,
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
  const { scrollPrev, canScrollPrev } = useCarousel()
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
      <span className="sr-only">Previous day</span>
    </Button>
  )
})
CarouselPrevious.displayName = "CarouselPrevious"

const CarouselNext = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button>
>(({ className, ...props }, ref) => {
  const { scrollNext, canScrollNext } = useCarousel()
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
      <span className="sr-only">Next day</span>
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
}