"use client"

export function FloatingPriceTags() {
  const tags = [
    { price: "$6.99", top: "10%", left: "15%", delay: "0s", rotate: "-6deg" },
    { price: "$8.49", top: "20%", right: "20%", delay: "0.4s", rotate: "4deg" },
    { price: "$12.99", bottom: "25%", left: "10%", delay: "0.8s", rotate: "-3deg" },
    { price: "$12.99", bottom: "15%", right: "15%", delay: "1.2s", rotate: "7deg" },
    { price: "RAMEN", top: "50%", right: "10%", delay: "0.6s", rotate: "-2deg" },
  ]

  return (
    <div className="relative w-full max-w-[300px] h-[280px]">
      {tags.map((tag, i) => (
        <div
          key={i}
          className="absolute landing-float-tag rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1.5 text-sm font-light text-[#D4AF37]"
          style={{
            top: tag.top,
            left: tag.left,
            right: tag.right,
            bottom: tag.bottom,
            animationDelay: tag.delay,
            transform: `rotate(${tag.rotate})`,
          }}
        >
          {tag.price}
        </div>
      ))}
    </div>
  )
}
