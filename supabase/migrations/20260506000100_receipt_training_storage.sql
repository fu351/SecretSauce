-- ─────────────────────────────────────────────────────────────────────────
-- receipt-training-images storage bucket
-- ─────────────────────────────────────────────────────────────────────────
-- Private bucket for receipt images captured for the training set.
-- Path convention enforced by the API:
--     {user_id_hex}/{yyyy}/{mm}/{sha256_first_16}.{ext}
--
-- Read access is via signed URLs minted by the Next.js verification page —
-- never via direct bucket exposure. We don't enable RLS on storage policies
-- because the service-role client (used everywhere in this codebase) is
-- the only writer + the only reader.
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipt-training-images',
  'receipt-training-images',
  false,                                              -- private; signed URLs only
  20971520,                                           -- 20 MB upload cap
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png',
    'image/webp', 'image/heic', 'image/heif'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
