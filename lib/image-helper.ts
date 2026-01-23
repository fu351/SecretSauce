import { supabase } from "./database/supabase"

/**
 * Helper function to get the correct image URL from either a direct URL or a Supabase storage path
 * @param imageValue - Either a full URL (http/https) or a storage path (recipe-images/...)
 * @returns The full image URL to use in img/Image src
 */
export function getRecipeImageUrl(imageValue: string | null | undefined): string {
  if (!imageValue) {
    return "/placeholder.svg?height=300&width=400"
  }

  // If it's already a full URL (http:// or https://), return it directly
  if (imageValue.startsWith("http://") || imageValue.startsWith("https://")) {
    return imageValue
  }

  // Otherwise, treat it as a Supabase storage path and get the public URL
  const { data } = supabase.storage.from("recipe-images").getPublicUrl(imageValue)
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
