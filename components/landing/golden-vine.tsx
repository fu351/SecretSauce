"use client"

import { useEffect, useRef, useCallback } from "react"

/* ──────────────────────────────────────────────────────────────
   Golden Vine — centered, detailed SVG spine with sauce-flow.

   Vine pours from bottle at top, flows down the center with ornate
   branches, tendrils, nodes, and leaves; culminates in a tree at the
   bottom bottle. Luminous core + soft halo; scroll drives the flow.
   ────────────────────────────────────────────────────────────── */

const VW = 240
const VH = 8400

/* ── Leaf shape (pointing upward along local Y-axis) ── */
const LEAF = "M0,-1 C3,-5 4,-12 2,-18 C1,-20 -1,-20 -2,-18 C-4,-12 -3,-5 0,-1Z"
const LEAF_VEIN = "M0,-2 L0,-17"

/* ── Drip from bottle at top (liquid pouring out) ── */
const BOTTLE_DRIP = "M120,-28 C122,-18 118,-8 120,0"

/* ── Main trunk path — organic S-curves, more variation ── */
const TRUNK = [
  "M120,0",
  "C120,60 119,110 117,165",
  "C114,240 118,320 115,400",
  "C110,520 142,600 138,700",
  "C132,820 88,920 94,1060",
  "C100,1200 148,1320 140,1480",
  "C130,1640 78,1780 88,1960",
  "C98,2120 156,2250 146,2420",
  "C136,2580 72,2720 84,2900",
  "C96,3060 158,3190 146,3360",
  "C132,3520 68,3660 82,3840",
  "C96,4000 152,4120 138,4290",
  "C124,4450 68,4580 82,4760",
  "C96,4920 150,5040 136,5210",
  "C122,5370 72,5500 86,5670",
  "C100,5820 140,5920 128,6080",
  "C116,6230 78,6320 90,6460",
  "C100,6580 120,6660 116,6780",
  "C112,6880 124,6960 122,7080",
  "C120,7180 121,7280 120,7380",
  "C120,7480 120,7580 120,7680",
  "C120,7780 120,7880 120,7980",
  "C120,8060 120,8140 120,8200",
].join(" ")

/* ── Parallel secondary strand ── */
const STRAND2 = [
  "M123,60",
  "C126,200 114,300 118,460",
  "C122,600 144,700 138,860",
  "C132,1000 88,1120 94,1280",
  "C100,1420 148,1540 140,1720",
  "C132,1880 84,2000 92,2180",
  "C100,2340 154,2460 144,2640",
  "C134,2800 78,2920 88,3100",
  "C98,3260 152,3380 140,3560",
  "C128,3720 74,3840 86,4020",
  "C98,4180 146,4300 132,4480",
  "C118,4640 72,4760 86,4940",
  "C100,5100 144,5220 130,5400",
  "C116,5560 76,5680 90,5860",
  "C102,6000 134,6100 122,6260",
  "C112,6400 84,6480 96,6620",
  "C104,6740 116,6820 112,6940",
  "C108,7060 118,7180 118,7340",
  "C118,7500 119,7660 119,7820",
].join(" ")

/* ── Branch definition (endPoint = glowing node at branch tip) ── */
interface Branch {
  y: number
  side: 1 | -1
  path: string
  subs?: string[]
  leaves: { x: number; y: number; rot: number; s: number }[]
  tendril?: string
  endPoint: { x: number; y: number }
}

function br(
  y: number, side: 1 | -1, reach: number, lift: number, curve: number,
  leaves: { x: number; y: number; rot: number; s: number }[],
  subs?: string[], tendril?: string
): Branch {
  const s = side
  const mx = s * reach * 0.4, my = -lift * 0.5
  const ex = s * reach, ey = -lift
  const c1x = s * curve * 10, c1y = -lift * 0.2
  const c2x = mx + s * curve * 6, c2y = my - curve * 4
  const path = `M0,0 C${c1x},${c1y} ${c2x},${c2y} ${mx},${my} S${ex + s * curve * 2},${ey + 4} ${ex},${ey}`
  return { y, side, path, leaves, subs, tendril, endPoint: { x: ex, y: ey } }
}

const BRANCHES: Branch[] = [
  br(280, -1, 54, 26, 1.0, [{ x: -32, y: -14, rot: 148, s: 0.75 }, { x: -48, y: -22, rot: 158, s: 0.9 }, { x: -40, y: -18, rot: 152, s: 0.7 }], undefined, "M-32,-14 C-38,-20 -36,-28 -30,-32"),
  br(380, 1, 68, 34, 1.4, [{ x: 24, y: -14, rot: -30, s: 0.85 }, { x: 46, y: -26, rot: -15, s: 1.0 }, { x: 58, y: -32, rot: -8, s: 0.9 }, { x: 32, y: -18, rot: -35, s: 0.75 }], ["M26,-15 C34,-22 42,-18 48,-24", "M50,-28 C58,-34 62,-30 66,-36"], "M48,-26 C54,-30 56,-38 52,-44 C48,-48 42,-44 44,-38"),
  br(500, -1, 62, 28, 1.0, [{ x: -38, y: -18, rot: 155, s: 0.8 }, { x: -52, y: -26, rot: 162, s: 0.95 }, { x: -44, y: -20, rot: 158, s: 0.7 }], undefined, "M-38,-18 C-44,-22 -42,-30 -36,-34"),
  br(600, 1, 58, 28, 1.1, [{ x: 36, y: -18, rot: -28, s: 0.8 }, { x: 22, y: -10, rot: -38, s: 0.6 }, { x: 50, y: -26, rot: -18, s: 0.9 }, { x: 44, y: -22, rot: -24, s: 0.75 }], ["M24,-12 C32,-18 40,-14 44,-20", "M46,-24 C52,-30 56,-26 58,-32"]),
  br(660, -1, 76, 40, 1.6, [{ x: -28, y: -16, rot: 140, s: 0.7 }, { x: -52, y: -32, rot: 160, s: 1.1 }, { x: -64, y: -38, rot: 168, s: 0.95 }, { x: -38, y: -22, rot: 148, s: 0.8 }], ["M-30,-17 C-38,-24 -48,-18 -54,-26", "M-58,-34 C-66,-42 -62,-48 -56,-52"], "M-52,-32 C-58,-38 -56,-48 -48,-50"),
  br(780, 1, 56, 24, 0.8, [{ x: 34, y: -14, rot: -25, s: 0.75 }, { x: 48, y: -24, rot: -12, s: 0.9 }, { x: 40, y: -18, rot: -28, s: 0.7 }]),
  br(900, -1, 64, 32, 1.2, [{ x: -40, y: -22, rot: 150, s: 0.85 }, { x: -56, y: -30, rot: 158, s: 1.0 }, { x: -46, y: -24, rot: 152, s: 0.75 }], ["M-22,-12 C-30,-20 -38,-14 -44,-22", "M-50,-28 C-58,-34 -54,-40 -48,-44"], "M-40,-22 C-46,-28 -44,-36 -38,-40"),
  br(1020, 1, 78, 42, 1.5, [{ x: 30, y: -18, rot: -35, s: 0.8 }, { x: 54, y: -34, rot: -20, s: 1.1 }, { x: 66, y: -40, rot: -10, s: 0.95 }, { x: 42, y: -24, rot: -30, s: 0.85 }], ["M32,-19 C40,-28 50,-22 56,-30", "M58,-34 C66,-40 70,-36 72,-42"], "M54,-34 C60,-40 58,-50 50,-52"),
  br(1100, -1, 52, 24, 0.9, [{ x: -30, y: -14, rot: 152, s: 0.7 }, { x: -44, y: -22, rot: 158, s: 0.85 }, { x: -38, y: -18, rot: 154, s: 0.65 }]),
  br(1160, -1, 64, 32, 1.2, [{ x: -42, y: -24, rot: 148, s: 0.9 }, { x: -22, y: -12, rot: 125, s: 0.6 }, { x: -56, y: -32, rot: 155, s: 1.0 }, { x: -48, y: -26, rot: 150, s: 0.8 }], ["M-24,-13 C-32,-20 -40,-14 -46,-22", "M-52,-30 C-60,-36 -58,-42 -52,-46"]),
  br(1320, -1, 72, 38, 1.4, [{ x: -50, y: -30, rot: 155, s: 1.0 }, { x: -64, y: -36, rot: 162, s: 1.05 }, { x: -56, y: -32, rot: 158, s: 0.85 }], ["M-28,-16 C-36,-24 -46,-18 -52,-26", "M-58,-34 C-66,-42 -64,-48 -58,-52"], "M-50,-30 C-56,-36 -54,-46 -46,-48"),
  br(1400, 1, 60, 28, 1.0, [{ x: 38, y: -18, rot: -32, s: 0.8 }, { x: 52, y: -28, rot: -18, s: 0.95 }, { x: 44, y: -22, rot: -28, s: 0.7 }], undefined, "M38,-18 C44,-24 42,-32 36,-36"),
  br(1460, 1, 54, 22, 0.7, [{ x: 32, y: -14, rot: -30, s: 0.7 }, { x: 44, y: -22, rot: -20, s: 0.85 }, { x: 38, y: -18, rot: -26, s: 0.65 }]),
  br(1580, -1, 66, 34, 1.3, [{ x: -44, y: -26, rot: 152, s: 0.9 }, { x: -58, y: -32, rot: 158, s: 1.0 }, { x: -50, y: -28, rot: 154, s: 0.78 }], ["M-26,-14 C-34,-22 -42,-16 -48,-24", "M-54,-30 C-62,-36 -60,-42 -54,-46"]),
  br(1640, -1, 78, 44, 1.7, [{ x: -30, y: -18, rot: 135, s: 0.7 }, { x: -56, y: -36, rot: 165, s: 1.15 }, { x: -68, y: -42, rot: 170, s: 0.95 }, { x: -42, y: -24, rot: 148, s: 0.82 }], ["M-32,-19 C-42,-28 -52,-22 -60,-30", "M-56,-36 C-64,-44 -60,-54 -50,-56", "M-64,-40 C-72,-48 -68,-54 -60,-58"], "M-60,-30 C-66,-36 -64,-46 -58,-48"),
  br(1800, 1, 62, 30, 1.0, [{ x: 40, y: -22, rot: -28, s: 0.85 }, { x: 54, y: -30, rot: -14, s: 0.95 }, { x: 46, y: -24, rot: -24, s: 0.75 }], undefined, "M40,-22 C46,-28 44,-36 38,-40"),
  br(1940, 1, 70, 36, 1.3, [{ x: 26, y: -14, rot: -40, s: 0.65 }, { x: 48, y: -28, rot: -22, s: 1.0 }, { x: 60, y: -34, rot: -12, s: 0.9 }, { x: 38, y: -20, rot: -34, s: 0.78 }], ["M28,-15 C36,-22 46,-16 52,-24", "M54,-30 C62,-36 60,-42 54,-46"]),
  br(2080, -1, 58, 28, 1.1, [{ x: -36, y: -18, rot: 148, s: 0.78 }, { x: -50, y: -26, rot: 156, s: 0.92 }, { x: -42, y: -22, rot: 151, s: 0.7 }], undefined, "M-36,-18 C-42,-24 -40,-32 -34,-36"),
  br(2240, -1, 74, 40, 1.5, [{ x: -52, y: -32, rot: 158, s: 1.1 }, { x: -28, y: -16, rot: 130, s: 0.7 }, { x: -64, y: -38, rot: 164, s: 1.0 }, { x: -46, y: -26, rot: 152, s: 0.85 }], ["M-30,-17 C-40,-26 -48,-20 -56,-28", "M-60,-34 C-68,-42 -66,-48 -60,-52"], "M-52,-32 C-58,-38 -56,-50 -48,-52"),
  br(2380, 1, 62, 30, 1.0, [{ x: 40, y: -20, rot: -30, s: 0.82 }, { x: 54, y: -28, rot: -16, s: 0.9 }, { x: 44, y: -24, rot: -28, s: 0.72 }], ["M22,-12 C30,-20 38,-14 44,-22", "M48,-26 C54,-32 56,-28 58,-34"]),
  br(2420, 1, 66, 34, 1.2, [{ x: 44, y: -26, rot: -25, s: 0.95 }, { x: 58, y: -32, rot: -10, s: 1.0 }, { x: 50, y: -28, rot: -20, s: 0.82 }], ["M24,-14 C32,-22 42,-16 48,-24", "M52,-30 C60,-36 62,-32 64,-38"]),
  br(2580, 1, 58, 26, 0.9, [{ x: 36, y: -18, rot: -32, s: 0.78 }, { x: 48, y: -26, rot: -18, s: 0.9 }, { x: 42, y: -22, rot: -28, s: 0.7 }], undefined, "M36,-18 C42,-24 40,-32 34,-36"),
  br(2720, -1, 68, 34, 1.3, [{ x: -46, y: -24, rot: 154, s: 0.88 }, { x: -60, y: -32, rot: 160, s: 1.0 }, { x: -52, y: -28, rot: 156, s: 0.8 }], ["M-28,-14 C-36,-22 -44,-16 -50,-24", "M-56,-30 C-64,-36 -62,-42 -56,-46"]),
  br(2920, -1, 72, 38, 1.4, [{ x: -50, y: -30, rot: 152, s: 1.05 }, { x: -26, y: -14, rot: 128, s: 0.6 }, { x: -62, y: -36, rot: 162, s: 0.98 }, { x: -54, y: -32, rot: 156, s: 0.88 }], ["M-28,-15 C-36,-22 -46,-16 -52,-24", "M-58,-34 C-66,-42 -64,-48 -58,-52"], "M-50,-30 C-56,-38 -54,-48 -46,-50"),
  br(3060, 1, 64, 32, 1.1, [{ x: 42, y: -22, rot: -28, s: 0.86 }, { x: 56, y: -30, rot: -14, s: 0.95 }, { x: 48, y: -26, rot: -24, s: 0.76 }]),
  br(3100, 1, 70, 36, 1.3, [{ x: 48, y: -28, rot: -22, s: 1.0 }, { x: 24, y: -12, rot: -45, s: 0.6 }, { x: 60, y: -34, rot: -10, s: 0.92 }, { x: 52, y: -30, rot: -18, s: 0.82 }], ["M26,-13 C34,-20 44,-14 50,-22", "M48,-28 C54,-36 52,-46 44,-48", "M56,-32 C62,-38 64,-34 66,-40"]),
  br(3280, -1, 56, 24, 0.8, [{ x: -34, y: -16, rot: 145, s: 0.75 }, { x: -46, y: -24, rot: 153, s: 0.88 }, { x: -40, y: -20, rot: 148, s: 0.68 }]),
  br(3420, 1, 60, 28, 1.0, [{ x: 38, y: -18, rot: -30, s: 0.8 }, { x: 52, y: -28, rot: -16, s: 0.92 }, { x: 44, y: -22, rot: -26, s: 0.72 }], undefined, "M38,-18 C44,-24 42,-32 36,-36"),
  br(3640, 1, 76, 42, 1.6, [{ x: 54, y: -34, rot: -18, s: 1.12 }, { x: 28, y: -16, rot: -42, s: 0.7 }, { x: 66, y: -40, rot: -8, s: 0.98 }, { x: 58, y: -36, rot: -14, s: 0.88 }], ["M30,-17 C38,-24 50,-18 56,-26", "M60,-34 C68,-40 70,-36 72,-42"], "M54,-34 C60,-40 58,-52 50,-54"),
  br(3820, -1, 66, 34, 1.2, [{ x: -44, y: -26, rot: 150, s: 0.95 }, { x: -58, y: -34, rot: 158, s: 1.02 }, { x: -50, y: -28, rot: 153, s: 0.8 }], ["M-24,-14 C-32,-22 -42,-14 -48,-22", "M-54,-30 C-62,-36 -60,-42 -54,-46"]),
  br(3960, -1, 60, 28, 0.9, [{ x: -38, y: -20, rot: 142, s: 0.8 }, { x: -52, y: -28, rot: 150, s: 0.9 }, { x: -44, y: -24, rot: 145, s: 0.72 }], undefined, "M-38,-20 C-44,-26 -42,-34 -36,-38"),
  br(4120, 1, 62, 30, 1.0, [{ x: 40, y: -20, rot: -29, s: 0.82 }, { x: 54, y: -28, rot: -14, s: 0.9 }, { x: 46, y: -24, rot: -26, s: 0.74 }], ["M22,-12 C30,-18 40,-12 46,-20", "M50,-26 C56,-32 58,-28 60,-34"]),
  br(4340, -1, 70, 36, 1.3, [{ x: -48, y: -28, rot: 156, s: 1.0 }, { x: -24, y: -14, rot: 132, s: 0.6 }, { x: -60, y: -34, rot: 162, s: 0.95 }, { x: -52, y: -30, rot: 158, s: 0.82 }], ["M-26,-15 C-34,-22 -44,-16 -50,-24", "M-56,-32 C-64,-38 -62,-44 -56,-48"]),
  br(4520, 1, 64, 32, 1.1, [{ x: 42, y: -24, rot: -28, s: 0.9 }, { x: 56, y: -30, rot: -14, s: 0.95 }, { x: 48, y: -26, rot: -24, s: 0.8 }], ["M22,-12 C30,-20 40,-14 46,-22", "M50,-28 C56,-34 58,-30 60,-36"], "M42,-24 C48,-30 46,-40 40,-42"),
  br(4680, 1, 54, 22, 0.7, [{ x: 32, y: -14, rot: -34, s: 0.7 }, { x: 44, y: -22, rot: -22, s: 0.85 }, { x: 38, y: -18, rot: -30, s: 0.65 }]),
  br(4840, -1, 64, 32, 1.2, [{ x: -42, y: -22, rot: 151, s: 0.85 }, { x: -56, y: -30, rot: 158, s: 0.98 }, { x: -48, y: -26, rot: 154, s: 0.75 }], undefined, "M-42,-22 C-48,-28 -46,-36 -40,-40"),
  br(5040, -1, 72, 38, 1.4, [{ x: -50, y: -30, rot: 160, s: 1.08 }, { x: -26, y: -16, rot: 136, s: 0.65 }, { x: -62, y: -36, rot: 165, s: 0.98 }, { x: -54, y: -32, rot: 161, s: 0.85 }], ["M-28,-17 C-38,-26 -46,-20 -54,-28", "M-58,-34 C-66,-42 -64,-48 -58,-52"], "M-50,-30 C-56,-38 -54,-48 -46,-50"),
  br(5240, 1, 66, 34, 1.2, [{ x: 44, y: -26, rot: -26, s: 0.95 }, { x: 58, y: -32, rot: -12, s: 1.0 }, { x: 50, y: -28, rot: -22, s: 0.82 }], ["M24,-14 C32,-20 42,-14 48,-22", "M52,-30 C60,-36 62,-32 64,-38"]),
  br(5400, -1, 52, 22, 0.7, [{ x: -30, y: -14, rot: 148, s: 0.7 }, { x: -42, y: -22, rot: 155, s: 0.85 }, { x: -36, y: -18, rot: 151, s: 0.65 }], undefined, "M-30,-14 C-36,-20 -34,-28 -28,-32"),
  br(5540, 1, 56, 26, 0.95, [{ x: 34, y: -16, rot: -31, s: 0.76 }, { x: 46, y: -24, rot: -20, s: 0.88 }, { x: 40, y: -20, rot: -28, s: 0.7 }]),
  br(5720, 1, 58, 28, 1.0, [{ x: 36, y: -20, rot: -30, s: 0.75 }, { x: 50, y: -28, rot: -16, s: 0.9 }, { x: 42, y: -24, rot: -26, s: 0.72 }], undefined, "M36,-20 C40,-26 38,-34 32,-36"),
  br(5900, -1, 54, 24, 0.8, [{ x: -32, y: -16, rot: 146, s: 0.7 }, { x: -44, y: -24, rot: 153, s: 0.86 }, { x: -38, y: -20, rot: 149, s: 0.65 }]),
  br(6080, 1, 48, 20, 0.6, [{ x: 26, y: -12, rot: -34, s: 0.6 }, { x: 38, y: -20, rot: -24, s: 0.8 }, { x: 32, y: -16, rot: -30, s: 0.55 }]),
  br(6240, -1, 44, 18, 0.5, [{ x: -22, y: -10, rot: 150, s: 0.55 }, { x: -34, y: -18, rot: 156, s: 0.72 }, { x: -28, y: -14, rot: 152, s: 0.5 }]),
  br(6400, 1, 38, 16, 0.4, [{ x: 18, y: -8, rot: -36, s: 0.45 }, { x: 28, y: -14, rot: -28, s: 0.65 }, { x: 22, y: -10, rot: -32, s: 0.4 }]),
  br(6560, -1, 28, 12, 0.35, [{ x: -14, y: -6, rot: 152, s: 0.4 }, { x: -22, y: -12, rot: 157, s: 0.55 }, { x: -18, y: -8, rot: 154, s: 0.35 }]),
]

/* ── Standalone curling tendrils (dense, spread horizontally and sporadic y) ── */
const TENDRILS = [
  "M120,180 C126,172 130,162 126,154 C122,146 116,150 118,158",
  "M98,240 C90,232 82,218 88,208 C94,198 102,202 98,212",
  "M120,300 C128,290 132,276 128,268 C124,260 116,262 118,270",
  "M142,360 C150,352 158,338 152,328 C146,318 138,322 140,332",
  "M112,420 C108,412 102,402 106,392 C110,382 116,386 114,394",
  "M85,480 C77,472 68,458 74,448 C80,438 88,442 85,452",
  "M90,560 C82,552 76,538 80,528 C84,518 92,522 90,530",
  "M155,620 C163,612 170,598 164,588 C158,578 150,582 152,592",
  "M90,820 C82,810 76,796 80,786 C84,776 92,778 90,786",
  "M148,680 C156,672 162,658 158,648 C154,638 146,642 148,650",
  "M72,900 C64,892 56,878 62,868 C68,858 76,862 72,872",
  "M92,980 C84,972 78,958 82,948 C86,938 94,942 92,950",
  "M168,1040 C176,1032 184,1018 178,1008 C172,998 164,1002 166,1012",
  "M140,1180 C148,1170 154,1156 150,1146 C146,1136 138,1138 140,1146",
  "M88,1260 C80,1252 72,1238 78,1228 C84,1218 92,1222 88,1232",
  "M100,1340 C92,1332 86,1318 90,1308 C94,1298 102,1302 100,1310",
  "M162,1420 C170,1412 178,1398 172,1388 C166,1378 158,1382 160,1392",
  "M84,1560 C76,1550 70,1536 74,1526 C78,1516 86,1518 84,1526",
  "M152,1700 C160,1692 166,1678 162,1668 C158,1658 150,1662 152,1670",
  "M70,1780 C62,1772 54,1758 60,1748 C66,1738 74,1742 70,1752",
  "M144,2020 C152,2010 158,1996 154,1986 C150,1976 142,1978 144,1986",
  "M78,2180 C70,2172 64,2158 68,2148 C72,2138 80,2142 78,2150",
  "M172,2260 C180,2252 188,2238 182,2228 C176,2218 168,2222 170,2232",
  "M82,2480 C74,2470 68,2456 72,2446 C76,2436 84,2438 82,2446",
  "M156,2620 C164,2612 170,2598 166,2588 C162,2578 154,2582 156,2590",
  "M68,2700 C60,2692 52,2678 58,2668 C64,2658 72,2662 68,2672",
  "M148,2960 C156,2950 162,2936 158,2926 C154,2916 146,2918 148,2926",
  "M76,3120 C68,3112 62,3098 66,3088 C70,3078 78,3082 76,3090",
  "M164,3200 C172,3192 180,3178 174,3168 C168,3158 160,3162 162,3172",
  "M80,3440 C72,3430 66,3416 70,3406 C74,3396 82,3398 80,3406",
  "M158,3580 C166,3572 172,3558 168,3548 C164,3538 156,3542 158,3550",
  "M74,3660 C66,3652 58,3638 64,3628 C70,3618 78,3622 74,3632",
  "M142,3900 C150,3890 156,3876 152,3866 C148,3856 140,3858 142,3866",
  "M74,4060 C66,4052 60,4038 64,4028 C68,4018 76,4022 74,4030",
  "M168,4140 C176,4132 184,4118 178,4108 C172,4098 164,4102 166,4112",
  "M86,4380 C78,4370 72,4356 76,4346 C80,4336 88,4338 86,4346",
  "M154,4520 C162,4512 168,4498 164,4488 C160,4478 152,4482 154,4490",
  "M66,4600 C58,4592 50,4578 56,4568 C62,4558 70,4562 66,4572",
  "M136,4860 C144,4850 150,4836 146,4826 C142,4816 134,4818 136,4826",
  "M88,5020 C80,5012 74,4998 78,4988 C82,4978 90,4982 88,4990",
  "M172,5100 C180,5092 188,5078 182,5068 C176,5058 168,5062 170,5072",
  "M90,5340 C82,5330 76,5316 80,5306 C84,5296 92,5298 90,5306",
  "M130,5780 C136,5772 140,5760 136,5752 C132,5744 126,5748 128,5756",
  "M108,5940 C100,5932 94,5918 98,5908 C102,5898 110,5902 108,5910",
  "M78,6020 C70,6012 62,5998 68,5988 C74,5978 82,5982 78,5992",
  "M96,6160 C90,6152 86,6140 90,6132 C94,6124 98,6128 96,6136",
  "M124,6320 C130,6312 134,6298 130,6288 C126,6278 118,6282 120,6290",
  "M162,6400 C170,6392 178,6378 172,6368 C166,6358 158,6362 160,6372",
  "M114,6500 C118,6494 120,6484 116,6478 C112,6472 110,6478 112,6484",
  "M118,6640 C122,6634 126,6622 122,6614 C118,6606 114,6612 116,6620",
]

/* ── Glowing nodes along the trunk (denser) ── */
const NODES = [
  { y: 200, r: 2 }, { y: 340, r: 2.5 }, { y: 520, r: 2 }, { y: 720, r: 3 },
  { y: 920, r: 2.5 }, { y: 1080, r: 2.5 }, { y: 1280, r: 2 }, { y: 1400, r: 3 },
  { y: 1580, r: 2.5 }, { y: 1760, r: 2.5 }, { y: 1960, r: 2 }, { y: 2100, r: 3.5 },
  { y: 2280, r: 2.5 }, { y: 2460, r: 2.5 }, { y: 2640, r: 2 }, { y: 2800, r: 3 },
  { y: 2980, r: 2.5 }, { y: 3140, r: 2.5 }, { y: 3320, r: 2 }, { y: 3500, r: 3 },
  { y: 3680, r: 2.5 }, { y: 3860, r: 2.5 }, { y: 4040, r: 2 }, { y: 4200, r: 3.5 },
  { y: 4380, r: 2.5 }, { y: 4560, r: 2.5 }, { y: 4740, r: 2 }, { y: 4920, r: 3 },
  { y: 5100, r: 2.5 }, { y: 5280, r: 2.5 }, { y: 5460, r: 2 }, { y: 5600, r: 3 },
  { y: 5780, r: 2.5 }, { y: 5920, r: 2.5 }, { y: 6080, r: 2 }, { y: 6200, r: 2.5 },
  { y: 6360, r: 2 }, { y: 6440, r: 2 }, { y: 6580, r: 1.8 }, { y: 6640, r: 2 },
]

/* ── Bottom tree (vine culminates in tree from bottle) ── */
const TREE_CX = 120
const TREE_BASE_Y = 8200
const TREE_STEM = "M0,0 L0,58"
const TREE_BRANCH_LEFT = "M0,58 C-30,76 -56,94 -62,116"
const TREE_BRANCH_RIGHT = "M0,58 C30,76 56,94 62,116"
const TREE_BRANCH_TOP = "M0,58 C0,82 0,104 0,132"
const TREE_BRANCH_LEFT_SM = "M-62,116 C-68,122 -66,130 -60,136"
const TREE_BRANCH_RIGHT_SM = "M62,116 C68,122 66,130 60,136"
const TREE_LEAVES = [
  { x: -62, y: 116, rot: 88, s: 1.15 },
  { x: -62, y: 106, rot: 72, s: 0.92 },
  { x: -60, y: 136, rot: 95, s: 0.85 },
  { x: -58, y: 124, rot: 82, s: 0.78 },
  { x: -64, y: 128, rot: 92, s: 0.88 },
  { x: 62, y: 116, rot: -88, s: 1.15 },
  { x: 62, y: 106, rot: -72, s: 0.92 },
  { x: 60, y: 136, rot: -95, s: 0.85 },
  { x: 58, y: 124, rot: -82, s: 0.78 },
  { x: 64, y: 128, rot: -92, s: 0.88 },
  { x: 0, y: 132, rot: 0, s: 1.25 },
  { x: 0, y: 122, rot: -8, s: 0.9 },
  { x: -4, y: 138, rot: 15, s: 0.7 },
  { x: 4, y: 134, rot: -12, s: 0.72 },
  { x: -2, y: 126, rot: 5, s: 0.82 },
]

/* Approximate trunk x at given y — wider horizontal sway, more sporadic */
function trunkX(y: number): number {
  const t = y / VH
  const w1 = Math.sin(t * Math.PI * 9.5) * 42
  const w2 = Math.sin(t * Math.PI * 4.8 + 0.5) * 22
  const w3 = Math.sin(t * Math.PI * 2.3 + 1) * 8
  const converge = t > 0.82 ? ((t - 0.82) / 0.18) ** 2 : 0
  return 120 + (w1 + w2 + w3) * (1 - converge)
}

/* Estimated total path length for the trunk */
const TRUNK_LEN = 13000

export function GoldenVine() {
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const currentProgress = useRef(0)

  const animate = useCallback(() => {
    const container = containerRef.current
    if (!container) {
      rafRef.current = requestAnimationFrame(animate)
      return
    }

    /* ── Progress from scroll every frame so glow tracks 1:1 with scroll ── */
    const scrollY = window.scrollY ?? window.pageYOffset ?? 0
    const vh = window.innerHeight
    const scrollHeight = document.documentElement.scrollHeight
    const maxScroll = Math.max(1, scrollHeight - vh)
    const raw = scrollY / maxScroll
    const p = Math.max(0, Math.min(1, raw))
    currentProgress.current = p

    /* Ensure SVG is visible */
    const svgEl = container.querySelector("svg")
    if (svgEl) svgEl.style.opacity = "1"

    const flow = Math.max(0, p * TRUNK_LEN)
    const trail = TRUNK_LEN * 0.15 // length of the bright leading edge

    /* ── Update flow paths via direct style ── */
    const amb = container.querySelector<SVGPathElement>("[data-flow='ambient']")
    const main = container.querySelector<SVGPathElement>("[data-flow='main']")
    const edge = container.querySelector<SVGPathElement>("[data-flow='edge']")
    const core = container.querySelector<SVGPathElement>("[data-flow='core']")
    const s2 = container.querySelector<SVGPathElement>("[data-flow='strand2']")

    if (amb) {
      amb.style.strokeDasharray = `${flow} ${TRUNK_LEN}`
      amb.style.strokeDashoffset = "0"
    }
    if (main) {
      main.style.strokeDasharray = `${flow} ${TRUNK_LEN}`
      main.style.strokeDashoffset = "0"
    }
    if (edge) {
      const edgeStart = Math.max(0, flow - trail)
      edge.style.strokeDasharray = `${trail} ${TRUNK_LEN}`
      edge.style.strokeDashoffset = String(-edgeStart)
    }
    if (core) {
      const tipLen = trail * 0.3
      const coreStart = Math.max(0, flow - tipLen)
      core.style.strokeDasharray = `${tipLen} ${TRUNK_LEN}`
      core.style.strokeDashoffset = String(-coreStart)
    }
    if (s2) {
      s2.style.strokeDasharray = `${flow * 0.92} ${TRUNK_LEN}`
      s2.style.strokeDashoffset = "0"
    }

    /* ── Reveal mask: vine grows from top with scroll (narrative progression) ── */
    const revealRect = container.querySelector<SVGRectElement>("[data-reveal-rect]")
    if (revealRect) revealRect.setAttribute("height", String(Math.ceil(p * VH)))

    /* ── Update branches, tendrils, nodes ── */
    /* Branches illuminate when the flow reaches their Y position */
    container.querySelectorAll<SVGGElement>("[data-by]").forEach((g) => {
      const by = parseFloat(g.dataset.by || "0") / VH
      const localP = (p - by * 0.9) / 0.06 // smooth ramp over 6% of progress
      g.style.opacity = String(Math.max(0, Math.min(0.65, localP * 0.65)))
    })
    /* Tendrils */
    container.querySelectorAll<SVGPathElement>("[data-ty]").forEach((el) => {
      const ty = parseFloat(el.dataset.ty || "0") / VH
      const localP = (p - ty * 0.9) / 0.08
      el.style.opacity = String(Math.max(0, Math.min(0.28, localP * 0.28)))
    })
    /* Nodes */
    container.querySelectorAll<SVGGElement>("[data-ny]").forEach((g) => {
      const ny = parseFloat(g.dataset.ny || "0") / VH
      const localP = (p - ny * 0.9) / 0.04
      g.style.opacity = String(Math.max(0, Math.min(0.65, localP * 0.65)))
    })

    rafRef.current = requestAnimationFrame(animate)
  }, [])

  useEffect(() => {
    // Start animation after a brief delay to ensure SVG is rendered
    const startAnimation = () => {
      rafRef.current = requestAnimationFrame(animate)
    }
    const timeoutId = setTimeout(startAnimation, 50)
    return () => {
      clearTimeout(timeoutId)
      cancelAnimationFrame(rafRef.current)
    }
  }, [animate])

  return (
    <div
      ref={containerRef}
      className="absolute left-0 right-0 bottom-0 z-0 pointer-events-none block"
      style={{ top: "38vh" }}
      aria-hidden="true"
    >
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="xMidYMin meet"
        className="absolute top-0 left-1/2 -translate-x-1/2 h-full min-h-full"
        style={{ width: "min(600px, 50vw)", overflow: "visible", opacity: 0.4 }}
      >
        <defs>
          {/* ── Reveal mask: vine “grows” from top as user scrolls (narrative stages) ── */}
          <mask id="vineRevealMask">
            <rect data-reveal-rect x="0" y="0" width={VW} height="0" fill="white" />
          </mask>
          {/* ── Gold gradient (ChatGPT-style core) ── */}
          <linearGradient id="goldCore" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F2DA94" />
            <stop offset="45%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#8E6E1F" />
          </linearGradient>
          {/* ── Leaf template ── */}
          <g id="vL">
            <path d={LEAF} fill="currentColor" opacity="0.75" />
            <path d={LEAF_VEIN} fill="none" stroke="currentColor" strokeWidth="0.3" opacity="0.35" />
          </g>
          {/* ── Filters: softer, more luminous liquid glow ── */}
          <filter id="gS" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b1" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="b2" />
            <feMerge>
              <feMergeNode in="b1" />
              <feMergeNode in="b2" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="gW" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" />
          </filter>
          <filter id="gN" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
          </filter>
        </defs>

        {/* ═══════════ DIM STRUCTURE (revealed as you scroll) ═══════════ */}
        <g mask="url(#vineRevealMask)" opacity="0.09" style={{ color: "#D4AF37" }}>
          {/* Drip from bottle at top */}
          <path d={BOTTLE_DRIP} fill="none" stroke="#D4AF37" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          {/* Trunk */}
          <path d={TRUNK} fill="none" stroke="#D4AF37" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          {/* Secondary strand */}
          <path d={STRAND2} fill="none" stroke="#D4AF37" strokeWidth="0.85" strokeLinecap="round" opacity="0.2" />

          {/* Branches + glowing node at tip */}
          {BRANCHES.map((b, i) => (
            <g key={`d${i}`} transform={`translate(${trunkX(b.y)},${b.y})`}>
              <path d={b.path} fill="none" stroke="#D4AF37" strokeWidth="1.2" strokeLinecap="round" />
              {b.subs?.map((s, j) => <path key={j} d={s} fill="none" stroke="#D4AF37" strokeWidth="0.8" strokeLinecap="round" />)}
              {b.tendril && <path d={b.tendril} fill="none" stroke="#D4AF37" strokeWidth="0.45" strokeLinecap="round" />}
              <circle cx={b.endPoint.x} cy={b.endPoint.y} r="2.5" fill="#D4AF37" opacity="0.22" />
              {b.leaves.map((l, j) => (
                <g key={j} transform={`translate(${l.x},${l.y}) rotate(${l.rot}) scale(${l.s})`}>
                  <use href="#vL" />
                </g>
              ))}
            </g>
          ))}

          {/* Tendrils */}
          {TENDRILS.map((d, i) => (
            <path key={`t${i}`} d={d} fill="none" stroke="#D4AF37" strokeWidth="0.5" strokeLinecap="round" />
          ))}

          {/* Nodes */}
          {NODES.map((n, i) => (
            <circle key={`n${i}`} cx={trunkX(n.y)} cy={n.y} r={n.r} fill="#D4AF37" />
          ))}

          {/* Bottom tree (vine meets bottle) */}
          <g transform={`translate(${TREE_CX},${TREE_BASE_Y})`}>
            <path d={TREE_STEM} fill="none" stroke="#D4AF37" strokeWidth="1.9" strokeLinecap="round" />
            <path d={TREE_BRANCH_LEFT} fill="none" stroke="#D4AF37" strokeWidth="1.25" strokeLinecap="round" />
            <path d={TREE_BRANCH_RIGHT} fill="none" stroke="#D4AF37" strokeWidth="1.25" strokeLinecap="round" />
            <path d={TREE_BRANCH_TOP} fill="none" stroke="#D4AF37" strokeWidth="1.25" strokeLinecap="round" />
            <path d={TREE_BRANCH_LEFT_SM} fill="none" stroke="#D4AF37" strokeWidth="0.9" strokeLinecap="round" />
            <path d={TREE_BRANCH_RIGHT_SM} fill="none" stroke="#D4AF37" strokeWidth="0.9" strokeLinecap="round" />
            {TREE_LEAVES.map((l, j) => (
              <g key={j} transform={`translate(${l.x},${l.y}) rotate(${l.rot}) scale(${l.s})`}>
                <use href="#vL" />
              </g>
            ))}
          </g>
        </g>

        {/* ═══════════ SAUCE FLOW LAYERS (liquid stream: halo + core, revealed with scroll) ═══════════ */}
        <g mask="url(#vineRevealMask)">
          {/* 1. Wide ambient glow */}
          <path data-flow="ambient" d={TRUNK} fill="none" stroke="#D4AF37" strokeWidth="14" strokeLinecap="round" filter="url(#gW)" opacity="0.04" style={{ strokeDasharray: `0 ${TRUNK_LEN}` }} />
          {/* 2. Main trail (gold gradient option) */}
          <path data-flow="main" d={TRUNK} fill="none" stroke="url(#goldCore)" strokeWidth="2.6" strokeLinecap="round" opacity="0.28" style={{ strokeDasharray: `0 ${TRUNK_LEN}` }} />
          {/* 3. Bright leading edge */}
          <path data-flow="edge" d={TRUNK} fill="none" stroke="#FFCC44" strokeWidth="2" strokeLinecap="round" filter="url(#gS)" opacity="0.22" style={{ strokeDasharray: `0 ${TRUNK_LEN}`, strokeDashoffset: "0" }} />
          {/* 4. Cream-white core (tip only) */}
          <path data-flow="core" d={TRUNK} fill="none" stroke="#FFF8DC" strokeWidth="0.9" strokeLinecap="round" filter="url(#gS)" opacity="0.28" style={{ strokeDasharray: `0 ${TRUNK_LEN}`, strokeDashoffset: "0" }} />
          {/* 5. Secondary strand flow */}
          <path data-flow="strand2" d={STRAND2} fill="none" stroke="#D4AF37" strokeWidth="0.9" strokeLinecap="round" opacity="0.12" style={{ strokeDasharray: `0 ${TRUNK_LEN}` }} />
        </g>

        {/* ═══════════ ILLUMINATED BRANCHES + glowing node at tip (revealed with scroll) ═══════════ */}
        <g mask="url(#vineRevealMask)">
        {BRANCHES.map((b, i) => (
          <g key={`l${i}`} data-by={b.y} transform={`translate(${trunkX(b.y)},${b.y})`} opacity="0" style={{ color: "#D4AF37" }}>
            <path d={b.path} fill="none" stroke="#D4AF37" strokeWidth="1.4" strokeLinecap="round" opacity="0.28" />
            <path d={b.path} fill="none" stroke="#FFCC44" strokeWidth="0.7" strokeLinecap="round" filter="url(#gS)" opacity="0.16" />
            {b.subs?.map((s, j) => (
              <g key={j}>
                <path d={s} fill="none" stroke="#D4AF37" strokeWidth="0.9" strokeLinecap="round" opacity="0.22" />
                <path d={s} fill="none" stroke="#FFCC44" strokeWidth="0.4" strokeLinecap="round" filter="url(#gS)" opacity="0.12" />
              </g>
            ))}
            {b.tendril && <path d={b.tendril} fill="none" stroke="#FFCC44" strokeWidth="0.4" strokeLinecap="round" opacity="0.12" />}
            <circle cx={b.endPoint.x} cy={b.endPoint.y} r="3" fill="#D4AF37" opacity="0.12" filter="url(#gN)" />
            <circle cx={b.endPoint.x} cy={b.endPoint.y} r="2" fill="#FFCC44" opacity="0.24" />
            <circle cx={b.endPoint.x} cy={b.endPoint.y} r="0.8" fill="#FFF8DC" opacity="0.32" />
            {b.leaves.map((l, j) => (
              <g key={j} transform={`translate(${l.x},${l.y}) rotate(${l.rot}) scale(${l.s})`}>
                <use href="#vL" style={{ color: "#FFCC44" }} opacity="0.2" />
              </g>
            ))}
          </g>
        ))}

        {/* ═══════════ ILLUMINATED TENDRILS ═══════════ */}
        {TENDRILS.map((d, i) => {
          const m = d.match(/M[\d.]+,([\d.]+)/)
          return (
            <path key={`lt${i}`} data-ty={m ? m[1] : "0"} d={d} fill="none" stroke="#FFCC44" strokeWidth="0.5" strokeLinecap="round" opacity="0" />
          )
        })}

        {/* ═══════════ ILLUMINATED NODES ═══════════ */}
        {NODES.map((n, i) => (
          <g key={`ln${i}`} data-ny={n.y} opacity="0">
            <circle cx={trunkX(n.y)} cy={n.y} r={n.r + 6} fill="#D4AF37" opacity="0.15" filter="url(#gN)" />
            <circle cx={trunkX(n.y)} cy={n.y} r={n.r + 1.5} fill="#D4AF37" opacity="0.26" />
            <circle cx={trunkX(n.y)} cy={n.y} r={n.r} fill="#FFCC44" opacity="0.38" />
            <circle cx={trunkX(n.y)} cy={n.y} r={n.r * 0.35} fill="#FFF8DC" opacity="0.8" />
          </g>
        ))}

        {/* ═══════════ ILLUMINATED BOTTOM TREE ═══════════ */}
        <g data-by={TREE_BASE_Y} transform={`translate(${TREE_CX},${TREE_BASE_Y})`} opacity="0" style={{ color: "#D4AF37" }}>
          <path d={TREE_STEM} fill="none" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" opacity="0.32" />
          <path d={TREE_STEM} fill="none" stroke="#FFCC44" strokeWidth="0.8" strokeLinecap="round" filter="url(#gS)" opacity="0.18" />
          <path d={TREE_BRANCH_LEFT} fill="none" stroke="#D4AF37" strokeWidth="1.4" strokeLinecap="round" opacity="0.28" />
          <path d={TREE_BRANCH_LEFT} fill="none" stroke="#FFCC44" strokeWidth="0.5" strokeLinecap="round" filter="url(#gS)" opacity="0.14" />
          <path d={TREE_BRANCH_RIGHT} fill="none" stroke="#D4AF37" strokeWidth="1.4" strokeLinecap="round" opacity="0.28" />
          <path d={TREE_BRANCH_RIGHT} fill="none" stroke="#FFCC44" strokeWidth="0.5" strokeLinecap="round" filter="url(#gS)" opacity="0.14" />
          <path d={TREE_BRANCH_TOP} fill="none" stroke="#D4AF37" strokeWidth="1.4" strokeLinecap="round" opacity="0.28" />
          <path d={TREE_BRANCH_TOP} fill="none" stroke="#FFCC44" strokeWidth="0.5" strokeLinecap="round" filter="url(#gS)" opacity="0.14" />
          <path d={TREE_BRANCH_LEFT_SM} fill="none" stroke="#D4AF37" strokeWidth="1" strokeLinecap="round" opacity="0.24" />
          <path d={TREE_BRANCH_RIGHT_SM} fill="none" stroke="#D4AF37" strokeWidth="1" strokeLinecap="round" opacity="0.24" />
          {TREE_LEAVES.map((l, j) => (
            <g key={j} transform={`translate(${l.x},${l.y}) rotate(${l.rot}) scale(${l.s})`}>
              <use href="#vL" style={{ color: "#FFCC44" }} opacity="0.38" />
            </g>
          ))}
        </g>
        </g>
      </svg>
    </div>
  )
}
