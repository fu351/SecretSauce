"use client"

export function FloatingPriceTags() {
  const tags = [
    { text: "$6.99", top: "5%",  left: "5%",  delay: "0s",   rotate: "-5deg" },
    { text: "$8.49", top: "15%", right: "8%", delay: "0.5s", rotate: "4deg" },
    { text: "$6.99", top: "45%", left: "0%",  delay: "0.3s", rotate: "-2deg" },
    { text: "RAMEN", top: "35%", right: "5%", delay: "0.7s", rotate: "3deg" },
    { text: "$12.99", bottom: "18%", left: "8%", delay: "1s", rotate: "-4deg" },
    { text: "$12.99", bottom: "8%", right: "3%", delay: "1.3s", rotate: "6deg" },
  ]

  return (
    <div className="relative w-full max-w-[320px] h-[320px]">
      {tags.map((tag, i) => (
        <div
          key={i}
          className="absolute landing-float-tag rounded-lg border border-[#D4AF37]/25 bg-[#D4AF37]/[0.06] px-3.5 py-2 text-sm font-light text-[#D4AF37]/80 backdrop-blur-sm shadow-[0_0_12px_rgba(212,175,55,0.08)]"
          style={{
            top: tag.top,
            left: tag.left,
            right: tag.right,
            bottom: tag.bottom,
            animationDelay: tag.delay,
            ["--tag-rotate" as string]: tag.rotate,
          }}
        >
          {tag.text}
        </div>
      ))}
      {/* Subtle background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full bg-[#D4AF37]/[0.04] blur-3xl" />
    </div>
  )
}
