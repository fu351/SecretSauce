export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through to the legacy copy path below.
    }
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard API is not available")
  }

  const input = document.createElement("input")
  input.value = text
  input.setAttribute("readonly", "true")
  input.style.position = "absolute"
  input.style.left = "-9999px"
  document.body.appendChild(input)
  input.select()

  const copied = document.execCommand("copy")
  document.body.removeChild(input)

  if (!copied) {
    throw new Error("Failed to copy text to clipboard")
  }
}
