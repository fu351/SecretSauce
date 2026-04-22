type PretextModule = typeof import("@chenglou/pretext")

let pretextModulePromise: Promise<PretextModule> | null = null

function loadPretextModule() {
  if (!pretextModulePromise) {
    pretextModulePromise = import("@chenglou/pretext")
  }
  return pretextModulePromise
}

export async function primePretext() {
  try {
    await loadPretextModule()
  } catch {
    // Fail silently; pretext is an enhancement.
  }
}

export async function measureTextBlockHeight(
  text: string,
  font: string,
  maxWidth: number,
  lineHeight: number,
) {
  if (!text) return lineHeight

  const { prepare, layout } = await loadPretextModule()
  const prepared = prepare(text, font)
  const { height } = layout(prepared, maxWidth, lineHeight)
  return height
}
