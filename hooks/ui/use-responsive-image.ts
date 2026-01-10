import { useMemo } from "react"

interface ImageScalingConfig {
  mobile: {
    width: number
    height: number
  }
  tablet: {
    width: number
    height: number
  }
  desktop: {
    width: number
    height: number
  }
}

interface ResponsiveImageResult {
  sizes: string
  className: string
  mobileWidth: number
  mobileHeight: number
}

/**
 * Hook for consistent responsive image scaling
 * Manages width/height for mobile, tablet, and desktop breakpoints
 */
export function useResponsiveImage(config: ImageScalingConfig): ResponsiveImageResult {
  return useMemo(() => {
    const sizes = `(max-width: 640px) ${config.mobile.width}px, (max-width: 1024px) ${config.tablet.width}px, ${config.desktop.width}px`

    return {
      sizes,
      className: `w-full sm:w-auto md:w-auto`,
      mobileWidth: config.mobile.width,
      mobileHeight: config.mobile.height,
    }
  }, [config])
}
