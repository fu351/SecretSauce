export function chunkItems<T>(items: T[], chunkSize: number): T[][] {
  if (!items.length) return []

  const safeChunkSize = Math.max(1, Math.floor(chunkSize))
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += safeChunkSize) {
    chunks.push(items.slice(index, index + safeChunkSize))
  }

  return chunks
}

export async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<U>
): Promise<U[]> {
  if (!items.length) return []

  const safeConcurrency = Math.max(1, Math.floor(concurrency))
  const output = new Array<U>(items.length)
  let cursor = 0

  const runners = Array.from({ length: Math.min(safeConcurrency, items.length) }, async () => {
    while (true) {
      const currentIndex = cursor
      cursor += 1

      if (currentIndex >= items.length) return
      output[currentIndex] = await worker(items[currentIndex] as T, currentIndex)
    }
  })

  await Promise.all(runners)
  return output
}
