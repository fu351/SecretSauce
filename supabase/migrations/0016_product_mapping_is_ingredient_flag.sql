-- Product mapping ingredient classification flag
-- Stores whether a product is currently classified as an ingredient.

ALTER TABLE public.product_mappings
  ADD COLUMN IF NOT EXISTS is_ingredient boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.product_mappings.is_ingredient
  IS 'True when the product is classified as an ingredient; false when flagged for non-ingredient/manual review.';

-- Backfill existing rows:
-- 1) default everything to ingredient=true
-- 2) flip to false when an unresolved scraper queue row still needs ingredient review
UPDATE public.product_mappings
SET is_ingredient = true
WHERE is_ingredient IS DISTINCT FROM true;

UPDATE public.product_mappings pm
SET is_ingredient = false
FROM public.ingredient_match_queue q
WHERE q.product_mapping_id = pm.id
  AND q.source = 'scraper'
  AND COALESCE(q.needs_ingredient_review, false) = true
  AND (q.status <> 'resolved' OR q.resolved_ingredient_id IS NULL);

UPDATE public.product_mappings pm
SET is_ingredient = true
FROM public.ingredient_match_queue q
WHERE q.product_mapping_id = pm.id
  AND q.source = 'scraper'
  AND q.status = 'resolved'
  AND q.resolved_ingredient_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_sync_product_mapping_is_ingredient_from_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source <> 'scraper' OR NEW.product_mapping_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolved scraper rows with a resolved ingredient are ingredients.
  IF NEW.status = 'resolved' AND NEW.resolved_ingredient_id IS NOT NULL THEN
    UPDATE public.product_mappings
    SET is_ingredient = true
    WHERE id = NEW.product_mapping_id;
    RETURN NEW;
  END IF;

  -- Any unresolved scraper row requiring ingredient review is treated as non-ingredient for now.
  IF COALESCE(NEW.needs_ingredient_review, false) = true
     AND (NEW.status <> 'resolved' OR NEW.resolved_ingredient_id IS NULL) THEN
    UPDATE public.product_mappings
    SET is_ingredient = false
    WHERE id = NEW.product_mapping_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_sync_product_mapping_is_ingredient ON public.ingredient_match_queue;
CREATE TRIGGER trg_queue_sync_product_mapping_is_ingredient
AFTER INSERT OR UPDATE OF status, needs_ingredient_review, resolved_ingredient_id, product_mapping_id, source
ON public.ingredient_match_queue
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_product_mapping_is_ingredient_from_queue();
