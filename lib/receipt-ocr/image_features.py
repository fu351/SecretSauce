"""
image_features.py
=================
Extract cheap image-level features from a receipt image using OpenCV.

These features drive the heuristic model recommender that decides which
OCR engine/strategy to use *before* running OCR.  All extraction targets
<200ms per image on a modern laptop.

Dependencies: cv2, numpy (both already in the project).
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class ImageFeatures:
    """Lightweight descriptor of a receipt image's visual characteristics."""

    resolution_bucket: str       # "low" (<800px), "medium" (800–1500), "high" (>1500)
    height: int                  # raw image height in pixels
    width: int                   # raw image width in pixels
    contrast_stddev: float       # stddev of grayscale histogram (higher = more contrast)
    skew_angle: float            # estimated rotation in degrees (absolute value)
    laplacian_variance: float    # Laplacian-based blur/noise estimate (lower = blurrier)
    text_density: float          # ratio of Canny edge pixels to total image area
    is_thermal: bool             # True if grayscale with low colour variance
    estimated_dpi: float         # inferred from image width vs ~3-inch receipt width


# ── Constants ───────────────────────────────────────────────────────────────

_LOW_HEIGHT_THRESHOLD = 800
_HIGH_HEIGHT_THRESHOLD = 1500
_TYPICAL_RECEIPT_WIDTH_INCHES = 3.0


# ── Feature extraction ──────────────────────────────────────────────────────


def _resolution_bucket(height: int) -> str:
    """Classify image height into a resolution tier."""
    if height < _LOW_HEIGHT_THRESHOLD:
        return "low"
    if height <= _HIGH_HEIGHT_THRESHOLD:
        return "medium"
    return "high"


def _estimate_skew(gray: np.ndarray) -> float:
    """Estimate rotation angle using minAreaRect on dark pixels.

    Reuses the same logic as ``_deskew()`` in ``ocr_bench.py``.
    Returns the absolute skew angle in degrees.
    """
    coords = np.column_stack(np.where(gray < 128))
    if len(coords) < 100:
        return 0.0
    rect = cv2.minAreaRect(coords)
    angle = rect[-1]
    if angle < -45:
        angle = 90 + angle
    elif angle > 45:
        angle = angle - 90
    return abs(angle)


def _is_thermal(bgr: np.ndarray) -> bool:
    """Detect thermal receipt paper (greyscale with very low colour variance).

    Thermal receipts are printed on white paper with black/grey ink only.
    The colour channels have nearly identical values at every pixel.
    """
    if len(bgr.shape) < 3:
        # Already greyscale — likely thermal
        return True
    # Per-pixel max channel difference
    channel_range = bgr.max(axis=2).astype(np.float32) - bgr.min(axis=2).astype(np.float32)
    return float(np.mean(channel_range)) < 15.0


def _estimate_dpi(width_px: int) -> float:
    """Estimate DPI assuming the image captures a ~3-inch-wide receipt."""
    return width_px / _TYPICAL_RECEIPT_WIDTH_INCHES


def extract_image_features(image_path: str) -> ImageFeatures:
    """Extract all image features from a receipt image file.

    Parameters
    ----------
    image_path : str
        Path to the image file (JPEG, PNG, etc.).

    Returns
    -------
    ImageFeatures
        Dataclass with all computed features.

    Raises
    ------
    ValueError
        If the image cannot be read.
    """
    bgr = cv2.imread(str(image_path))
    if bgr is None:
        raise ValueError(f"cv2.imread returned None for {image_path}")

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]

    # Down-sample large images for faster feature computation
    if h > 2000:
        scale = 2000 / h
        small_gray = cv2.resize(gray, None, fx=scale, fy=scale,
                                interpolation=cv2.INTER_AREA)
    else:
        small_gray = gray

    # Contrast: stddev of the grayscale histogram
    contrast_stddev = float(np.std(small_gray.astype(np.float32)))

    # Skew angle (absolute)
    skew_angle = _estimate_skew(small_gray)

    # Blur/noise: Laplacian variance
    laplacian = cv2.Laplacian(small_gray, cv2.CV_64F)
    laplacian_variance = float(laplacian.var())

    # Text density: Canny edge pixel ratio
    edges = cv2.Canny(small_gray, 50, 150)
    text_density = float(np.count_nonzero(edges)) / edges.size

    return ImageFeatures(
        resolution_bucket=_resolution_bucket(h),
        height=h,
        width=w,
        contrast_stddev=contrast_stddev,
        skew_angle=skew_angle,
        laplacian_variance=laplacian_variance,
        text_density=text_density,
        is_thermal=_is_thermal(bgr),
        estimated_dpi=_estimate_dpi(w),
    )
