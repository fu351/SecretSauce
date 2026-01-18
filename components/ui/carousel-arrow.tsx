"use client"

import React, { useContext } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCarousel } from "./carousel"

interface CarouselArrowProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  direction: "prev" | "next"
}

/**
 * This arrow works anywhere inside the <Carousel /> component.
 * Since ByDayView uses 'renderLayout', these arrows are technically
 * children of the Carousel and will find the context automatically.
 */
const CarouselArrow = React.forwardRef<HTMLButtonElement, CarouselArrowProps>(
  ({ direction, className, ...props }, ref) => {
    // Use the hook we created in the main carousel file
    const { scrollPrev, scrollNext, canScrollPrev, canScrollNext } = useCarousel()

    const isPrev = direction === "prev"
    const handleClick = isPrev ? scrollPrev : scrollNext
    const isDisabled = isPrev ? !canScrollPrev : !canScrollNext

    return (
      <button
        ref={ref}
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        className={cn(
          "flex items-center justify-center flex-shrink-0 w-10 self-stretch rounded-lg",
          "bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
          "border border-sidebar-border/50",
          "active:scale-95 transition-transform",
          "disabled:opacity-30 disabled:pointer-events-none",
          className
        )}
        aria-label={isPrev ? "Previous day" : "Next day"}
        {...props}
      >
        {isPrev ? (
          <ChevronLeft className="h-5 w-5" />
        ) : (
          <ChevronRight className="h-5 w-5" />
        )}
      </button>
    )
  }
)

CarouselArrow.displayName = "CarouselArrow"

export { CarouselArrow }