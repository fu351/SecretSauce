-- Allow queue rows to be held in probation without being marked failed.
ALTER TABLE public.ingredient_match_queue
  DROP CONSTRAINT IF EXISTS ingredient_match_queue_status_check;

ALTER TABLE public.ingredient_match_queue
  ADD CONSTRAINT ingredient_match_queue_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'pending'::text,
        'processing'::text,
        'resolved'::text,
        'failed'::text,
        'probation'::text
      ]
    )
  );
