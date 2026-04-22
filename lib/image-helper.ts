import { supabase } from "./database/supabase"

export const DEFAULT_IMAGE_FALLBACK_LIGHT = "/logo-warm.png"
export const DEFAULT_IMAGE_FALLBACK_DARK = "/logo-dark.png"
export const DEFAULT_IMAGE_FALLBACK = DEFAULT_IMAGE_FALLBACK_LIGHT

export function getDefaultImageFallback(theme?: string): string {
  return theme === "dark" ? DEFAULT_IMAGE_FALLBACK_DARK : DEFAULT_IMAGE_FALLBACK_LIGHT
}

export function isDefaultImageFallback(imageSrc: string | null | undefined): boolean {
  if (!imageSrc) return false
  return imageSrc.includes(DEFAULT_IMAGE_FALLBACK_LIGHT) || imageSrc.includes(DEFAULT_IMAGE_FALLBACK_DARK)
}

export function applyFallbackImageStyles(img: HTMLImageElement) {
  img.style.objectFit = "contain"
  img.style.padding = "12px"
}

/**
 * Helper function to get the correct image URL from either a direct URL or a Supabase storage path
 * @param imageValue - Either a full URL (http/https) or a storage path (recipe-images/...)
 * @returns The full image URL to use in img/Image src
 */
export function getRecipeImageUrl(imageValue: string | null | undefined, theme?: string): string {
  const normalizedImageValue = imageValue?.trim()
  if (
    !normalizedImageValue ||
    normalizedImageValue === "null" ||
    normalizedImageValue === "undefined"
  ) {
    return getDefaultImageFallback(theme)
  }

  // If it's already a full URL (http:// or https://), return it directly
  if (normalizedImageValue.startsWith("http://") || normalizedImageValue.startsWith("https://")) {
    return normalizedImageValue
  }

  // Otherwise, treat it as a Supabase storage path and get the public URL
  const { data } = supabase.storage.from("recipe-images").getPublicUrl(normalizedImageValue)
  return data.publicUrl
}

/**
 * Upload an image file to Supabase storage
 * @param file - The image file to upload
 * @param userId - The user ID for organizing files
 * @returns The storage path of the uploaded file
 */
export async function uploadRecipeImage(file: File, userId: string): Promise<string> {
  const fileExt = file.name.split(".").pop()
  const fileName = `${userId}/${Date.now()}.${fileExt}`

  const { data, error } = await supabase.storage.from("recipe-images").upload(fileName, file, {
    cacheControl: "3600",
    upsert: false,
  })

  if (error) {
    throw error
  }

  return data.path
}
