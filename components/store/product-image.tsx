"use client"

import { useState } from "react"

const DEFAULT_IMG = "/placeholder.svg"

interface ProductImageProps {
  src: string | null | undefined
  alt: string
  imgClassName?: string
  fallbackClassName?: string
}

export function ProductImage({ src, alt, imgClassName, fallbackClassName }: ProductImageProps) {
  const [errored, setErrored] = useState(false)
  const effectiveSrc = (!src || errored) ? DEFAULT_IMG : src

  return (
    <img
      src={effectiveSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => { if (!errored) setErrored(true) }}
      className={errored || !src ? (fallbackClassName ?? imgClassName) : imgClassName}
    />
  )
}
