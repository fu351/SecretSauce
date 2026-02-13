"use client"

/** 
 * Wireframe-style glowing illustration panels for each section.
 * These are minimalist SVG illustrations with a warm golden glow
 * to match the premium dark aesthetic.
 */

export function DecisionFatigueIllustration() {
  return (
    <div className="relative w-full max-w-[320px]">
      <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-6 backdrop-blur-sm">
        {/* Laptop / screen wireframe */}
        <svg viewBox="0 0 240 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          <rect x="20" y="10" width="200" height="120" rx="8" stroke="#D4AF37" strokeWidth="1" opacity="0.4" />
          <rect x="30" y="20" width="80" height="8" rx="2" fill="#D4AF37" opacity="0.2" />
          <rect x="30" y="35" width="60" height="6" rx="2" fill="#D4AF37" opacity="0.15" />
          <rect x="30" y="48" width="70" height="6" rx="2" fill="#D4AF37" opacity="0.15" />
          <rect x="30" y="65" width="180" height="50" rx="4" stroke="#D4AF37" strokeWidth="0.5" opacity="0.3" />
          <text x="60" y="95" fill="#D4AF37" opacity="0.3" fontSize="10" fontFamily="serif">Class Schedule</text>
          <rect x="70" y="135" width="100" height="6" rx="3" fill="#D4AF37" opacity="0.2" />
        </svg>
        <p className="text-center text-xs text-[#D4AF37]/50 mt-3 font-light tracking-wide">
          Decision fatigue starts here.
        </p>
      </div>
    </div>
  )
}

export function RecipeFrictionIllustration() {
  return (
    <div className="relative w-full max-w-[320px]">
      <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-6 backdrop-blur-sm">
        <svg viewBox="0 0 240 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          {/* Phone with recipe */}
          <rect x="70" y="5" width="100" height="150" rx="12" stroke="#D4AF37" strokeWidth="1" opacity="0.4" />
          <rect x="80" y="20" width="80" height="50" rx="4" fill="#D4AF37" opacity="0.08" />
          <rect x="80" y="78" width="50" height="6" rx="2" fill="#D4AF37" opacity="0.2" />
          <rect x="80" y="90" width="70" height="4" rx="2" fill="#D4AF37" opacity="0.12" />
          <rect x="80" y="100" width="60" height="4" rx="2" fill="#D4AF37" opacity="0.12" />
          <rect x="80" y="110" width="65" height="4" rx="2" fill="#D4AF37" opacity="0.12" />
          {/* X marks for missing ingredients */}
          <line x1="155" y1="88" x2="162" y2="95" stroke="#D4AF37" strokeWidth="1.5" opacity="0.4" />
          <line x1="162" y1="88" x2="155" y2="95" stroke="#D4AF37" strokeWidth="1.5" opacity="0.4" />
          <line x1="155" y1="99" x2="162" y2="106" stroke="#D4AF37" strokeWidth="1.5" opacity="0.4" />
          <line x1="162" y1="99" x2="155" y2="106" stroke="#D4AF37" strokeWidth="1.5" opacity="0.4" />
        </svg>
        <p className="text-center text-xs text-[#D4AF37]/50 mt-3 font-light tracking-wide">
          Discovery without execution.
        </p>
      </div>
    </div>
  )
}

export function PantryDisconnectIllustration() {
  return (
    <div className="relative w-full max-w-[320px]">
      <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-6 backdrop-blur-sm">
        <svg viewBox="0 0 240 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          {/* Fridge / pantry outline */}
          <rect x="60" y="10" width="120" height="140" rx="6" stroke="#D4AF37" strokeWidth="1" opacity="0.4" />
          <line x1="60" y1="70" x2="180" y2="70" stroke="#D4AF37" strokeWidth="0.5" opacity="0.3" />
          {/* Bottles / containers */}
          <rect x="75" y="20" width="15" height="40" rx="3" stroke="#D4AF37" strokeWidth="0.5" opacity="0.3" />
          <rect x="100" y="25" width="12" height="35" rx="3" stroke="#D4AF37" strokeWidth="0.5" opacity="0.3" />
          <rect x="120" y="22" width="18" height="38" rx="3" stroke="#D4AF37" strokeWidth="0.5" opacity="0.3" />
          <rect x="150" y="28" width="14" height="32" rx="3" stroke="#D4AF37" strokeWidth="0.5" opacity="0.3" />
          {/* Expiry labels */}
          <text x="75" y="90" fill="#D4AF37" opacity="0.25" fontSize="8" fontFamily="monospace">Expires</text>
          <text x="130" y="90" fill="#D4AF37" opacity="0.25" fontSize="8" fontFamily="monospace">Expires</text>
          {/* Lower items */}
          <circle cx="90" cy="115" r="15" stroke="#D4AF37" strokeWidth="0.5" opacity="0.2" />
          <circle cx="130" cy="115" r="12" stroke="#D4AF37" strokeWidth="0.5" opacity="0.2" />
          <circle cx="160" cy="120" r="10" stroke="#D4AF37" strokeWidth="0.5" opacity="0.2" />
        </svg>
        <p className="text-center text-xs text-[#D4AF37]/50 mt-3 font-light tracking-wide">
          Waste becomes normal.
        </p>
      </div>
    </div>
  )
}

export function ConnectsEverythingIllustration() {
  return (
    <div className="relative w-full max-w-[320px]">
      <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-6 backdrop-blur-sm">
        <svg viewBox="0 0 240 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          {/* Central node */}
          <circle cx="120" cy="90" r="24" stroke="#D4AF37" strokeWidth="1.5" opacity="0.6" />
          <text x="105" y="86" fill="#D4AF37" opacity="0.5" fontSize="8" fontFamily="serif">Secret</text>
          <text x="108" y="98" fill="#D4AF37" opacity="0.5" fontSize="8" fontFamily="serif">Sauce</text>
          {/* Connected nodes */}
          <circle cx="40" cy="40" r="14" stroke="#D4AF37" strokeWidth="0.8" opacity="0.3" />
          <circle cx="200" cy="40" r="14" stroke="#D4AF37" strokeWidth="0.8" opacity="0.3" />
          <circle cx="40" cy="140" r="14" stroke="#D4AF37" strokeWidth="0.8" opacity="0.3" />
          <circle cx="200" cy="140" r="14" stroke="#D4AF37" strokeWidth="0.8" opacity="0.3" />
          {/* Connection lines */}
          <line x1="100" y1="72" x2="52" y2="48" stroke="#D4AF37" strokeWidth="0.8" opacity="0.25" />
          <line x1="140" y1="72" x2="188" y2="48" stroke="#D4AF37" strokeWidth="0.8" opacity="0.25" />
          <line x1="100" y1="108" x2="52" y2="132" stroke="#D4AF37" strokeWidth="0.8" opacity="0.25" />
          <line x1="140" y1="108" x2="188" y2="132" stroke="#D4AF37" strokeWidth="0.8" opacity="0.25" />
          {/* Labels */}
          <text x="26" y="43" fill="#D4AF37" opacity="0.3" fontSize="7" fontFamily="sans-serif">Taste</text>
          <text x="184" y="43" fill="#D4AF37" opacity="0.3" fontSize="7" fontFamily="sans-serif">Budget</text>
          <text x="24" y="143" fill="#D4AF37" opacity="0.3" fontSize="7" fontFamily="sans-serif">Pantry</text>
          <text x="186" y="143" fill="#D4AF37" opacity="0.3" fontSize="7" fontFamily="sans-serif">Goals</text>
        </svg>
        <p className="text-center text-xs text-[#D4AF37]/50 mt-3 font-light tracking-wide">
          Intelligence replaces guesswork.
        </p>
      </div>
    </div>
  )
}

export function MealPlanIllustration() {
  return (
    <div className="relative w-full max-w-[320px]">
      <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-6 backdrop-blur-sm">
        <svg viewBox="0 0 240 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          {/* Calendar grid */}
          {[0, 1, 2, 3, 4, 5, 6].map((col) => (
            <g key={col}>
              <rect
                x={18 + col * 30}
                y="20"
                width="26"
                height="16"
                rx="2"
                fill="#D4AF37"
                opacity="0.08"
              />
              <rect
                x={18 + col * 30}
                y="42"
                width="26"
                height="30"
                rx="3"
                stroke="#D4AF37"
                strokeWidth="0.5"
                opacity={col < 5 ? 0.4 : 0.15}
                fill={col < 5 ? "rgba(212,175,55,0.05)" : "none"}
              />
              <rect
                x={18 + col * 30}
                y="78"
                width="26"
                height="30"
                rx="3"
                stroke="#D4AF37"
                strokeWidth="0.5"
                opacity={col < 5 ? 0.4 : 0.15}
                fill={col < 5 ? "rgba(212,175,55,0.05)" : "none"}
              />
              <rect
                x={18 + col * 30}
                y="114"
                width="26"
                height="30"
                rx="3"
                stroke="#D4AF37"
                strokeWidth="0.5"
                opacity={col < 3 ? 0.4 : 0.15}
                fill={col < 3 ? "rgba(212,175,55,0.05)" : "none"}
              />
            </g>
          ))}
          {/* Connecting dots */}
          <circle cx="31" cy="57" r="2" fill="#D4AF37" opacity="0.5" />
          <circle cx="61" cy="93" r="2" fill="#D4AF37" opacity="0.5" />
          <circle cx="91" cy="57" r="2" fill="#D4AF37" opacity="0.5" />
          <line x1="31" y1="57" x2="61" y2="93" stroke="#D4AF37" strokeWidth="0.5" opacity="0.2" strokeDasharray="3 2" />
          <line x1="61" y1="93" x2="91" y2="57" stroke="#D4AF37" strokeWidth="0.5" opacity="0.2" strokeDasharray="3 2" />
        </svg>
        <p className="text-center text-xs text-[#D4AF37]/50 mt-3 font-light tracking-wide">
          Planning without effort.
        </p>
      </div>
    </div>
  )
}

export function CostOptimizationIllustration() {
  return (
    <div className="relative w-full max-w-[320px]">
      <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-6 backdrop-blur-sm">
        <svg viewBox="0 0 240 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          {/* Shopping list */}
          <rect x="40" y="10" width="160" height="140" rx="6" stroke="#D4AF37" strokeWidth="0.8" opacity="0.3" />
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <g key={row}>
              <rect
                x="55"
                y={28 + row * 20}
                width="10"
                height="10"
                rx="2"
                stroke="#D4AF37"
                strokeWidth="0.6"
                opacity="0.3"
                fill={row < 4 ? "rgba(212,175,55,0.15)" : "none"}
              />
              {row < 4 && (
                <polyline
                  points={`57,${33 + row * 20} 59,${36 + row * 20} 63,${30 + row * 20}`}
                  stroke="#D4AF37"
                  strokeWidth="1"
                  opacity="0.5"
                  fill="none"
                />
              )}
              <rect
                x="75"
                y={30 + row * 20}
                width={60 + (row % 3) * 10}
                height="5"
                rx="2"
                fill="#D4AF37"
                opacity="0.12"
              />
              <text
                x="165"
                y={37 + row * 20}
                fill="#D4AF37"
                opacity="0.3"
                fontSize="8"
                fontFamily="monospace"
                textAnchor="end"
              >
                {["$2.49", "$1.99", "$3.49", "$0.89", "$4.29", "$1.79"][row]}
              </text>
            </g>
          ))}
        </svg>
        <p className="text-center text-xs text-[#D4AF37]/50 mt-3 font-light tracking-wide">
          Control replaces uncertainty.
        </p>
      </div>
    </div>
  )
}

export function EffortlessIllustration() {
  return (
    <div className="relative w-full max-w-[320px]">
      <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-6 backdrop-blur-sm">
        <svg viewBox="0 0 240 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          {/* Abstract representation of harmony - overlapping circles */}
          <circle cx="100" cy="80" r="40" stroke="#D4AF37" strokeWidth="0.8" opacity="0.2" />
          <circle cx="140" cy="80" r="40" stroke="#D4AF37" strokeWidth="0.8" opacity="0.2" />
          <circle cx="120" cy="50" r="40" stroke="#D4AF37" strokeWidth="0.8" opacity="0.2" />
          {/* Center glow */}
          <circle cx="120" cy="72" r="12" fill="#D4AF37" opacity="0.1" />
          <circle cx="120" cy="72" r="6" fill="#D4AF37" opacity="0.2" />
          <circle cx="120" cy="72" r="2" fill="#D4AF37" opacity="0.6" />
          {/* Label arcs */}
          <text x="62" y="105" fill="#D4AF37" opacity="0.2" fontSize="7">Spend less</text>
          <text x="147" y="105" fill="#D4AF37" opacity="0.2" fontSize="7">Waste less</text>
          <text x="100" y="25" fill="#D4AF37" opacity="0.2" fontSize="7">Think less</text>
          {/* Bottom text */}
          <text x="75" y="160" fill="#D4AF37" opacity="0.25" fontSize="9" fontFamily="serif">
            The system works for you.
          </text>
        </svg>
      </div>
    </div>
  )
}
