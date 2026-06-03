"""
engines.py
==========
OCR engine implementations and shared preprocessing.

Lifted out of `test/ocr_bench.py` so the engines can be imported from any
caller (FastAPI, scripts, future workers) without going through the bench
harness. The bench file now imports from here so existing tests continue
to work unchanged.

Public surface
--------------
    OCREngine                — abstract base
    EasyOCREngine            — single-engine reader
    PaddleOCREngine          — single-engine reader
    EnsembleEngine           — both engines + merge + targeted re-OCR
    preprocess_base          — ROI/perspective/upscale/deskew/denoise (returns ndarray)
    preprocess_finalize      — mode-specific thresholding (returns temp PNG path)
    preprocess               — convenience wrapper around the two
    ENGINES                  — registry mapping name → class
    create_engine(name)      — factory returning a loaded engine instance
    get_available_engines()  — names of engines whose deps are installed

Dependencies
------------
    cv2, PIL              (always required)
    easyocr               (required for EasyOCREngine + EnsembleEngine)
    paddleocr, paddle     (required for PaddleOCREngine + EnsembleEngine)

The receipt-parser helpers (``parse_price``, ``normalise_token``,
``spatial_reorder``, ``ensemble_merge``) are loaded via importlib from
``receipt_parser.py`` next to this file. Mirrors the loader pattern used by
``test/ocr_bench.py`` so callers don't need to install this directory as a
package — file-relative loading just works.
"""
from __future__ import annotations

import abc
import importlib.util
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Optional

import cv2
from PIL import Image

# ── Speed knobs (env-var controlled, read at import time) ──────────────────
# Set RECEIPT_OCR_FAST=1 to enable a preset that drops per-image OCR time
# from ~10-30s to ~3-5s on phone photos. Tradeoffs:
#   - skips fastNlMeansDenoising (saves 2-4s; loses some accuracy on grainy
#     thermal receipts; phone photos are usually clean enough to not need it)
#   - caps preprocessed-image height at 1200px (was 2000px)
#   - lowers EasyOCR canvas_size to 1280 (was 2048)
# Override individually with RECEIPT_OCR_MAX_HEIGHT, RECEIPT_OCR_CANVAS_SIZE,
# RECEIPT_OCR_SKIP_DENOISE if you want different tradeoffs.
_FAST_MODE     = os.getenv("RECEIPT_OCR_FAST") in ("1", "true", "True")
_MAX_HEIGHT    = int(os.getenv("RECEIPT_OCR_MAX_HEIGHT", "1200" if _FAST_MODE else "2000"))
_CANVAS_SIZE   = int(os.getenv("RECEIPT_OCR_CANVAS_SIZE", "1280" if _FAST_MODE else "2048"))
_SKIP_DENOISE  = os.getenv("RECEIPT_OCR_SKIP_DENOISE") in ("1", "true", "True") or _FAST_MODE
_TARGET_HEIGHT = int(os.getenv("RECEIPT_OCR_TARGET_HEIGHT", "1200" if _FAST_MODE else "1500"))

# ── Low-res rescue mode ───────────────────────────────────────────────────
# When the input image is below ~2 MP, the EasyOCR text-detector (CRAFT)
# misses small text (e.g. price column on receipts). Two-pronged fix:
#   1. preprocess_base upscales aggressively to LOWRES_UPSCALE_TO px height
#      so the small text becomes large enough to detect (10-15px range).
#   2. EasyOCREngine.extract_detections passes relaxed CRAFT thresholds
#      (text/low_text/link) so the detector emits boxes for fainter regions.
# Auto-triggers when image area < LOWRES_TRIGGER_MP. Disable with
# RECEIPT_OCR_LOWRES_RESCUE=0; force-on with RECEIPT_OCR_LOWRES_RESCUE=1.
_LOWRES_RESCUE_RAW   = os.getenv("RECEIPT_OCR_LOWRES_RESCUE", "auto").lower()
_LOWRES_TRIGGER_MP   = float(os.getenv("RECEIPT_OCR_LOWRES_TRIGGER_MP", "2.0"))
_LOWRES_UPSCALE_TO   = int(os.getenv("RECEIPT_OCR_LOWRES_UPSCALE_TO", "2400"))


def _should_lowres_rescue(img_h: int, img_w: int) -> bool:
    """Decide whether to engage low-res rescue for an image of the given size."""
    if _LOWRES_RESCUE_RAW in ("0", "false", "off"):
        return False
    if _LOWRES_RESCUE_RAW in ("1", "true", "on", "force"):
        return True
    # auto: trigger when the image is below the trigger threshold
    return (img_h * img_w) / 1_000_000 < _LOWRES_TRIGGER_MP

# ── Receipt-parser helpers (file-relative loader) ──────────────────────────
_PARSER_PATH = Path(__file__).resolve().parent / "receipt_parser.py"
_spec = importlib.util.spec_from_file_location("receipt_parser", _PARSER_PATH)
_parser_mod = importlib.util.module_from_spec(_spec)
sys.modules.setdefault("receipt_parser", _parser_mod)
_spec.loader.exec_module(_parser_mod)  # type: ignore[union-attr]
parse_receipt = _parser_mod.parse_receipt
spatial_reorder = _parser_mod.spatial_reorder
ensemble_merge = _parser_mod.ensemble_merge
parse_price = _parser_mod.parse_price
normalise_token = _parser_mod.normalise_token

# ── Optional advanced preprocessing (ROI crop + perspective correct) ───────
_PREPROC_PATH = Path(__file__).resolve().parent / "preprocessing.py"
try:
    _pp_spec = importlib.util.spec_from_file_location("preprocessing", _PREPROC_PATH)
    _pp_mod = importlib.util.module_from_spec(_pp_spec)
    _pp_spec.loader.exec_module(_pp_mod)  # type: ignore[union-attr]
    crop_receipt_roi = _pp_mod.crop_receipt_roi
    perspective_correct = _pp_mod.perspective_correct
    _HAS_ADVANCED_PREPROC = True
    # Optional: EXIF orientation + 4-rotation auto-orient. Only present in
    # newer preprocessing.py builds; degrade gracefully for older revisions.
    apply_exif_orientation = getattr(_pp_mod, "apply_exif_orientation", None)
    auto_orient_via_ocr = getattr(_pp_mod, "auto_orient_via_ocr", None)
    rotate_image = getattr(_pp_mod, "rotate_image", None)
except Exception:
    _HAS_ADVANCED_PREPROC = False
    apply_exif_orientation = None
    auto_orient_via_ocr = None
    rotate_image = None


# ── Preprocessing primitives ───────────────────────────────────────────────


def _deskew(gray):
    """Detect and correct small rotations (up to ~15 degrees)."""
    import numpy as np
    coords = np.column_stack(np.where(gray < 128))
    if len(coords) < 100:
        return gray
    rect = cv2.minAreaRect(coords)
    angle = rect[-1]
    # minAreaRect returns angles in [-90, 0); normalise to skew offset
    if angle < -45:
        angle = 90 + angle
    elif angle > 45:
        angle = angle - 90
    if abs(angle) < 0.3:
        return gray  # negligible skew
    h, w = gray.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(
        gray, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE,
    )


def _unsharp_mask(gray, amount: float = 1.5, sigma: float = 3.0):
    """Apply unsharp mask to sharpen text edges.

    Only useful on moderately soft images; very blurry images have lost the
    information already and sharpening just amplifies noise.
    """
    blurred = cv2.GaussianBlur(gray, (0, 0), sigma)
    return cv2.addWeighted(gray, 1.0 + amount, blurred, -amount, 0)


# Laplacian variance range where sharpening helps (moderate softness).
_SHARPEN_LAP_MIN = 500
_SHARPEN_LAP_MAX = 3000


def preprocess_base(img_path: Path, target_height: Optional[int] = None,
                    max_height: Optional[int] = None,
                    skip_denoise: Optional[bool] = None):
    """Shared preprocessing: ROI crop, perspective correct, upscale, deskew, (denoise).

    Defaults pull from the module-level speed knobs (env-var driven). Pass
    explicit values to override per call.

    Returns a grayscale ndarray ready for mode-specific finalization.
    Raises on failure (caller should handle).
    """
    if target_height is None: target_height = _TARGET_HEIGHT
    if max_height    is None: max_height    = _MAX_HEIGHT
    if skip_denoise  is None: skip_denoise  = _SKIP_DENOISE
    img = None
    # Try EXIF-aware load first (catches phone uploads with un-applied
    # orientation tags). Fall back to plain cv2.imread on any failure.
    if apply_exif_orientation is not None:
        img = apply_exif_orientation(str(img_path))
    if img is None:
        img = cv2.imread(str(img_path))
    if img is None:
        raise ValueError(f"cv2.imread returned None for {img_path}")

    raw_h, raw_w = img.shape[:2]
    rescue = _should_lowres_rescue(raw_h, raw_w)

    # Skip ROI crop + perspective when in rescue mode. Reasons:
    #  - The contour-based ROI crop is unreliable on small images (the
    #    receipt-vs-background contrast disappears after downsizing).
    #  - The perspective-correct step warps the image which compounds with
    #    the aggressive upscale to produce visible aliasing artifacts that
    #    confuse the CRAFT detector when run with relaxed thresholds.
    #  - Low-res images usually came from cropped/exported screenshots
    #    where the receipt already fills most of the frame anyway.
    if _HAS_ADVANCED_PREPROC and not rescue:
        img = crop_receipt_roi(img)
        img = perspective_correct(img)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)

    if rescue:
        # Aggressive single-step upscale to LOWRES_UPSCALE_TO height. Bicubic
        # interpolation; no further deskew/denoise (would amplify upscale
        # artifacts and isn't needed for the kinds of small phone exports
        # this branch targets). Combined with relaxed CRAFT thresholds in
        # EasyOCREngine.extract_detections, this recovers the price column
        # on receipts that are otherwise invisible to the default detector.
        scale = _LOWRES_UPSCALE_TO / gray.shape[0]
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        return gray  # skip the rest of the chain

    if gray.shape[0] < target_height:
        scale = target_height / gray.shape[0]
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    if gray.shape[0] > max_height:
        scale = max_height / gray.shape[0]
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

    gray = _deskew(gray)
    # fastNlMeansDenoising with searchWindowSize=21 is the slowest single op
    # in this pipeline (2-4s on a 2000px image). Skip it in fast mode — phone
    # photos have low enough sensor noise that the denoise mostly removes
    # detail rather than noise. Thermal/grainy receipts still benefit.
    if not skip_denoise:
        gray = cv2.fastNlMeansDenoising(gray, h=6, templateWindowSize=7, searchWindowSize=21)

    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if _SHARPEN_LAP_MIN <= lap_var <= _SHARPEN_LAP_MAX:
        gray = _unsharp_mask(gray, amount=1.5, sigma=3.0)

    return gray


def preprocess_finalize(gray, mode: str = "default") -> str:
    """Apply mode-specific thresholding and write to a temp PNG. Returns the PNG path."""
    if mode == "clahe":
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)
    elif mode == "binary":
        gray = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, 31, 10,
        )
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        gray = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel)
    else:
        gray = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, 31, 10,
        )

    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    cv2.imwrite(tmp.name, gray)
    return tmp.name


def preprocess(img_path: Path, target_height: Optional[int] = None,
               max_height: Optional[int] = None, mode: str = "default") -> str:
    """preprocess_base + preprocess_finalize, with safe fallback to original path.

    None for target_height / max_height → use the module-level speed knobs.
    """
    try:
        gray = preprocess_base(img_path, target_height, max_height)
        return preprocess_finalize(gray, mode)
    except Exception:
        return str(img_path)


# ── OCR Engine Interface ──────────────────────────────────────────────────


class OCREngine(abc.ABC):
    """Abstract base for pluggable OCR engines."""

    name: str = "base"

    @abc.abstractmethod
    def load(self) -> None:
        """Load model weights (called once)."""

    @abc.abstractmethod
    def extract(self, img_path: Path, do_preprocess: bool = True) -> list[str]:
        """Return flat token list from an image."""

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} ({self.name})>"


# ── EasyOCR ────────────────────────────────────────────────────────────────


class EasyOCREngine(OCREngine):
    name = "easyocr"

    def __init__(self):
        self._reader = None
        self._readtext_kwargs: dict = {}

    def load(self) -> None:
        import easyocr
        import inspect
        # gpu=True falls back to CPU automatically when CUDA isn't available.
        self._reader = easyocr.Reader(["en"], gpu=False, verbose=False)
        sig = inspect.signature(self._reader.readtext)
        # canvas_size is the largest dimension EasyOCR processes the image at.
        # 2048 → high-quality but slow (~10-30s on phone photos); 1280 cuts
        # inference time roughly in half with little accuracy loss on receipts.
        self._readtext_kwargs = {"detail": 1, "canvas_size": _CANVAS_SIZE}
        if "pin_memory" in sig.parameters:
            self._readtext_kwargs["pin_memory"] = False

    def extract_detections(
        self, img_path: Path, do_preprocess: bool = True,
        max_height: Optional[int] = None,
    ) -> list[tuple]:
        # Decide whether this image needs the low-res rescue *before* we
        # preprocess (so we know whether to relax CRAFT thresholds even when
        # preprocessing has already upscaled the file we hand to readtext).
        try:
            _img = cv2.imread(str(img_path))
            rescue = _img is not None and _should_lowres_rescue(*_img.shape[:2])
        except Exception:
            rescue = False

        proc = (
            preprocess(img_path, max_height=max_height, mode="clahe")
            if do_preprocess else str(img_path)
        )

        # Build the kwargs for this call. In rescue mode we lower the
        # detector thresholds so faint/small text gets emitted as boxes —
        # otherwise CRAFT silently skips the price column.
        call_kwargs = dict(self._readtext_kwargs)
        if rescue:
            call_kwargs.setdefault("text_threshold", 0.4)   # default 0.7
            call_kwargs.setdefault("low_text",       0.2)   # default 0.4
            call_kwargs.setdefault("link_threshold", 0.2)   # default 0.4

        try:
            return self._reader.readtext(proc, **call_kwargs)
        except Exception:
            # Pad with white border and retry — works around occasional
            # easyOCR boundary-condition errors on very tight crops.
            try:
                img = Image.open(proc).convert("RGB")
                padded = Image.new("RGB", (img.width + 4, img.height + 4), (255, 255, 255))
                padded.paste(img, (2, 2))
                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as t:
                    padded.save(t.name)
                    return self._reader.readtext(t.name, **call_kwargs)
            except Exception:
                return []

    def extract(self, img_path: Path, do_preprocess: bool = True) -> list[str]:
        return spatial_reorder(self.extract_detections(img_path, do_preprocess))


# ── PaddleOCR ──────────────────────────────────────────────────────────────


class PaddleOCREngine(OCREngine):
    name = "paddle"

    def __init__(self):
        self._ocr = None

    def load(self) -> None:
        import logging
        import os
        os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
        for n in ("ppocr", "paddle", "paddleocr", "paddlex"):
            logging.getLogger(n).setLevel(logging.ERROR)

        from paddleocr import PaddleOCR
        self._ocr = PaddleOCR(
            lang="en",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )

    def _results_to_detections(self, results) -> list[tuple]:
        if not results:
            return []
        detections = []
        for page in results:
            polys = page.get("dt_polys", [])
            texts = page.get("rec_texts", [])
            scores = page.get("rec_scores", [])
            for i, text in enumerate(texts):
                if not text or not text.strip():
                    continue
                bbox = polys[i].tolist() if i < len(polys) else [[0, 0]] * 4
                conf = scores[i] if i < len(scores) else 0.0
                detections.append((bbox, text, conf))
        return detections

    def extract_detections(
        self, img_path: Path, do_preprocess: bool = True,
    ) -> list[tuple]:
        # Cap PaddleOCR at 1200px to avoid multi-minute CPU times on phone photos.
        proc = preprocess(img_path, max_height=1200, mode="binary") if do_preprocess else str(img_path)
        try:
            results = list(self._ocr.predict(proc))
            return self._results_to_detections(results)
        except Exception:
            try:
                results = list(self._ocr.predict(str(img_path)))
                return self._results_to_detections(results)
            except Exception:
                return []

    def extract(self, img_path: Path, do_preprocess: bool = True) -> list[str]:
        return spatial_reorder(self.extract_detections(img_path, do_preprocess))


# ── Ensemble ───────────────────────────────────────────────────────────────


class EnsembleEngine(OCREngine):
    """EasyOCR + PaddleOCR with progressive early-exit and targeted re-OCR.

    Stages:
      1. Shared base preprocessing (one pass, both engines reuse).
      2. EasyOCR first (faster). If high-confidence + checksum-balanced, exit.
      3. Otherwise PaddleOCR + ``ensemble_merge``.
      4. ``_retarget_missing_prices`` re-OCRs Y-bands lacking a price detection
         at 3x upscale to recover faded/small price text.
    """

    name = "ensemble"

    def __init__(self):
        self._easy = EasyOCREngine()
        self._paddle = PaddleOCREngine()

    def load(self) -> None:
        self._easy.load()
        self._paddle.load()

    def extract_detections(
        self, img_path: Path, do_preprocess: bool = True,
    ) -> list[tuple]:
        from concurrent.futures import ThreadPoolExecutor

        if not do_preprocess:
            with ThreadPoolExecutor(max_workers=2) as pool:
                fut_easy = pool.submit(self._easy.extract_detections, img_path, False)
                fut_paddle = pool.submit(self._paddle.extract_detections, img_path, False)
                return ensemble_merge(fut_easy.result(), fut_paddle.result())

        try:
            gray_base = preprocess_base(img_path)
        except Exception:
            with ThreadPoolExecutor(max_workers=2) as pool:
                fut_easy = pool.submit(self._easy.extract_detections, img_path, True)
                fut_paddle = pool.submit(self._paddle.extract_detections, img_path, True)
                return ensemble_merge(fut_easy.result(), fut_paddle.result())

        proc_easy = preprocess_finalize(gray_base.copy(), mode="clahe")

        try:
            dets_easy = self._easy._reader.readtext(proc_easy, **self._easy._readtext_kwargs)
        except Exception:
            dets_easy = []

        # Progressive early-exit: skip Paddle if EasyOCR is already confident
        # AND its parse balances against subtotal/total within 2%.
        if len(dets_easy) >= 15:
            avg_conf = sum(d[2] for d in dets_easy) / len(dets_easy) if dets_easy else 0
            if avg_conf > 0.7:
                tokens = spatial_reorder(dets_easy)
                result = parse_receipt(tokens)
                items = result.get("items", [])
                target = result.get("subtotal") or result.get("total")
                if target and len(items) >= 3:
                    item_sum = sum(it.get("price", 0) for it in items)
                    if abs(item_sum - target) < max(target * 0.02, 0.50):
                        return dets_easy

        # PaddleOCR pass (cap to 1200px)
        gray_paddle = gray_base.copy()
        if gray_paddle.shape[0] > 1200:
            scale = 1200 / gray_paddle.shape[0]
            gray_paddle = cv2.resize(
                gray_paddle, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA,
            )
        proc_paddle = preprocess_finalize(gray_paddle, mode="binary")

        try:
            results = list(self._paddle._ocr.predict(proc_paddle))
            dets_paddle = self._paddle._results_to_detections(results)
        except Exception:
            dets_paddle = []

        return ensemble_merge(dets_easy, dets_paddle)

    def _retarget_missing_prices(
        self, merged: list[tuple], img_path: Path,
    ) -> list[tuple]:
        """Re-OCR Y-bands that have text tokens but no price detection."""
        if not merged:
            return merged

        orig = cv2.imread(str(img_path))
        if orig is None:
            return merged

        gray = cv2.cvtColor(orig, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape[:2]
        # Map preprocessed coords back to original image coords
        if h < 1500:
            scale = 1500 / h
        elif h > 2000:
            scale = 2000 / h
        else:
            scale = 1.0

        def _has_price(text: str) -> bool:
            return parse_price(normalise_token(text)) is not None

        entries = []
        for bbox, text, conf in merged:
            xs = [p[0] for p in bbox]
            ys = [p[1] for p in bbox]
            entries.append({
                "bbox": bbox, "text": text, "conf": conf,
                "y_mid": (min(ys) + max(ys)) / 2,
                "y_min": min(ys), "y_max": max(ys),
                "x_min": min(xs), "x_max": max(xs),
            })
        if not entries:
            return merged
        entries.sort(key=lambda e: e["y_mid"])

        bands: list[list[dict]] = []
        cur = [entries[0]]
        for e in entries[1:]:
            band_y = sum(b["y_mid"] for b in cur) / len(cur)
            if abs(e["y_mid"] - band_y) <= 20:
                cur.append(e)
            else:
                bands.append(cur)
                cur = [e]
        bands.append(cur)

        new_dets = list(merged)
        for band in bands:
            has_text = any(
                len(e["text"].strip()) >= 3 and not _has_price(e["text"]) for e in band
            )
            has_price = any(_has_price(e["text"]) for e in band)
            if not (has_text and not has_price):
                continue

            y_min = max(0, int(min(e["y_min"] for e in band) / scale) - 5)
            y_max = min(h, int(max(e["y_max"] for e in band) / scale) + 5)
            x_mid = w // 2
            crop = gray[y_min:y_max, x_mid:w]
            if crop.size == 0:
                continue
            crop = cv2.resize(crop, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
            crop = cv2.fastNlMeansDenoising(crop, h=10)
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4))
            crop = clahe.apply(crop)

            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                cv2.imwrite(tmp.name, crop)
                try:
                    re_dets = self._easy._reader.readtext(
                        tmp.name, **self._easy._readtext_kwargs,
                    )
                    for bbox2, text2, conf2 in re_dets:
                        if _has_price(text2) and conf2 >= 0.2:
                            xs2 = [p[0] / 3 + x_mid for p in bbox2]
                            ys2 = [p[1] / 3 + y_min for p in bbox2]
                            mapped = [
                                [min(xs2) * scale, min(ys2) * scale],
                                [max(xs2) * scale, min(ys2) * scale],
                                [max(xs2) * scale, max(ys2) * scale],
                                [min(xs2) * scale, max(ys2) * scale],
                            ]
                            new_dets.append((mapped, text2, conf2))
                except Exception:
                    pass
        return new_dets

    def extract(self, img_path: Path, do_preprocess: bool = True) -> list[str]:
        dets = self.extract_detections(img_path, do_preprocess)
        dets = self._retarget_missing_prices(dets, img_path)
        return spatial_reorder(dets, y_tolerance=15, force_band_order=True)


# ── Registry / factory ────────────────────────────────────────────────────


ENGINES: dict[str, type[OCREngine]] = {
    "easyocr": EasyOCREngine,
    "paddle": PaddleOCREngine,
    "ensemble": EnsembleEngine,
}


def create_engine(name: str, *, load: bool = True) -> OCREngine:
    """Instantiate an engine by name, optionally loading its model immediately."""
    if name not in ENGINES:
        raise ValueError(f"unknown engine {name!r}; available: {list(ENGINES)}")
    eng = ENGINES[name]()
    if load:
        eng.load()
    return eng


def get_available_engines() -> list[str]:
    """Return engine names whose dependencies are installed."""
    available: list[str] = []
    try:
        import easyocr  # noqa: F401
        available.append("easyocr")
    except ImportError:
        pass
    try:
        import paddleocr  # noqa: F401
        available.append("paddle")
    except ImportError:
        pass
    if "easyocr" in available and "paddle" in available:
        available.append("ensemble")
    return available
