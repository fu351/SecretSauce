import { ImageResponse } from "next/og"

export const size = {
  width: 512,
  height: 512,
}

export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #FAF4E5 0%, #F7E6C5 100%)",
          borderRadius: 96,
          fontSize: 240,
        }}
      >
        🍳
      </div>
    ),
    {
      ...size,
    }
  )
}
