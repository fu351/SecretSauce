"""
test_model_recommender.py
=========================
Unit and integration tests for the image features extractor and the
heuristic model recommender.

Run with:
    pytest test_model_recommender.py -v
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

# ── Dynamic imports (match existing project convention) ─────────────���───────

_BASE = Path(__file__).resolve().parent.parent

def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, _BASE / filename)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod

_features_mod = _load("image_features", "image_features.py")
_recommender_mod = _load("model_recommender", "model_recommender.py")

ImageFeatures = _features_mod.ImageFeatures
extract_image_features = _features_mod.extract_image_features
Strategy = _recommender_mod.Strategy
Recommendation = _recommender_mod.Recommendation
recommend_strategy = _recommender_mod.recommend_strategy
should_escalate = _recommender_mod.should_escalate

SAMPLES_DIR = Path(__file__).resolve().parent / "samples"


# ============================================================================
# Tests for extract_image_features()
# ============================================================================


class TestExtractImageFeatures:
    """Verify feature extraction on real sample images."""

    @pytest.mark.skipif(
        not (SAMPLES_DIR / "1.jpg").exists(),
        reason="sample images not available",
    )
    def test_basic_extraction(self):
        """Features are extracted and have sane values."""
        feats = extract_image_features(str(SAMPLES_DIR / "1.jpg"))
        assert isinstance(feats, ImageFeatures)
        assert feats.resolution_bucket in ("low", "medium", "high")
        assert feats.height > 0
        assert feats.width > 0
        assert feats.contrast_stddev >= 0
        assert feats.skew_angle >= 0
        assert feats.laplacian_variance >= 0
        assert 0.0 <= feats.text_density <= 1.0
        assert isinstance(feats.is_thermal, bool)
        assert feats.estimated_dpi > 0

    @pytest.mark.skipif(
        not (SAMPLES_DIR / "5.jpg").exists(),
        reason="sample images not available",
    )
    def test_high_res_image(self):
        """A large image (5.jpg is 5MB) should report high resolution."""
        feats = extract_image_features(str(SAMPLES_DIR / "5.jpg"))
        assert feats.resolution_bucket in ("medium", "high")
        assert feats.height > 800

    @pytest.mark.skipif(
        not (SAMPLES_DIR / "2.jpg").exists(),
        reason="sample images not available",
    )
    def test_walmart_receipt(self):
        """Walmart receipt should have reasonable contrast and not be wildly skewed."""
        feats = extract_image_features(str(SAMPLES_DIR / "2.jpg"))
        assert feats.contrast_stddev > 10  # not a blank image
        assert feats.skew_angle < 30       # not absurdly rotated

    def test_invalid_path(self):
        with pytest.raises(ValueError, match="returned None"):
            extract_image_features("/nonexistent/image.jpg")


# ============================================================================
# Tests for recommend_strategy()
# ============================================================================


def _make_features(**overrides) -> ImageFeatures:
    """Create an ImageFeatures with sensible defaults, overriding as needed."""
    defaults = dict(
        resolution_bucket="medium",
        height=1200,
        width=900,
        contrast_stddev=70.0,
        skew_angle=1.0,
        laplacian_variance=200.0,
        text_density=0.08,
        is_thermal=False,
        estimated_dpi=300.0,
    )
    defaults.update(overrides)
    return ImageFeatures(**defaults)


class TestRecommendStrategy:
    """Verify heuristic branches in recommend_strategy()."""

    def test_default_medium_image_ensemble(self):
        """A medium-quality image with no strong signals → ensemble."""
        rec = recommend_strategy(_make_features())
        assert rec.strategy == Strategy.ENSEMBLE

    def test_low_contrast_favours_easyocr(self):
        """Low contrast should push toward EasyOCR."""
        feats = _make_features(contrast_stddev=25.0)
        rec = recommend_strategy(feats)
        assert rec.strategy in (Strategy.EASYOCR_ONLY, Strategy.ENSEMBLE)
        assert rec.easyocr_score > rec.paddle_score

    def test_high_contrast_favours_paddle(self):
        """High contrast should push toward PaddleOCR."""
        feats = _make_features(contrast_stddev=120.0)
        rec = recommend_strategy(feats)
        assert rec.strategy in (Strategy.PADDLEOCR_ONLY, Strategy.ENSEMBLE)
        assert rec.paddle_score > rec.easyocr_score

    def test_high_skew_favours_easyocr(self):
        """Highly skewed image should favour EasyOCR."""
        feats = _make_features(skew_angle=8.0)
        rec = recommend_strategy(feats)
        assert rec.easyocr_score > rec.paddle_score

    def test_thermal_favours_paddle(self):
        """Thermal receipt should favour PaddleOCR."""
        feats = _make_features(is_thermal=True)
        rec = recommend_strategy(feats)
        assert rec.paddle_score > rec.easyocr_score

    def test_low_resolution_forces_ensemble(self):
        """Low-resolution images should always use ensemble."""
        feats = _make_features(
            resolution_bucket="low",
            height=600,
            contrast_stddev=120.0,  # would normally pick PaddleOCR
        )
        rec = recommend_strategy(feats)
        assert rec.strategy == Strategy.ENSEMBLE

    def test_noisy_image_forces_ensemble(self):
        """Very blurry/noisy images should use ensemble."""
        feats = _make_features(laplacian_variance=30.0)
        rec = recommend_strategy(feats)
        assert rec.strategy == Strategy.ENSEMBLE

    def test_store_hint_boost_easyocr(self):
        """Store hint for EasyOCR-preferred store should boost EasyOCR score."""
        feats = _make_features()
        rec = recommend_strategy(feats, store_hint="Whole Foods")
        assert rec.easyocr_score > 0
        assert "store hint" in " ".join(rec.reasons)

    def test_store_hint_boost_paddle(self):
        """Store hint for PaddleOCR-preferred store should boost PaddleOCR score."""
        feats = _make_features()
        rec = recommend_strategy(feats, store_hint="Trader Joe's")
        assert rec.paddle_score > 0
        assert "store hint" in " ".join(rec.reasons)

    def test_unknown_store_hint_ignored(self):
        """An unknown store hint should not affect the score."""
        feats = _make_features()
        rec_no_hint = recommend_strategy(feats)
        rec_unknown = recommend_strategy(feats, store_hint="UnknownStore123")
        assert rec_no_hint.easyocr_score == rec_unknown.easyocr_score

    def test_confidence_bounded(self):
        """Confidence should always be in [0, 1]."""
        for contrast in [10, 50, 90, 130]:
            for skew in [0, 3, 10]:
                feats = _make_features(contrast_stddev=float(contrast),
                                       skew_angle=float(skew))
                rec = recommend_strategy(feats)
                assert 0.0 <= rec.confidence <= 1.0

    def test_strong_easyocr_signals_pick_easyocr(self):
        """Multiple EasyOCR signals combined should pick EASYOCR_ONLY."""
        feats = _make_features(
            contrast_stddev=25.0,   # low contrast → EasyOCR (+2.0)
            skew_angle=8.0,         # high skew → EasyOCR (+1.5)
        )
        rec = recommend_strategy(feats, store_hint="Whole Foods")  # easyocr pref (+2.5)
        assert rec.strategy == Strategy.EASYOCR_ONLY

    def test_strong_paddle_signals_pick_paddle(self):
        """Multiple PaddleOCR signals combined should pick PADDLEOCR_ONLY."""
        feats = _make_features(
            contrast_stddev=120.0,  # high contrast → PaddleOCR (-2.0)
            is_thermal=True,        # thermal → PaddleOCR (-1.5)
        )
        rec = recommend_strategy(feats, store_hint="Trader Joe's")  # paddle pref (-2.5)
        assert rec.strategy == Strategy.PADDLEOCR_ONLY


# ============================================================================
# Tests for should_escalate()
# ============================================================================


class TestShouldEscalate:
    """Verify escalation logic on mock parse results."""

    def test_good_result_no_escalation(self):
        """A complete, valid parse result should not escalate."""
        result = {
            "store": "Walmart",
            "total": 49.90,
            "subtotal": 46.44,
            "taxes": [{"rate": "TAX", "amount": 3.46}],
            "items": [
                {"name": "ITEM A", "quantity": 1, "price": 10.0},
                {"name": "ITEM B", "quantity": 1, "price": 15.0},
                {"name": "ITEM C", "quantity": 1, "price": 21.44},
            ],
        }
        assert should_escalate(result) is False

    def test_too_few_items(self):
        """Fewer than 2 items should trigger escalation."""
        result = {
            "store": "Walmart",
            "total": 5.00,
            "items": [{"name": "ITEM", "quantity": 1, "price": 5.0}],
        }
        assert should_escalate(result) is True

    def test_no_items(self):
        """Empty items list should trigger escalation."""
        result = {"store": "Walmart", "total": 5.00, "items": []}
        assert should_escalate(result) is True

    def test_no_total(self):
        """Missing total should trigger escalation."""
        result = {
            "store": "Walmart",
            "total": None,
            "items": [
                {"name": "A", "quantity": 1, "price": 1.0},
                {"name": "B", "quantity": 1, "price": 2.0},
            ],
        }
        assert should_escalate(result) is True

    def test_unknown_store(self):
        """Unknown store should trigger escalation."""
        result = {
            "store": "Unknown",
            "total": 10.0,
            "items": [
                {"name": "A", "quantity": 1, "price": 5.0},
                {"name": "B", "quantity": 1, "price": 5.0},
            ],
        }
        assert should_escalate(result) is True

    def test_none_store(self):
        """None store should trigger escalation."""
        result = {
            "store": None,
            "total": 10.0,
            "items": [
                {"name": "A", "quantity": 1, "price": 5.0},
                {"name": "B", "quantity": 1, "price": 5.0},
            ],
        }
        assert should_escalate(result) is True

    def test_checksum_mismatch(self):
        """Subtotal + tax != total should trigger escalation."""
        result = {
            "store": "Walmart",
            "subtotal": 40.0,
            "total": 49.90,
            "taxes": [{"rate": "TAX", "amount": 3.00}],
            "items": [
                {"name": "A", "quantity": 1, "price": 20.0},
                {"name": "B", "quantity": 1, "price": 20.0},
            ],
        }
        # subtotal(40) + tax(3) = 43 != 49.90 → escalate
        assert should_escalate(result) is True

    def test_checksum_within_tolerance(self):
        """Subtotal + tax close to total should not escalate (within $0.05)."""
        result = {
            "store": "Walmart",
            "subtotal": 46.44,
            "total": 49.90,
            "taxes": [{"rate": "TAX", "amount": 3.44}],
            "items": [
                {"name": "A", "quantity": 1, "price": 23.0},
                {"name": "B", "quantity": 1, "price": 23.44},
            ],
        }
        # subtotal(46.44) + tax(3.44) = 49.88, |49.88 - 49.90| = 0.02 < 0.05
        assert should_escalate(result) is False

    def test_no_taxes_no_subtotal_ok(self):
        """Missing subtotal/taxes should not trigger checksum mismatch."""
        result = {
            "store": "Walmart",
            "total": 10.0,
            "items": [
                {"name": "A", "quantity": 1, "price": 5.0},
                {"name": "B", "quantity": 1, "price": 5.0},
            ],
        }
        assert should_escalate(result) is False
