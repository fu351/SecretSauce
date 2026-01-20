/**
 * Format a dietary tag for display
 * Converts 'gluten-free' to 'Gluten-Free', 'vegan' to 'Vegan', etc.
 * * Includes error handling to catch null/undefined or non-string inputs.
 */
export function formatDietaryTag(tag: string | null | undefined): string {
  // 1. Handle null, undefined, or empty strings gracefully
  if (!tag || typeof tag !== 'string') {
    return "";
  }

  try {
    return tag
      .trim() // Remove accidental whitespace
      .split('-')
      .map(word => {
        // 2. Guard against empty segments (e.g., if input was "vegan--")
        if (word.length === 0) return "";
        
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .filter(Boolean) // Remove any empty strings from mapping
      .join('-');
  } catch (error) {
    // 3. Last resort fallback to avoid breaking the UI
    console.error(`[formatDietaryTag] Failed to format: ${tag}`, error);
    return tag;
  }
}

/**
 * Alternative for bulk formatting (useful for the tags array in your Recipe type)
 */
export function formatDietaryTags(tags: string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.map(formatDietaryTag).filter(tag => tag !== "");
}