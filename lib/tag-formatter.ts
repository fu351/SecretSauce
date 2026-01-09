/**
 * Format a dietary tag for display
 * Converts 'gluten-free' to 'Gluten-Free', 'vegan' to 'Vegan', etc.
 */
export function formatDietaryTag(tag: string): string {
  return tag
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('-')
}
