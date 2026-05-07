-- ─────────────────────────────────────────────────────────────────────────
-- Promote the dedupe index on receipt_training_examples.image_sha256 to a
-- UNIQUE partial index. Together with the application-side dedupe check
-- this enforces "the same paper receipt cannot enter the training set
-- twice" at the database layer — important for the journal-based bulk
-- uploader (annotate_receipts.py) where retries can race with another
-- session and would otherwise create a duplicate row on first success.
--
-- Partial: only enforces uniqueness for non-null SHAs and non-deleted
-- rows. Soft-deleting a row releases the slot (intentional — re-importing
-- a previously-deleted receipt should be allowed).
-- ─────────────────────────────────────────────────────────────────────────

-- Drop and recreate as UNIQUE; CREATE UNIQUE INDEX ... IF NOT EXISTS does
-- not upgrade an existing non-unique index, so we drop first.
DROP INDEX IF EXISTS idx_receipt_training_sha;

CREATE UNIQUE INDEX idx_receipt_training_sha
  ON receipt_training_examples (image_sha256)
  WHERE image_sha256 IS NOT NULL AND deleted_at IS NULL;
