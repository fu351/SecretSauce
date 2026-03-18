from __future__ import annotations

import json
import sys
import types
import unittest
from pathlib import Path


SCRIPTS_DIR = Path(__file__).resolve().parents[2]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

try:
    import requests  # type: ignore
except ModuleNotFoundError:
    requests = types.ModuleType("requests")

    class _RequestException(Exception):
        pass

    class _Timeout(_RequestException):
        pass

    requests.exceptions = types.SimpleNamespace(  # type: ignore[attr-defined]
        RequestException=_RequestException,
        Timeout=_Timeout,
    )
    sys.modules["requests"] = requests

try:
    import ijson  # type: ignore  # noqa: F401
except ModuleNotFoundError:
    ijson = types.ModuleType("ijson")

    def _items(stream, path):
        payload = json.loads(stream.read().decode("utf-8"))
        if path != "features.item":
            return iter(())
        return iter(payload.get("features", []))

    ijson.items = _items  # type: ignore[attr-defined]
    sys.modules["ijson"] = ijson

from store_maintenance_utils import alltheplaces  # noqa: E402


class FakeResponse:
    def __init__(self, status_code: int, content: bytes = b"{}"):
        self.status_code = status_code
        self.content = content

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class FakeSession:
    def __init__(self, responses: dict[str, FakeResponse | Exception]):
        self.responses = responses
        self.calls: list[str] = []

    def get(self, url: str, timeout: int = 120):
        self.calls.append(url)
        response = self.responses.get(url)
        if isinstance(response, Exception):
            raise response
        return response or FakeResponse(404, b"{}")


class AllThePlacesTests(unittest.TestCase):
    def test_build_spider_candidates_dedupes_and_adds_fallback(self):
        candidates = alltheplaces.build_spider_candidates(
            "target_us",
            spider_aliases={"target_us": ["target", "target"]},
        )
        self.assertEqual(candidates, ["target_us", "target"])

    def test_fetch_features_with_fallback_uses_alias_endpoint(self):
        payload = (
            b'{"type":"FeatureCollection","features":[{"type":"Feature",'
            b'"properties":{"name":"Test Store"},"geometry":{"type":"Point","coordinates":[1,2]}}]}'
        )
        responses = {
            "https://primary/target_us.geojson": FakeResponse(404),
            "https://secondary/target_us.geojson": FakeResponse(404),
            "https://primary/target.geojson": FakeResponse(200, payload),
        }
        session = FakeSession(responses)

        resolved_spider, resolved_url, features = alltheplaces.fetch_features_with_fallback(
            session=session,
            spider_name="target_us",
            output_bases=["https://primary", "https://secondary"],
            spider_aliases={"target_us": ["target"]},
        )

        self.assertEqual(resolved_spider, "target")
        self.assertEqual(resolved_url, "https://primary/target.geojson")
        self.assertEqual(
            session.calls,
            [
                "https://primary/target_us.geojson",
                "https://secondary/target_us.geojson",
                "https://primary/target.geojson",
            ],
        )
        parsed = list(features)
        self.assertEqual(len(parsed), 1)
        self.assertEqual(parsed[0]["properties"]["name"], "Test Store")

    def test_fetch_features_with_fallback_raises_with_attempt_details(self):
        session = FakeSession(
            {
                "https://primary/walmart_us.geojson": requests.exceptions.Timeout("timed out"),
                "https://secondary/walmart_us.geojson": FakeResponse(404),
            }
        )

        with self.assertRaises(requests.exceptions.RequestException) as context:
            alltheplaces.fetch_features_with_fallback(
                session=session,
                spider_name="walmart_us",
                output_bases=["https://primary", "https://secondary"],
                spider_aliases={"walmart_us": []},
            )

        message = str(context.exception)
        self.assertIn("Unable to fetch spider 'walmart_us'", message)
        self.assertIn("https://primary/walmart_us.geojson", message)
        self.assertIn("https://secondary/walmart_us.geojson", message)


if __name__ == "__main__":
    unittest.main()
