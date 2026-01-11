/**
 * Recipe Instruction Type
 *
 * Represents a single instruction step in a recipe.
 * Each instruction has a sequential step number and a description.
 */
export interface Instruction {
  step: number
  description: string
}

/**
 * Normalizes instruction data to consistent Instruction[] format
 *
 * Handles conversion from:
 * - string[] (legacy format) -> Instruction[]
 * - Instruction[] -> Instruction[] (pass-through)
 * - undefined -> [] (empty array)
 *
 * Used for backward compatibility during migration from string[] to Instruction[] format.
 *
 * @param instructions - Instructions in various formats (string[], Instruction[], or undefined)
 * @returns Normalized Instruction[] array
 *
 * @example
 * // From strings
 * normalizeInstructions(['Mix flour', 'Add eggs'])
 * // Returns: [{ step: 1, description: 'Mix flour' }, { step: 2, description: 'Add eggs' }]
 *
 * @example
 * // From Instruction objects
 * normalizeInstructions([{ step: 1, description: 'Mix' }])
 * // Returns: [{ step: 1, description: 'Mix' }]
 */
export function normalizeInstructions(
  instructions: string[] | Instruction[] | undefined
): Instruction[] {
  if (!instructions) return []

  // Check if it's a string array (legacy format)
  if (instructions.length > 0 && typeof instructions[0] === 'string') {
    return (instructions as string[]).map((desc, index) => ({
      step: index + 1,
      description: desc,
    }))
  }

  // Already in Instruction[] format
  return instructions as Instruction[]
}

/**
 * Parses instructions from database storage format to Instruction[]
 *
 * Database may store instructions as:
 * - JSONB array of strings (legacy)
 * - JSONB array of instruction objects (new format)
 * - String (stringified JSON)
 *
 * This function handles all formats and normalizes to Instruction[].
 *
 * @param instructions - Raw instructions from database
 * @returns Normalized Instruction[] array
 */
export function parseInstructionsFromDB(instructions: any): Instruction[] {
  if (!instructions) return []

  // If it's already an array, normalize it
  if (Array.isArray(instructions)) {
    return normalizeInstructions(instructions)
  }

  // If it's a string, try to parse it
  if (typeof instructions === 'string') {
    try {
      const parsed = JSON.parse(instructions)
      return normalizeInstructions(Array.isArray(parsed) ? parsed : [])
    } catch {
      return []
    }
  }

  return []
}
