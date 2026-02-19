import {
  ingredientMatchQueueDB,
  type IngredientConfidenceCalibrationBinRow,
} from "../../lib/database/ingredient-match-queue-db"

const CALIBRATION_LOOKBACK_DAYS = 30
const CALIBRATION_BIN_SIZE = 0.1
const CALIBRATION_MIN_BIN_SAMPLES = 12
const CALIBRATION_MIN_TOTAL_SAMPLES = 50
const CALIBRATION_REFRESH_MS = 10 * 60 * 1000
const CALIBRATION_FULL_BIN_WEIGHT_SAMPLES = 60

interface CalibrationBin {
  binStart: number
  sampleCount: number
  acceptanceRate: number
}

interface LoadedCalibration {
  loadedAt: number
  totalSamples: number
  globalAcceptanceRate: number
  bins: Map<number, CalibrationBin>
}

export interface CalibratedConfidence {
  raw: number
  calibrated: number
  binStart: number
  binSamples: number
  empiricalAcceptanceRate: number
}

export interface IngredientConfidenceCalibrator {
  loadedAt: number
  totalSamples: number
  globalAcceptanceRate: number
  calibrate(rawConfidence: number): CalibratedConfidence
}

const IDENTITY_CALIBRATOR: IngredientConfidenceCalibrator = {
  loadedAt: 0,
  totalSamples: 0,
  globalAcceptanceRate: 0.5,
  calibrate(rawConfidence: number): CalibratedConfidence {
    const clamped = clampConfidence(rawConfidence)
    return {
      raw: clamped,
      calibrated: clamped,
      binStart: toBinStart(clamped),
      binSamples: 0,
      empiricalAcceptanceRate: 0.5,
    }
  },
}

let cachedCalibration: IngredientConfidenceCalibrator = IDENTITY_CALIBRATOR
let inflightCalibrationLoad: Promise<IngredientConfidenceCalibrator> | null = null

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function toBinStart(rawConfidence: number): number {
  const clamped = clampConfidence(rawConfidence)
  const bucket = Math.floor(clamped / CALIBRATION_BIN_SIZE)
  return Number((bucket * CALIBRATION_BIN_SIZE).toFixed(3))
}

function toCalibrationBins(rows: IngredientConfidenceCalibrationBinRow[]): CalibrationBin[] {
  return rows
    .map((row) => ({
      binStart: Number(row.bin_start || 0),
      sampleCount: Number(row.sample_count || 0),
      acceptanceRate: clampConfidence(Number(row.acceptance_rate || 0)),
    }))
    .filter((row) => row.sampleCount > 0)
    .sort((a, b) => a.binStart - b.binStart)
}

function buildCalibrator(calibration: LoadedCalibration): IngredientConfidenceCalibrator {
  return {
    loadedAt: calibration.loadedAt,
    totalSamples: calibration.totalSamples,
    globalAcceptanceRate: calibration.globalAcceptanceRate,
    calibrate(rawConfidence: number): CalibratedConfidence {
      const raw = clampConfidence(rawConfidence)
      if (calibration.totalSamples < CALIBRATION_MIN_TOTAL_SAMPLES) {
        return {
          raw,
          calibrated: raw,
          binStart: toBinStart(raw),
          binSamples: 0,
          empiricalAcceptanceRate: calibration.globalAcceptanceRate,
        }
      }

      const binStart = toBinStart(raw)
      const bin = calibration.bins.get(binStart)
      const binSamples = bin?.sampleCount || 0
      const binRate = bin?.acceptanceRate ?? calibration.globalAcceptanceRate
      const binWeight = Math.min(1, binSamples / CALIBRATION_FULL_BIN_WEIGHT_SAMPLES)
      const empirical = (binRate * binWeight) + (calibration.globalAcceptanceRate * (1 - binWeight))

      // Keep the model signal but pull toward observed acceptance outcomes.
      const calibrated = clampConfidence((raw * 0.6) + (empirical * 0.4))

      return {
        raw,
        calibrated: Number(calibrated.toFixed(3)),
        binStart,
        binSamples,
        empiricalAcceptanceRate: Number(empirical.toFixed(3)),
      }
    },
  }
}

async function loadCalibration(): Promise<IngredientConfidenceCalibrator> {
  const rows = await ingredientMatchQueueDB.fetchIngredientConfidenceCalibration({
    daysBack: CALIBRATION_LOOKBACK_DAYS,
    binSize: CALIBRATION_BIN_SIZE,
    minSamples: CALIBRATION_MIN_BIN_SAMPLES,
  })

  const bins = toCalibrationBins(rows)
  const totalSamples = bins.reduce((sum, row) => sum + row.sampleCount, 0)
  const acceptedSamples = bins.reduce(
    (sum, row) => sum + (row.acceptanceRate * row.sampleCount),
    0
  )
  const globalAcceptanceRate = totalSamples > 0 ? clampConfidence(acceptedSamples / totalSamples) : 0.5

  const loaded: LoadedCalibration = {
    loadedAt: Date.now(),
    totalSamples,
    globalAcceptanceRate,
    bins: new Map(bins.map((row) => [Number(row.binStart.toFixed(3)), row])),
  }

  console.log(
    `[QueueResolver] Loaded confidence calibrator: bins=${bins.length}, samples=${totalSamples}, ` +
      `global_acceptance=${globalAcceptanceRate.toFixed(3)}`
  )

  return buildCalibrator(loaded)
}

export async function getIngredientConfidenceCalibrator(forceRefresh = false): Promise<IngredientConfidenceCalibrator> {
  const now = Date.now()
  if (
    !forceRefresh &&
    cachedCalibration.loadedAt > 0 &&
    now - cachedCalibration.loadedAt < CALIBRATION_REFRESH_MS
  ) {
    return cachedCalibration
  }

  if (inflightCalibrationLoad) {
    return inflightCalibrationLoad
  }

  inflightCalibrationLoad = loadCalibration()
    .then((calibrator) => {
      cachedCalibration = calibrator
      return calibrator
    })
    .catch((error) => {
      console.warn("[QueueResolver] Failed to load confidence calibrator; using identity fallback:", error)
      return cachedCalibration
    })
    .finally(() => {
      inflightCalibrationLoad = null
    })

  return inflightCalibrationLoad
}
