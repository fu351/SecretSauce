"use client"

import Image from "next/image"

interface LandingSectionImageProps {
  src: string
  alt: string
  /** Optional caption below the image */
  caption?: string
  className?: string
}

/**
 * Landing section image: 100% width when stacked (small screens), 50vw when side by side.
 */
export function LandingSectionImage({
  src,
  alt,
  caption,
  className = "",
}: LandingSectionImageProps) {
  return (
    <div className={`relative w-full max-w-full md:w-[50vw] md:max-w-[50vw] ${className}`}>
      <div className="relative overflow-hidden">
        <Image
          src={src}
          alt={alt}
          width={600}
          height={400}
          className="w-full h-auto object-contain object-center"
          sizes="(max-width: 767px) 100vw, 50vw"
        />
        {/* Edge fade: overlay gradient matches page background so image blends at borders */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 85% 85% at 50% 50%, transparent 55%, #010101 100%)",
          }}
        />
      </div>
      {caption && (
        <p className="text-center text-[11px] text-[#D4AF37]/40 mt-4 font-light tracking-widest uppercase">
          {caption}
        </p>
      )}
    </div>
  )
}
