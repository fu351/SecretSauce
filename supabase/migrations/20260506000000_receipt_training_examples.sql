-- ─────────────────────────────────────────────────────────────────────────
-- receipt_training_examples
-- ─────────────────────────────────────────────────────────────────────────
-- Stores receipts captured for the eventual layout-aware token-classifier
-- training set. Every successful /api/receipt/scan optionally inserts a row
-- here, with a candidate parse pre-filled by the production pipeline. A
-- verification step (user-self or admin) marks the row as gold-standard
-- training data, which the export script (lib/receipt-ocr/test/
-- export_training_data.py) then dumps to the format the trainer consumes.
--
-- Auth: Clerk + service-role Supabase, like every other write in this
-- codebase. No RLS — the Next.js layer is the trust boundary.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS receipt_training_examples (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner of the upload (the user who scanned it). FK to profiles, but kept
  -- ON DELETE SET NULL so we don't lose training data when accounts close.
  user_id                  uuid REFERENCES profiles(id) ON DELETE SET NULL,

  -- Storage location of the original receipt image. Path is relative to
  -- the `receipt-training-images` bucket (see storage migration alongside
  -- this one). NULL when image upload failed but parse succeeded.
  image_storage_path       text,

  -- A perceptual fingerprint of the upload — used to detect duplicates so
  -- the same receipt re-scanned 3 times doesn't create 3 training examples.
  -- Computed as sha256 of the original image bytes.
  image_sha256             text,

  -- The candidate parse from the production pipeline, as JSON matching the
  -- schema returned by /receipt/scan. Editable by the verifier.
  candidate_parse          jsonb NOT NULL,

  -- Diagnostic chain that produced the candidate. Lets us measure which
  -- pipeline tier produced the example after the fact (e.g. "is the LLM
  -- tier producing more correct examples than the hand-coded parser?").
  --   strategy_used:        "easyocr" | "paddle" | "ensemble" | "llm_tokens" | "llm_vision"
  --   strategies_tried:     ["easyocr", "ensemble", "llm_tokens"]
  --   parse_confidence:     0.0 to 1.0 from _confidence_from_parse
  strategy_used            text,
  strategies_tried         text[]    NOT NULL DEFAULT '{}',
  parse_confidence         numeric,

  -- Verification state. See _verification_disposition() in main.py for
  -- how this is decided at insert time.
  --   disposition:
  --     "auto_accepted"  → cross-validation passed, no human review needed
  --     "needs_review"   → confidence below threshold; show to user/admin
  --     "rejected"       → automatic check failed (e.g. checksum off by >$5)
  disposition              text NOT NULL CHECK (disposition IN (
    'auto_accepted', 'needs_review', 'rejected'
  )),

  -- Verification audit trail. Set by /api/receipt/training/verify.
  --   verified_by:          NULL | "auto" | "user:<uuid>" | "admin:<uuid>"
  --   verified_at:          when verification happened
  --   verified_parse:       the parse after human edits (NULL when auto-accepted)
  --   verifier_notes:       optional free-form note from the verifier
  verified_by              text,
  verified_at              timestamptz,
  verified_parse           jsonb,
  verifier_notes           text,

  -- Whether this example has been included in a training-set export.
  -- Set by export_training_data.py so re-runs are incremental.
  exported_at              timestamptz,

  -- Soft-delete column matching the rest of the schema's convention.
  deleted_at               timestamptz,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Indexes ------------------------------------------------------------------

-- Verification queue lookup ("show me receipts needing review, oldest first").
CREATE INDEX IF NOT EXISTS idx_receipt_training_disposition_created
  ON receipt_training_examples (disposition, created_at)
  WHERE deleted_at IS NULL;

-- Per-user history view ("my receipts that became training data").
CREATE INDEX IF NOT EXISTS idx_receipt_training_user
  ON receipt_training_examples (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Dedupe lookup by image hash. Partial index keeps it small (NULLs excluded).
CREATE INDEX IF NOT EXISTS idx_receipt_training_sha
  ON receipt_training_examples (image_sha256)
  WHERE image_sha256 IS NOT NULL AND deleted_at IS NULL;

-- Export pagination: pull all verified-and-not-yet-exported rows.
CREATE INDEX IF NOT EXISTS idx_receipt_training_exportable
  ON receipt_training_examples (verified_at)
  WHERE verified_at IS NOT NULL AND exported_at IS NULL AND deleted_at IS NULL;

-- updated_at trigger -------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_touch_receipt_training_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_receipt_training_touch
  ON receipt_training_examples;
CREATE TRIGGER trg_receipt_training_touch
  BEFORE UPDATE ON receipt_training_examples
  FOR EACH ROW EXECUTE FUNCTION fn_touch_receipt_training_updated_at();
