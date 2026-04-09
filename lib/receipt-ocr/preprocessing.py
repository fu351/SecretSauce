"""
preprocessing.py
================
Advanced image preprocessing for receipt OCR.

Provides receipt ROI cropping and perspective correction using OpenCV.
These run *before* the existing preprocess() pipeline in ocr_bench.py.

Dependencies: cv2, numpy (already in the project).
"""
from __future__ import annotations

import cv2
import numpy as np


# ── Constants ───────────────────────────────────────────────────────────────

# ROI contour must cover between 15% and 95% of image area to be valid.
_ROI_MIN_AREA_RATIO = 0.15
_ROI_MAX_AREA_RATIO = 0.95
_ROI_PADDING_RATIO = 0.02          # 2% padding around detected receipt

# Perspective correction: contour must cover >20% of image to be a receipt.
_PERSP_MIN_AREA_RATIO = 0.20


# ── ROI Cropping ────────────────────────────────────────────────────────────


def crop_receipt_roi(img: np.ndarray) -> np.ndarray:
    """Detect and crop to the receipt region-of-interest.

    Uses edge detection and contour analysis to find the largest rectangular
    region in the image.  If the receipt fills most of the frame already
    (>95% area), or no clear region is found, returns the original image.

    Parameters
    ----------
    img : np.ndarray
        BGR or grayscale input image.

    Returns
    -------
    np.ndarray
        Cropped image (same colour space as input).
    """
    h, w = img.shape[:2]
    total_area = h * w

    # Convert to grayscale for contour detection
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img.copy()

    # Blur + Otsu threshold to segment receipt from background
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Invert if receipt is white-on-dark (more white pixels than black)
    if np.count_nonzero(thresh) > total_area * 0.5:
        thresh = cv2.bitwise_not(thresh)

    # Find external contours
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return img

    # Take the largest contour
    largest = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(largest)
    ratio = area / total_area

    if ratio < _ROI_MIN_AREA_RATIO or ratio > _ROI_MAX_AREA_RATIO:
        return img  # no clear receipt or already fills frame

    # Crop to bounding rect with padding
    x, y, cw, ch = cv2.boundingRect(largest)
    pad_x = int(w * _ROI_PADDING_RATIO)
    pad_y = int(h * _ROI_PADDING_RATIO)
    x1 = max(0, x - pad_x)
    y1 = max(0, y - pad_y)
    x2 = min(w, x + cw + pad_x)
    y2 = min(h, y + ch + pad_y)

    return img[y1:y2, x1:x2]


# ── Perspective Correction ──────────────────────────────────────────────────


def _order_points(pts: np.ndarray) -> np.ndarray:
    """Order 4 points as: top-left, top-right, bottom-right, bottom-left."""
    rect = np.zeros((4, 2), dtype=np.float32)
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]   # top-left has smallest sum
    rect[2] = pts[np.argmax(s)]   # bottom-right has largest sum
    d = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(d)]   # top-right has smallest difference
    rect[3] = pts[np.argmax(d)]   # bottom-left has largest difference
    return rect


def perspective_correct(img: np.ndarray) -> np.ndarray:
    """Correct perspective distortion if the receipt is photographed at an angle.

    Detects a quadrilateral contour that likely represents the receipt edge,
    then applies a perspective warp to produce a top-down view.

    If no suitable quadrilateral is found, returns the original image unchanged.

    Parameters
    ----------
    img : np.ndarray
        BGR or grayscale input image.

    Returns
    -------
    np.ndarray
        Perspective-corrected image (same colour space).
    """
    h, w = img.shape[:2]
    total_area = h * w

    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img.copy()

    # Edge detection
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)

    # Dilate to close small gaps in edges
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edges = cv2.dilate(edges, kernel, iterations=1)

    # Find contours, sorted by area
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)

    # Look for a 4-point contour that covers enough of the image
    for contour in contours[:5]:  # check top 5 largest
        area = cv2.contourArea(contour)
        if area < total_area * _PERSP_MIN_AREA_RATIO:
            break  # remaining contours are smaller

        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * peri, True)

        if len(approx) == 4:
            pts = _order_points(approx.reshape(4, 2).astype(np.float32))

            # Compute output dimensions
            width_top = np.linalg.norm(pts[1] - pts[0])
            width_bot = np.linalg.norm(pts[2] - pts[3])
            height_left = np.linalg.norm(pts[3] - pts[0])
            height_right = np.linalg.norm(pts[2] - pts[1])

            out_w = int(max(width_top, width_bot))
            out_h = int(max(height_left, height_right))

            if out_w < 50 or out_h < 50:
                continue  # too small

            dst = np.array([
                [0, 0],
                [out_w - 1, 0],
                [out_w - 1, out_h - 1],
                [0, out_h - 1],
            ], dtype=np.float32)

            M = cv2.getPerspectiveTransform(pts, dst)
            warped = cv2.warpPerspective(img, M, (out_w, out_h))
            return warped

    return img  # no suitable quadrilateral found
