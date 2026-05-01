"use client"

/**
 * Wireframe-style glowing illustration panels for each landing-page section.
 * All rendered in golden outline/glow on dark background to match the
 * premium Secret Sauce aesthetic.
 */

function IllustrationWrapper({
  children,
  caption,
}: {
  children: React.ReactNode
  caption: string
}) {
  return (
    <div className="relative w-full max-w-[340px]">
      <div className="relative rounded-2xl border border-[#D4AF37]/15 bg-[#D4AF37]/[0.03] p-5 md:p-6 overflow-hidden">
        {/* Corner glow */}
        <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-[#D4AF37]/[0.06] blur-2xl" />
        {children}
      </div>
      <p className="text-center text-[11px] text-[#D4AF37]/40 mt-4 font-light tracking-widest uppercase">
        {caption}
      </p>
    </div>
  )
}

/* ──────────── Section 1: Decision Fatigue ──────────── */
export function DecisionFatigueIllustration() {
  return (
    <IllustrationWrapper caption="Decision fatigue starts here.">
      <svg viewBox="0 0 260 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
        <defs>
          <filter id="df-glow"><feGaussianBlur stdDeviation="2" /></filter>
        </defs>
        {/* Laptop body */}
        <rect x="30" y="15" width="200" height="125" rx="8" stroke="#D4AF37" strokeWidth="1" opacity="0.5" />
        <rect x="30" y="15" width="200" height="125" rx="8" stroke="#D4AF37" strokeWidth="3" opacity="0.08" filter="url(#df-glow)" />
        {/* Screen content - class schedule */}
        <rect x="42" y="28" width="90" height="8" rx="2" fill="#D4AF37" opacity="0.25" />
        <rect x="42" y="42" width="65" height="5" rx="1.5" fill="#D4AF37" opacity="0.15" />
        <rect x="42" y="52" width="75" height="5" rx="1.5" fill="#D4AF37" opacity="0.12" />
        <rect x="42" y="62" width="55" height="5" rx="1.5" fill="#D4AF37" opacity="0.12" />
        {/* Calendar grid */}
        <rect x="42" y="78" width="176" height="48" rx="4" stroke="#D4AF37" strokeWidth="0.5" opacity="0.25" />
        {[0, 1, 2, 3, 4].map((col) => (
          <rect key={col} x={48 + col * 34} y={84} width="28" height="10" rx="2" fill="#D4AF37" opacity="0.06" />
        ))}
        {[0, 1, 2, 3, 4].map((col) => (
          <rect key={`r2-${col}`} x={48 + col * 34} y={100} width="28" height="10" rx="2" fill="#D4AF37" opacity="0.04" />
        ))}
        <text x="115" y="118" fill="#D4AF37" opacity="0.2" fontSize="7" fontFamily="serif" textAnchor="middle">
          Class schedule
        </text>
        {/* Laptop base */}
        <rect x="60" y="142" width="140" height="6" rx="3" fill="#D4AF37" opacity="0.15" />
        {/* Phone next to laptop */}
        <rect x="180" y="70" width="42" height="68" rx="6" stroke="#D4AF37" strokeWidth="0.7" opacity="0.3" />
        <rect x="185" y="78" width="32" height="18" rx="2" fill="#D4AF37" opacity="0.05" />
        <rect x="185" y="100" width="24" height="3" rx="1" fill="#D4AF37" opacity="0.12" />
        <rect x="185" y="107" width="20" height="3" rx="1" fill="#D4AF37" opacity="0.08" />
      </svg>
    </IllustrationWrapper>
  )
}

/* ──────────── Section 2: Recipe Friction ──────────── */
export function RecipeFrictionIllustration() {
  return (
    <IllustrationWrapper caption="Discovery without execution.">
      <svg viewBox="0 0 260 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
        {/* Tablet / phone with recipe */}
        <rect x="55" y="8" width="150" height="165" rx="14" stroke="#D4AF37" strokeWidth="1" opacity="0.45" />
        {/* Recipe image placeholder */}
        <rect x="68" y="22" width="124" height="60" rx="6" fill="#D4AF37" opacity="0.2" stroke="#D4AF37" strokeWidth="0.5" />
        {/* Food icon in image */}
        <circle cx="130" cy="52" r="12" stroke="#D4AF37" strokeWidth="0.5" opacity="0.2" />
        <path d="M124,52 L130,46 L136,52 L130,58 Z" fill="#D4AF37" opacity="0.1" />
        {/* Recipe title */}
        <rect x="68" y="92" width="80" height="7" rx="2" fill="#D4AF37" opacity="0.25" />
        {/* Ingredient lines with X marks */}
        {[0, 1, 2, 3].map((row) => (
          <g key={row}>
            <rect x="68" y={108 + row * 14} width={60 + (row % 2) * 15} height="4" rx="1" fill="#D4AF37" opacity="0.12" />
            {/* X mark for missing items */}
            <g opacity="0.5">
              <line x1="172" y1={106 + row * 14} x2="180" y2={114 + row * 14} stroke="#D4AF37" strokeWidth="1.2" />
              <line x1="180" y1={106 + row * 14} x2="172" y2={114 + row * 14} stroke="#D4AF37" strokeWidth="1.2" />
            </g>
          </g>
        ))}
      </svg>
    </IllustrationWrapper>
  )
}

/* ──────────── Section 4: Pantry Disconnect ──────────── */
export function PantryDisconnectIllustration() {
  return (
    <IllustrationWrapper caption="Waste becomes normal.">
      <svg viewBox="0 0 260 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
        {/* Fridge outline */}
        <rect x="50" y="8" width="160" height="164" rx="8" stroke="#D4AF37" strokeWidth="1" opacity="0.4" />
        <line x1="50" y1="80" x2="210" y2="80" stroke="#D4AF37" strokeWidth="0.5" opacity="0.25" />
        {/* Handle */}
        <line x1="200" y1="30" x2="200" y2="60" stroke="#D4AF37" strokeWidth="1.5" opacity="0.3" strokeLinecap="round" />
        <line x1="200" y1="100" x2="200" y2="130" stroke="#D4AF37" strokeWidth="1.5" opacity="0.3" strokeLinecap="round" />
        {/* Top shelf items - bottles */}
        <rect x="65" y="18" width="18" height="48" rx="4" stroke="#D4AF37" strokeWidth="0.6" opacity="0.3" />
        <rect x="90" y="24" width="14" height="42" rx="4" stroke="#D4AF37" strokeWidth="0.6" opacity="0.25" />
        <rect x="112" y="20" width="22" height="46" rx="4" stroke="#D4AF37" strokeWidth="0.6" opacity="0.3" />
        <rect x="142" y="26" width="16" height="40" rx="4" stroke="#D4AF37" strokeWidth="0.6" opacity="0.25" />
        <rect x="166" y="22" width="20" height="44" rx="4" stroke="#D4AF37" strokeWidth="0.6" opacity="0.2" />
        {/* Expiry labels */}
        <text x="68" y="75" fill="#D4AF37" opacity="0.2" fontSize="7" fontFamily="monospace">Expires</text>
        <text x="138" y="75" fill="#D4AF37" opacity="0.2" fontSize="7" fontFamily="monospace">Expires</text>
        {/* Bottom shelf items */}
        <circle cx="85" cy="120" r="18" stroke="#D4AF37" strokeWidth="0.5" opacity="0.2" />
        <circle cx="130" cy="125" r="14" stroke="#D4AF37" strokeWidth="0.5" opacity="0.18" />
        <circle cx="170" cy="118" r="16" stroke="#D4AF37" strokeWidth="0.5" opacity="0.15" />
        <rect x="70" y="148" width="50" height="4" rx="1" fill="#D4AF37" opacity="0.1" />
        <rect x="140" y="148" width="40" height="4" rx="1" fill="#D4AF37" opacity="0.08" />
      </svg>
    </IllustrationWrapper>
  )
}

/* ──────────── Section 5: Connects Everything ──────────── */
export function ConnectsEverythingIllustration() {
  return (
    <IllustrationWrapper caption="Intelligence replaces guesswork.">
      <svg viewBox="0 0 260 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
        <defs>
          <filter id="ce-glow"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        {/* Central hub */}
        <circle cx="130" cy="100" r="30" stroke="#D4AF37" strokeWidth="1.5" opacity="0.6" />
        <circle cx="130" cy="100" r="30" stroke="#D4AF37" strokeWidth="4" opacity="0.1" filter="url(#ce-glow)" />
        <text x="115" y="96" fill="#D4AF37" opacity="0.6" fontSize="9" fontFamily="serif">Secret</text>
        <text x="118" y="108" fill="#D4AF37" opacity="0.6" fontSize="9" fontFamily="serif">Sauce</text>
        {/* Outer nodes */}
        {[
          { cx: 40, cy: 40, label: "Taste" },
          { cx: 220, cy: 40, label: "Budget" },
          { cx: 40, cy: 160, label: "Pantry" },
          { cx: 220, cy: 160, label: "Goals" },
          { cx: 130, cy: 16, label: "Health" },
        ].map((node, i) => (
          <g key={i}>
            {/* Connection line */}
            <line x1="130" y1="100" x2={node.cx} y2={node.cy} stroke="#D4AF37" strokeWidth="0.8" opacity="0.2" strokeDasharray="4 3" />
            {/* Node */}
            <circle cx={node.cx} cy={node.cy} r="16" stroke="#D4AF37" strokeWidth="0.8" opacity="0.35" />
            <circle cx={node.cx} cy={node.cy} r="3" fill="#D4AF37" opacity="0.4" />
            <text x={node.cx} y={node.cy + 28} fill="#D4AF37" opacity="0.3" fontSize="8" textAnchor="middle">{node.label}</text>
          </g>
        ))}
        {/* Glow dots on connections */}
        <circle cx="85" cy="70" r="2" fill="#D4AF37" opacity="0.5" />
        <circle cx="175" cy="70" r="2" fill="#D4AF37" opacity="0.5" />
        <circle cx="85" cy="130" r="2" fill="#D4AF37" opacity="0.5" />
        <circle cx="175" cy="130" r="2" fill="#D4AF37" opacity="0.5" />
      </svg>
    </IllustrationWrapper>
  )
}

/* ──────────── Section 6: Meal Plan ──────────── */
export function MealPlanIllustration() {
  return (
    <IllustrationWrapper caption="Planning without effort.">
      <svg viewBox="0 0 260 170" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
        {/* Calendar header */}
        <rect x="15" y="8" width="230" height="155" rx="8" stroke="#D4AF37" strokeWidth="0.8" opacity="0.3" />
        <line x1="15" y1="32" x2="245" y2="32" stroke="#D4AF37" strokeWidth="0.5" opacity="0.2" />
        {/* Day headers */}
        {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
          <text key={i} x={35 + i * 32} y={24} fill="#D4AF37" opacity="0.3" fontSize="8" textAnchor="middle" fontFamily="sans-serif">
            {day}
          </text>
        ))}
        {/* Calendar cells - 3 rows x 7 cols */}
        {[0, 1, 2].map((row) =>
          [0, 1, 2, 3, 4, 5, 6].map((col) => {
            const filled = (row === 0 && col < 5) || (row === 1 && col < 6) || (row === 2 && col < 3)
            return (
              <rect
                key={`${row}-${col}`}
                x={19 + col * 32}
                y={38 + row * 40}
                width="28"
                height="34"
                rx="4"
                stroke="#D4AF37"
                strokeWidth="0.5"
                opacity={filled ? 0.35 : 0.1}
                fill={filled ? "rgba(212,175,55,0.04)" : "none"}
              />
            )
          })
        )}
        {/* Connecting dots showing meal flow */}
        <circle cx="33" cy="55" r="3" fill="#D4AF37" opacity="0.5" />
        <circle cx="65" cy="95" r="3" fill="#D4AF37" opacity="0.5" />
        <circle cx="97" cy="55" r="3" fill="#D4AF37" opacity="0.5" />
        <circle cx="129" cy="95" r="3" fill="#D4AF37" opacity="0.5" />
        <line x1="33" y1="55" x2="65" y2="95" stroke="#D4AF37" strokeWidth="0.6" opacity="0.2" strokeDasharray="3 2" />
        <line x1="65" y1="95" x2="97" y2="55" stroke="#D4AF37" strokeWidth="0.6" opacity="0.2" strokeDasharray="3 2" />
        <line x1="97" y1="55" x2="129" y2="95" stroke="#D4AF37" strokeWidth="0.6" opacity="0.2" strokeDasharray="3 2" />
      </svg>
    </IllustrationWrapper>
  )
}

/* ──────────── Section 7: Cost Optimization ──────────── */
export function CostOptimizationIllustration() {
  return (
    <IllustrationWrapper caption="Control replaces uncertainty.">
      <svg viewBox="0 0 260 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
        {/* Shopping list card */}
        <rect x="30" y="8" width="200" height="164" rx="8" stroke="#D4AF37" strokeWidth="0.8" opacity="0.3" />
        {/* List rows */}
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <g key={row}>
            {/* Checkbox */}
            <rect
              x="46"
              y={26 + row * 24}
              width="12"
              height="12"
              rx="2.5"
              stroke="#D4AF37"
              strokeWidth="0.7"
              opacity="0.35"
              fill={row < 4 ? "rgba(212,175,55,0.1)" : "none"}
            />
            {row < 4 && (
              <polyline
                points={`49,${32 + row * 24} 51,${35 + row * 24} 56,${28 + row * 24}`}
                stroke="#D4AF37"
                strokeWidth="1.2"
                opacity="0.6"
                fill="none"
              />
            )}
            {/* Item text */}
            <rect
              x="66"
              y={29 + row * 24}
              width={55 + (row % 3) * 12}
              height="5"
              rx="1.5"
              fill="#D4AF37"
              opacity="0.12"
            />
            {/* Price */}
            <text
              x="210"
              y={36 + row * 24}
              fill="#D4AF37"
              opacity="0.35"
              fontSize="9"
              fontFamily="monospace"
              textAnchor="end"
            >
              {["$2.49", "$1.99", "$3.49", "$0.89", "$4.29", "$1.79"][row]}
            </text>
          </g>
        ))}
        {/* Total line */}
        <line x1="46" y1="173" x2="214" y2="173" stroke="#D4AF37" strokeWidth="0.5" opacity="0.2" strokeDasharray="3 2" />
      </svg>
    </IllustrationWrapper>
  )
}

/* ──────────── Section 8: Effortless ──────────── */
export function EffortlessIllustration() {
  return (
    <IllustrationWrapper caption="The system works for you.">
      <svg viewBox="0 0 260 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
        <defs>
          <filter id="eff-glow"><feGaussianBlur stdDeviation="4" /></filter>
        </defs>
        {/* Overlapping circles - Venn of simplicity */}
        <circle cx="105" cy="95" r="50" stroke="#D4AF37" strokeWidth="0.8" opacity="0.22" />
        <circle cx="155" cy="95" r="50" stroke="#D4AF37" strokeWidth="0.8" opacity="0.22" />
        <circle cx="130" cy="60" r="50" stroke="#D4AF37" strokeWidth="0.8" opacity="0.22" />
        {/* Center glow */}
        <circle cx="130" cy="82" r="18" fill="#D4AF37" opacity="0.06" filter="url(#eff-glow)" />
        <circle cx="130" cy="82" r="8" fill="#D4AF37" opacity="0.12" />
        <circle cx="130" cy="82" r="3" fill="#F5E6A3" opacity="0.6" />
        {/* Labels */}
        <text x="70" y="120" fill="#D4AF37" opacity="0.25" fontSize="8">Spend less</text>
        <text x="160" y="120" fill="#D4AF37" opacity="0.25" fontSize="8">Waste less</text>
        <text x="112" y="28" fill="#D4AF37" opacity="0.25" fontSize="8">Think less</text>
        {/* Orbiting dots */}
        <circle cx="130" cy="160" r="2" fill="#D4AF37" opacity="0.3" />
        <circle cx="60" cy="80" r="1.5" fill="#D4AF37" opacity="0.25" />
        <circle cx="200" cy="80" r="1.5" fill="#D4AF37" opacity="0.25" />
      </svg>
    </IllustrationWrapper>
  )
}
