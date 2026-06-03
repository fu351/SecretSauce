#!/usr/bin/env python3
"""
annotate_receipts.py
====================
Local interactive bulk-annotation tool for the receipt training set.

Point it at a folder of receipt images. It:
  1. Walks the folder, dedupes by SHA256 against your Supabase training
     table so re-running is safe.
  2. Runs the production OCR pipeline (engines.py + receipt_parser.py)
     on each image, in the background, so the UI stays snappy.
  3. Opens a small browser UI showing the receipt next to the parsed
     fields. You confirm / edit / reject with keyboard shortcuts.
  4. Persists every accepted change to a local SQLite journal *before*
     touching Supabase. A background worker drains the journal, retries
     on failure, and only marks rows "done" after Supabase confirms.
  5. Auto-saves form edits as you type and again on navigation, so
     accidentally closing the tab or hitting an arrow key never loses
     work.

Why journal-first?
------------------
"Accepted = saved" should mean *durably* saved. The naive flow (POST →
upload to Supabase → show success) has three failure modes that all lose
work: network blip mid-upload, Supabase rate-limit, browser tab closed
between confirm and ack. The journal eliminates all three: writes hit a
local SQLite file synchronously, the worker handles Supabase async with
exponential backoff, and the UI shows you exactly how many rows are
still in flight.

Usage
-----
    # Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    # Optional env: OPENAI_API_KEY (only if you click "Re-parse with LLM")

    python lib/receipt-ocr/test/annotate_receipts.py \\
        --images ~/Pictures/receipts \\
        --port 8765 \\
        --annotator yoon

Then open http://localhost:8765 in your browser.

Keyboard shortcuts
------------------
    Enter / Y   Confirm the current parse + save to Supabase
    Cmd-S       Save edits explicitly
    R           Reject (don't save to training set)
    S           Skip (decide later — re-runs will pick this back up)
    →           Next image (auto-saves draft first)
    ←           Previous image (auto-saves draft first)
    E           Focus the first edit field

CLI flags
---------
    --images PATH     Folder of receipt images (recursively scanned)
    --port N          Local server port (default: 8765)
    --annotator NAME  Stored in verified_by; defaults to your $USER
    --engine NAME     easyocr | paddle | ensemble (default: easyocr)
    --no-open         Don't auto-open the browser
    --extensions      Comma-separated extensions (default: jpg,jpeg,png,heic,heif,webp)
    --journal PATH    Override journal SQLite path (default:
                      <images>/.annotate_journal.db, or ~/.secretsauce/...
                      if the images folder is read-only)
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import os
import sqlite3
import sys
import asyncio
import threading
import time
import traceback
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Optional

# Pulled up to module level so `from __future__ import annotations` doesn't
# turn `Request` into a string annotation that FastAPI's get_type_hints()
# can't resolve (it would otherwise look in module globals for `Request`,
# fail to find it because it was imported inside build_app, and treat the
# parameter as a query string instead of the request body).
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse


# ── GPT-4o vision rescue (optional; only used when user presses 'L') ──────
# Same model + prompt shape as python-api/main.py's _parse_with_llm_vision.
# Wired here because the local annotation tool talks to engines.py directly,
# not through the FastAPI service.
_OPENAI_MODEL_VISION = "gpt-4o-mini"
_OPENAI_PRICE_INPUT  = 0.15  / 1_000_000   # USD per input token
_OPENAI_PRICE_OUTPUT = 0.60  / 1_000_000   # USD per output token

_LLM_RECEIPT_SCHEMA = """{
  "store": "string (best-guess store/merchant name, or 'Unknown')",
  "date": "string|null (YYYY-MM-DD if visible)",
  "items": [
    {"name": "string", "quantity": int, "price": float}
  ],
  "subtotal": "float|null",
  "taxes": [{"rate": float, "amount": float}],
  "total": "float|null"
}"""


def _coerce_llm_result(raw: dict) -> dict:
    """Normalise the LLM output into the shape parse_receipt() returns.
    Mirrors the helper in python-api/main.py."""
    def _to_float(v):
        if v is None: return None
        if isinstance(v, (int, float)): return float(v)
        if isinstance(v, str):
            try:
                return float(v.replace(",", "").replace("$", "").strip())
            except ValueError:
                return None
        return None

    out = {
        "store": str(raw.get("store") or "Unknown"),
        "date": raw.get("date") or None,
        "subtotal": _to_float(raw.get("subtotal")),
        "total": _to_float(raw.get("total")),
        "items": [],
        "taxes": [],
    }
    for it in raw.get("items") or []:
        if not isinstance(it, dict): continue
        name = str(it.get("name") or "").strip()
        if not name: continue
        try:
            qty = int(it.get("quantity") or 1)
        except (TypeError, ValueError):
            qty = 1
        price = _to_float(it.get("price"))
        if price is None: continue
        out["items"].append({"name": name, "quantity": qty, "price": price})
    taxes_raw = raw.get("taxes")
    if isinstance(taxes_raw, dict): taxes_raw = [taxes_raw]
    for t in taxes_raw or []:
        if not isinstance(t, dict): continue
        amt = _to_float(t.get("amount"))
        if amt is None: continue
        out["taxes"].append({"rate": _to_float(t.get("rate")) or 0.0, "amount": amt})
    return out


def _parse_via_gpt_vision(image_path: Path) -> tuple[dict, float]:
    """Call GPT-4o-mini vision on an image. Returns (parsed_dict, cost_usd)."""
    try:
        from openai import OpenAI
    except ImportError as e:
        raise RuntimeError(
            f"openai SDK missing: {e}. pip install 'openai>=1.20'"
        ) from e
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY env var not set")

    import base64
    body = image_path.read_bytes()
    suffix = image_path.suffix.lower().lstrip(".")
    mime = {
        "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
        "webp": "image/webp", "heic": "image/heic", "heif": "image/heif",
    }.get(suffix, "image/jpeg")
    b64 = base64.b64encode(body).decode()

    client = OpenAI()
    resp = client.chat.completions.create(
        model=_OPENAI_MODEL_VISION,
        temperature=0.0,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system",
             "content": "You are a precise receipt parser. Output JSON only."},
            {"role": "user", "content": [
                {"type": "text",
                 "text": (
                     "Parse this grocery receipt into JSON matching this schema:\n"
                     f"{_LLM_RECEIPT_SCHEMA}\n\n"
                     "Rules: output strict JSON only, use null when unknown, "
                     "do NOT invent values, skip non-item lines (totals/taxes/"
                     "payment), and put line totals (qty * unit_price) in the "
                     "price field."
                 )},
                {"type": "image_url",
                 "image_url": {"url": f"data:{mime};base64,{b64}"}},
            ]},
        ],
    )
    raw = resp.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {}

    usage = getattr(resp, "usage", None)
    cost = 0.0
    if usage is not None:
        cost = (
            (getattr(usage, "prompt_tokens", 0) or 0) * _OPENAI_PRICE_INPUT
            + (getattr(usage, "completion_tokens", 0) or 0) * _OPENAI_PRICE_OUTPUT
        )
    return _coerce_llm_result(parsed), cost

# ── Module loaders (mirror ocr_bench.py pattern) ──────────────────────────

_TEST_DIR = Path(__file__).resolve().parent
_LIB_DIR = _TEST_DIR.parent


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules.setdefault(name, mod)
    spec.loader.exec_module(mod)
    return mod


# Load receipt_parser eagerly (stdlib only, fast). Defer the heavy modules.
_parser_mod = _load("receipt_parser", _LIB_DIR / "receipt_parser.py")
_engines_mod: Any = None


def _ensure_engine(engine_name: str):
    global _engines_mod
    if _engines_mod is None:
        _engines_mod = _load("engines", _LIB_DIR / "engines.py")
    return _engines_mod.create_engine(engine_name, load=True)


# ── Supabase ──────────────────────────────────────────────────────────────


def _supabase():
    try:
        from supabase import create_client
    except ImportError as e:
        sys.exit(f"supabase SDK missing: {e}\n  pip install supabase")
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit(
            "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars not set.\n"
            "Set them before running this tool — same vars used by python-api."
        )
    return create_client(url, key)


TRAINING_BUCKET = "receipt-training-images"


def fetch_known_sha256s(client) -> set[str]:
    """Pull every existing image_sha256 from Supabase so we can dedupe."""
    rows = (
        client.table("receipt_training_examples")
        .select("image_sha256")
        .is_("deleted_at", "null")
        .not_.is_("image_sha256", "null")
        .execute()
        .data
        or []
    )
    return {r["image_sha256"] for r in rows if r.get("image_sha256")}


# ── SHA helpers ───────────────────────────────────────────────────────────


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _now_iso() -> str:
    return dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


# ── JournalDB: SQLite store for verifications + drafts ────────────────────


class JournalDB:
    """Local SQLite-backed journal for verifications and form drafts.

    Two tables:
      verifications  — accepted parses awaiting (or completed) Supabase upload
      drafts         — in-progress edits, auto-saved as the user types

    Uses WAL mode + per-call connections so the request thread, background
    worker, and main thread can all read/write concurrently without explicit
    locking on the application side.
    """

    SCHEMA = """
    CREATE TABLE IF NOT EXISTS verifications (
        sha256             TEXT PRIMARY KEY,
        image_path         TEXT NOT NULL,
        verified_parse     TEXT NOT NULL,
        candidate_parse    TEXT NOT NULL,
        ocr_signals        TEXT NOT NULL,
        annotator          TEXT NOT NULL,
        created_at         TEXT NOT NULL,
        upload_status      TEXT NOT NULL CHECK (upload_status IN ('pending', 'done', 'failed')),
        upload_attempts    INTEGER NOT NULL DEFAULT 0,
        last_attempt_at    TEXT,
        last_error         TEXT,
        supabase_id        TEXT
    );

    CREATE TABLE IF NOT EXISTS drafts (
        sha256       TEXT PRIMARY KEY,
        draft_parse  TEXT NOT NULL,
        updated_at   TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_verifications_pending
        ON verifications (upload_status, last_attempt_at);
    """

    def __init__(self, db_path: Path):
        self.db_path = db_path
        # Make sure the parent dir exists.
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as c:
            c.executescript(self.SCHEMA)

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(self.db_path, timeout=30.0, isolation_level=None)
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA synchronous=NORMAL")
        return c

    # -- verifications -----------------------------------------------------

    def record_verification(
        self, *, sha: str, image_path: Path, verified_parse: dict,
        candidate_parse: dict, ocr_signals: dict, annotator: str,
    ) -> None:
        """Write (or update) a verification. Always sets status='pending'
        unless it was already 'done' (idempotent on the happy path)."""
        with self._conn() as c:
            c.execute(
                """
                INSERT INTO verifications
                    (sha256, image_path, verified_parse, candidate_parse,
                     ocr_signals, annotator, created_at, upload_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
                ON CONFLICT(sha256) DO UPDATE SET
                    verified_parse  = excluded.verified_parse,
                    candidate_parse = excluded.candidate_parse,
                    ocr_signals     = excluded.ocr_signals,
                    annotator       = excluded.annotator,
                    -- Re-edit of an already-uploaded row stays 'done' (we
                    -- don't currently re-upload edits — TODO if you want).
                    upload_status   = CASE
                        WHEN verifications.upload_status = 'done' THEN 'done'
                        ELSE 'pending'
                    END,
                    upload_attempts = 0,
                    last_error      = NULL
                """,
                (sha, str(image_path), json.dumps(verified_parse),
                 json.dumps(candidate_parse), json.dumps(ocr_signals),
                 annotator, _now_iso()),
            )

    def fetch_pending(self, limit: int = 50) -> list[dict]:
        """Pending uploads ordered by last_attempt_at NULLS FIRST so brand-new
        rows go first. Failed rows that have been retried many times sink."""
        with self._conn() as c:
            cur = c.execute(
                """
                SELECT sha256, image_path, verified_parse, candidate_parse,
                       ocr_signals, annotator, upload_attempts
                FROM verifications
                WHERE upload_status = 'pending'
                ORDER BY upload_attempts ASC, last_attempt_at ASC NULLS FIRST
                LIMIT ?
                """,
                (limit,),
            )
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]

    def mark_done(self, sha: str, supabase_id: str) -> None:
        with self._conn() as c:
            c.execute(
                """
                UPDATE verifications
                SET upload_status = 'done', supabase_id = ?, last_error = NULL,
                    last_attempt_at = ?
                WHERE sha256 = ?
                """,
                (supabase_id, _now_iso(), sha),
            )

    def mark_attempt(self, sha: str, error: Optional[str]) -> None:
        """Record a failed-or-retrying attempt without flipping to 'failed'
        permanently (we keep retrying). Capped at 20 attempts → mark failed."""
        with self._conn() as c:
            cur = c.execute(
                "SELECT upload_attempts FROM verifications WHERE sha256 = ?",
                (sha,),
            ).fetchone()
            attempts = (cur[0] if cur else 0) + 1
            new_status = "failed" if attempts >= 20 else "pending"
            c.execute(
                """
                UPDATE verifications
                SET upload_attempts = ?, last_error = ?, last_attempt_at = ?,
                    upload_status = ?
                WHERE sha256 = ?
                """,
                (attempts, (error or "")[:2000], _now_iso(), new_status, sha),
            )

    def stats(self) -> dict:
        with self._conn() as c:
            cur = c.execute(
                "SELECT upload_status, COUNT(*) FROM verifications GROUP BY upload_status"
            )
            counts = {row[0]: row[1] for row in cur.fetchall()}
            return {
                "verified_pending": counts.get("pending", 0),
                "verified_done":    counts.get("done", 0),
                "verified_failed":  counts.get("failed", 0),
            }

    def status_for(self, sha: str) -> Optional[dict]:
        with self._conn() as c:
            cur = c.execute(
                "SELECT upload_status, upload_attempts, last_error, supabase_id "
                "FROM verifications WHERE sha256 = ?",
                (sha,),
            ).fetchone()
            if not cur:
                return None
            return {
                "upload_status": cur[0],
                "upload_attempts": cur[1],
                "last_error": cur[2],
                "supabase_id": cur[3],
            }

    # -- drafts ------------------------------------------------------------

    def save_draft(self, sha: str, draft_parse: dict) -> None:
        with self._conn() as c:
            c.execute(
                """
                INSERT INTO drafts (sha256, draft_parse, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(sha256) DO UPDATE SET
                    draft_parse = excluded.draft_parse,
                    updated_at  = excluded.updated_at
                """,
                (sha, json.dumps(draft_parse), _now_iso()),
            )

    def get_draft(self, sha: str) -> Optional[dict]:
        with self._conn() as c:
            cur = c.execute(
                "SELECT draft_parse FROM drafts WHERE sha256 = ?", (sha,),
            ).fetchone()
            if not cur:
                return None
            try:
                return json.loads(cur[0])
            except json.JSONDecodeError:
                return None

    def clear_draft(self, sha: str) -> None:
        with self._conn() as c:
            c.execute("DELETE FROM drafts WHERE sha256 = ?", (sha,))


# ── UploaderWorker: drains journal → Supabase ─────────────────────────────


class UploaderWorker(threading.Thread):
    """Background thread that uploads pending verifications to Supabase.

    Polls the journal every POLL_INTERVAL_S. On Supabase failure, increments
    the attempt counter; the journal's `mark_attempt` flips status to 'failed'
    after MAX_ATTEMPTS so we stop retrying obviously-broken rows.
    """

    POLL_INTERVAL_S = 3.0
    BATCH_SIZE = 20

    def __init__(self, journal: JournalDB, sb_client, annotator: str):
        super().__init__(daemon=True, name="UploaderWorker")
        self.journal = journal
        self.sb = sb_client
        self.annotator = annotator
        self._stop_evt = threading.Event()

    def stop(self) -> None:
        self._stop_evt.set()

    def run(self) -> None:
        while not self._stop_evt.is_set():
            try:
                self._drain_once()
            except Exception:
                # Never let the worker die — log and keep polling.
                traceback.print_exc(file=sys.stderr)
            self._stop_evt.wait(self.POLL_INTERVAL_S)

    def _drain_once(self) -> None:
        pending = self.journal.fetch_pending(limit=self.BATCH_SIZE)
        if not pending:
            return
        for entry in pending:
            if self._stop_evt.is_set():
                return
            self._upload_one(entry)

    def _upload_one(self, entry: dict) -> None:
        sha = entry["sha256"]
        try:
            verified_parse = json.loads(entry["verified_parse"])
            candidate_parse = json.loads(entry["candidate_parse"])
            ocr_signals = json.loads(entry["ocr_signals"])
        except json.JSONDecodeError as e:
            self.journal.mark_attempt(sha, f"corrupt journal row: {e}")
            return

        image_path = Path(entry["image_path"])
        if not image_path.exists():
            self.journal.mark_attempt(sha, "image file no longer exists on disk")
            return

        try:
            sb_id = self._upload_to_supabase(
                sha=sha, image_path=image_path,
                verified_parse=verified_parse,
                candidate_parse=candidate_parse,
                ocr_signals=ocr_signals,
            )
        except _AlreadyExists as e:
            # Another session already uploaded this SHA. The data is in
            # Supabase — mark done so we stop retrying.
            self.journal.mark_done(sha, e.existing_id or "(deduped)")
            return
        except Exception as e:
            self.journal.mark_attempt(sha, f"{type(e).__name__}: {e}")
            return
        self.journal.mark_done(sha, sb_id)

    def _upload_to_supabase(
        self, *, sha: str, image_path: Path,
        verified_parse: dict, candidate_parse: dict, ocr_signals: dict,
    ) -> str:
        """Upload the image + insert the row. Returns the new row id."""
        ext_map = {
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
            ".webp": "image/webp", ".heic": "image/heic", ".heif": "image/heif",
        }
        ext = image_path.suffix.lower()
        mime = ext_map.get(ext, "image/jpeg")
        safe_ext = ext.lstrip(".") or "jpg"
        path = f"_seed/{self.annotator}/{sha[:2]}/{sha}.{safe_ext}"

        # Upload (idempotent thanks to upsert: true).
        body = image_path.read_bytes()
        try:
            self.sb.storage.from_(TRAINING_BUCKET).upload(
                path, body, {"content-type": mime, "upsert": "true"},
            )
        except Exception as e:
            msg = str(e).lower()
            if "duplicate" not in msg and "already exists" not in msg:
                raise

        # Insert the row. The UNIQUE partial index on image_sha256 catches
        # the race where two sessions flush the same SHA simultaneously.
        try:
            resp = self.sb.table("receipt_training_examples").insert({
                "user_id": None,
                "image_storage_path": path,
                "image_sha256": sha,
                "candidate_parse": candidate_parse,
                "strategy_used": ocr_signals.get("strategy_used", "easyocr_local"),
                "strategies_tried": ocr_signals.get("strategies_tried", ["easyocr_local"]),
                "parse_confidence": ocr_signals.get("parse_confidence"),
                "disposition": "auto_accepted",
                "verified_by": f"local-cli:{self.annotator}",
                "verified_at": _now_iso(),
                "verified_parse": verified_parse,
                "verifier_notes": (
                    f"bulk-seed via annotate_receipts.py, "
                    f"ocr_mean_conf={ocr_signals.get('mean_conf', 0):.2f}"
                ),
            }).execute()
        except Exception as e:
            # PostgREST surfaces the unique-violation as a 409. We treat that
            # as success (the row is already there) by looking it up.
            if "duplicate" in str(e).lower() or "23505" in str(e) or "409" in str(e):
                existing = (
                    self.sb.table("receipt_training_examples")
                    .select("id")
                    .eq("image_sha256", sha)
                    .is_("deleted_at", "null")
                    .maybeSingle()
                    .execute()
                )
                eid = (existing.data or {}).get("id") if existing else None
                raise _AlreadyExists(eid)
            raise

        rows = resp.data or []
        if not rows:
            raise RuntimeError("insert returned no row")
        return rows[0]["id"]


class _AlreadyExists(Exception):
    def __init__(self, existing_id: Optional[str]):
        super().__init__(f"sha already in supabase (id={existing_id})")
        self.existing_id = existing_id


# ── OCR + parse pipeline (foreground worker, called by AnnotatorState) ────


def parse_via_pipeline(engine, path: Path) -> dict:
    """Run the production OCR + parser stack on one image."""
    t0 = time.time()
    detections = engine.extract_detections(path, do_preprocess=True)
    ocr_time = time.time() - t0
    confs = [d[2] for d in detections if d and len(d) >= 3]
    mean_conf = sum(confs) / len(confs) if confs else 0.0

    tokens = _parser_mod.spatial_reorder(detections)
    parsed = _parser_mod.parse_receipt(tokens)

    return {
        "tokens": tokens,
        "detections_count": len(detections),
        "parsed": parsed,
        "ocr_signals": {
            "n_detections": len(detections),
            "mean_conf": round(mean_conf, 3),
            "ocr_time_s": round(ocr_time, 2),
        },
    }


# ── In-memory state ───────────────────────────────────────────────────────


class AnnotatorState:
    """Holds the queue + processed results. All access goes through methods
    so background and request threads stay sane."""

    def __init__(
        self, images: list[Path], image_shas: list[str],
        engine, annotator: str, journal: JournalDB,
    ):
        assert len(images) == len(image_shas)
        self.images = images
        self.image_shas = image_shas
        self.engine = engine
        self.annotator = annotator
        self.journal = journal
        self.results: dict[str, dict] = {}  # path-str → parse result
        self.errors: dict[str, str] = {}    # path-str → error message
        self.processed_count = 0
        self.session_verified = 0
        self.session_rejected = 0
        self.session_skipped = 0
        self.llm_calls = 0
        self.llm_cost_usd = 0.0
        self.lock = threading.Lock()
        self.executor = ThreadPoolExecutor(max_workers=2)
        # Pre-process the first 2 immediately so the UI doesn't wait on first load.
        for p in images[:2]:
            self._submit(p)

    def _submit(self, path: Path) -> None:
        if str(path) in self.results or str(path) in self.errors:
            return
        self.executor.submit(self._worker, path)

    def _worker(self, path: Path) -> None:
        try:
            res = parse_via_pipeline(self.engine, path)
            with self.lock:
                self.results[str(path)] = res
                self.processed_count += 1
        except Exception as e:
            with self.lock:
                self.errors[str(path)] = f"{type(e).__name__}: {e}"

    def warm_around(self, idx: int) -> None:
        """Make sure the image at idx and the next 2 are queued for OCR."""
        for j in (idx, idx + 1, idx + 2):
            if 0 <= j < len(self.images):
                self._submit(self.images[j])

    def status_for(self, idx: int) -> dict:
        if idx < 0 or idx >= len(self.images):
            return {"done": False, "error": "out of range"}
        path = self.images[idx]
        with self.lock:
            if str(path) in self.errors:
                return {"done": True, "error": self.errors[str(path)]}
            if str(path) in self.results:
                return {"done": True, "result": self.results[str(path)]}
        return {"done": False}


# ── FastAPI app ───────────────────────────────────────────────────────────


def build_app(state: AnnotatorState, journal: JournalDB, annotator: str):
    app = FastAPI(title="Receipt Annotator")

    # Note: we parse JSON bodies manually with `await request.json()` instead
    # of using Pydantic models because fastapi 0.104 + pydantic 2.12 + the
    # importlib loader pattern this file uses break TypeAdapter resolution.
    # Manual parsing is fine for this tiny API surface.

    @app.get("/", response_class=HTMLResponse)
    def index():
        return HTMLResponse(_HTML_UI)

    @app.get("/api/manifest")
    def manifest():
        jstats = journal.stats()
        return {
            "n_total": len(state.images),
            "n_processed": state.processed_count,
            "session_verified": state.session_verified,
            "session_rejected": state.session_rejected,
            "session_skipped": state.session_skipped,
            "annotator": annotator,
            "filenames": [p.name for p in state.images],
            "llm_calls": state.llm_calls,
            "llm_cost_usd": round(state.llm_cost_usd, 4),
            **jstats,
        }

    @app.post("/api/llm-reparse/{idx}")
    async def llm_reparse(idx: int):
        """Run GPT-4o vision on the current image and return the parse.

        Triggered by the 'L' key or the 'Re-parse with LLM' button. Result
        is returned to the UI and saved as a draft so navigation/refresh
        won't lose it.
        """
        if idx < 0 or idx >= len(state.images):
            raise HTTPException(404, "out of range")
        path = state.images[idx]
        sha = state.image_shas[idx]
        try:
            parsed, cost = await asyncio.to_thread(_parse_via_gpt_vision, path)
        except Exception as e:
            raise HTTPException(502, f"LLM reparse failed: {type(e).__name__}: {e}")
        with state.lock:
            state.llm_calls += 1
            state.llm_cost_usd += cost
        # Save as draft so a page refresh / navigation away preserves it.
        journal.save_draft(sha, parsed)
        return {"ok": True, "parse": parsed, "cost_usd": round(cost, 4)}

    @app.get("/api/image/{idx}")
    def image(idx: int):
        if idx < 0 or idx >= len(state.images):
            raise HTTPException(404, "out of range")
        return FileResponse(state.images[idx])

    @app.get("/api/parse/{idx}")
    def parse(idx: int):
        # Make sure this image and the next two are queued for OCR
        state.warm_around(idx)
        # Wait briefly for the result if it's not ready yet
        for _ in range(150):  # ~30s ceiling at 200ms tick
            s = state.status_for(idx)
            if s.get("done"):
                sha = state.image_shas[idx]
                # Surface the journal status so the UI can show "in queue" /
                # "uploaded" / "failed" badges, AND the user's saved draft if any.
                draft = journal.get_draft(sha)
                upload_status = journal.status_for(sha)
                return JSONResponse({
                    "filename": state.images[idx].name,
                    "index": idx,
                    "sha256": sha,
                    "draft": draft,
                    "upload": upload_status,
                    **s,
                })
            time.sleep(0.2)
        return JSONResponse({"filename": state.images[idx].name, "index": idx, "done": False})

    @app.post("/api/draft")
    async def save_draft(request: Request):
        """Persist the user's in-progress edits without committing them.
        Called by the UI on every field change (debounced) and before
        navigating with arrow keys."""
        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(400, "invalid JSON")
        idx = payload.get("index")
        draft_parse = payload.get("draft_parse")
        if not isinstance(idx, int) or not isinstance(draft_parse, dict):
            raise HTTPException(400, "missing index or draft_parse")
        if idx < 0 or idx >= len(state.images):
            raise HTTPException(404, "out of range")
        sha = state.image_shas[idx]
        journal.save_draft(sha, draft_parse)
        return {"ok": True}

    @app.post("/api/verify")
    async def verify(request: Request):
        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(400, "invalid JSON")
        idx = payload.get("index")
        action = payload.get("action")
        edited_parse = payload.get("edited_parse")
        if not isinstance(idx, int) or action not in ("confirm", "edit", "reject", "skip"):
            raise HTTPException(400, "missing index or invalid action")
        if idx < 0 or idx >= len(state.images):
            raise HTTPException(404, "out of range")
        path = state.images[idx]
        sha = state.image_shas[idx]

        if action == "skip":
            with state.lock:
                state.session_skipped += 1
            return {"ok": True, "next_index": idx + 1}

        s = state.status_for(idx)
        if not s.get("done") or s.get("error"):
            raise HTTPException(409, f"image not yet processed or errored: {s}")
        result = s["result"]

        if action == "reject":
            journal.clear_draft(sha)
            with state.lock:
                state.session_rejected += 1
            return {"ok": True, "next_index": idx + 1}

        verified = edited_parse if action == "edit" else result["parsed"]
        if not isinstance(verified, dict):
            raise HTTPException(400, "edit action requires edited_parse object")

        # Compute completeness signal so the row carries a sensible
        # parse_confidence even though a human just accepted it.
        n_items = len(verified.get("items") or [])
        score = 0.0
        if verified.get("store") and verified["store"] != "Unknown": score += 0.20
        if verified.get("total") is not None: score += 0.20
        if verified.get("subtotal") is not None: score += 0.10
        if verified.get("date"): score += 0.10
        if n_items >= 2: score += 0.20
        if n_items >= 5: score += 0.10
        ocr_signals = dict(result["ocr_signals"])
        ocr_signals["strategy_used"] = "easyocr_local"
        ocr_signals["strategies_tried"] = ["easyocr_local"]
        ocr_signals["parse_confidence"] = round(min(score, 1.0), 2)

        # JOURNAL FIRST. Synchronous local SQLite write — guaranteed durable
        # before we respond. The background uploader handles Supabase.
        journal.record_verification(
            sha=sha,
            image_path=path,
            verified_parse=verified,
            candidate_parse=result["parsed"],
            ocr_signals=ocr_signals,
            annotator=annotator,
        )
        # Edits are now committed; clear the draft so we don't double-store.
        journal.clear_draft(sha)
        with state.lock:
            state.session_verified += 1
        return {"ok": True, "next_index": idx + 1, "queued_for_upload": True}

    return app


# ── HTML UI (inlined) ─────────────────────────────────────────────────────


_HTML_UI = r"""
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Receipt Annotator</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; background: #fafafa; color: #222; }
  header { padding: 8px 16px; background: #fff; border-bottom: 1px solid #ddd;
           display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  header h1 { margin: 0; font-size: 1.1rem; }
  header .stats { font-size: 0.85rem; color: #666; }
  header .stats span { margin-right: 12px; }
  header .nav button { padding: 4px 10px; margin: 0 2px; border-radius: 4px;
                       border: 1px solid #ccc; background: #fff; cursor: pointer; }
  #savestate { font-size: 0.78rem; color: #666; padding: 2px 8px; border-radius: 3px;
               background: #f3f3f3; }
  #savestate.dirty { background: #fef3c7; color: #92400e; }
  #savestate.saving { background: #dbeafe; color: #1e40af; }
  #savestate.saved { background: #dcfce7; color: #166534; }
  #savestate.failed { background: #fee2e2; color: #991b1b; }
  main { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px;
         height: calc(100vh - 50px); }
  .pane { background: #fff; border: 1px solid #ddd; border-radius: 4px;
          overflow: auto; padding: 12px; }
  .image-pane img { max-width: 100%; height: auto; display: block; }
  .field { margin-bottom: 8px; }
  .field label { display: block; font-size: 0.8rem; color: #666; margin-bottom: 2px; }
  .field input { width: 100%; padding: 4px 6px; border: 1px solid #ccc; border-radius: 3px;
                 font-family: inherit; font-size: 0.95rem; }
  .items-row { display: grid; grid-template-columns: 1fr 60px 80px 28px; gap: 4px;
               margin-bottom: 4px; align-items: center; }
  .items-row input { padding: 3px 5px; font-size: 0.9rem; }
  .items-row .remove { background: none; border: 0; color: #c33; cursor: pointer;
                       font-size: 1rem; padding: 0; }
  .actions { margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap; }
  .actions button { padding: 6px 14px; border-radius: 4px; border: 1px solid #888;
                    cursor: pointer; font-size: 0.95rem; }
  .actions .confirm { background: #2c8a4a; color: white; border-color: #2c8a4a; }
  .actions .edit { background: #2563eb; color: white; border-color: #2563eb; }
  .actions .reject { background: #fff; color: #c33; border-color: #c33; }
  .actions .skip { background: #eee; color: #555; }
  .keys { margin-top: 12px; font-size: 0.75rem; color: #888; }
  .keys kbd { background: #eee; border: 1px solid #ccc; border-bottom-width: 2px;
              border-radius: 3px; padding: 1px 6px; font-family: ui-monospace, monospace; }
  .meta { font-size: 0.8rem; color: #888; margin-bottom: 8px; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 8px;
           font-size: 0.7rem; margin-left: 6px; }
  .badge.pending { background: #fef3c7; color: #92400e; }
  .badge.done    { background: #dcfce7; color: #166534; }
  .badge.failed  { background: #fee2e2; color: #991b1b; }
  .badge.draft   { background: #ddd6fe; color: #5b21b6; }
  .loading { color: #666; padding: 12px; }
  .error { color: #c33; padding: 12px; }
  .add-item { background: none; border: 1px dashed #ccc; padding: 4px 8px;
              border-radius: 3px; cursor: pointer; font-size: 0.85rem; color: #2563eb;
              margin-top: 4px; }
</style>
</head>
<body>
  <header>
    <h1>📋 Receipt Annotator</h1>
    <div class="stats" id="stats">loading…</div>
    <div class="nav">
      <button id="prev">← Prev</button>
      <button id="next">Next →</button>
      <span id="position" style="font-size: 0.85rem; color: #666;"></span>
    </div>
    <div id="savestate">idle</div>
  </header>
  <main>
    <div class="pane image-pane">
      <img id="img" alt="" />
    </div>
    <div class="pane edit-pane">
      <div class="meta" id="meta"></div>
      <div id="form"></div>
      <div class="actions">
        <button class="confirm" id="confirm">✓ Confirm (Enter)</button>
        <button class="edit"    id="save">💾 Save edits (Cmd-S)</button>
        <button id="llm" style="background:#9333ea;color:white;border-color:#9333ea">🤖 LLM rescue (L)</button>
        <button class="reject"  id="reject">Reject (R)</button>
        <button class="skip"    id="skip">Skip (S)</button>
      </div>
      <div class="keys">
        <kbd>Enter</kbd> confirm &nbsp;
        <kbd>E</kbd> edit-mode &nbsp;
        <kbd>L</kbd> LLM rescue &nbsp;
        <kbd>R</kbd> reject &nbsp;
        <kbd>S</kbd> skip &nbsp;
        <kbd>←</kbd>/<kbd>→</kbd> navigate
        <span style="margin-left: 12px;">edits auto-save while you type and on navigate.</span>
      </div>
    </div>
  </main>
<script>
const state = { idx: 0, total: 0, current: null, dirty: false, saveTimer: null };

function setSaveState(s) {
  const el = document.getElementById('savestate');
  el.className = ''; el.classList.add(s);
  el.textContent = ({
    idle: 'idle', dirty: '● unsaved edits', saving: 'saving…',
    saved: '✓ saved', failed: '✗ save failed',
  })[s] ?? s;
}

async function refreshStats() {
  const r = await fetch('/api/manifest');
  const j = await r.json();
  state.total = j.n_total;
  document.getElementById('stats').innerHTML =
    `<span>total: ${j.n_total}</span>` +
    `<span style="color:#2c8a4a">✓ session: ${j.session_verified}</span>` +
    `<span style="color:#c33">rej: ${j.session_rejected}</span>` +
    `<span style="color:#888">skipped: ${j.session_skipped}</span>` +
    `<span title="rows still in the upload queue">queue: ${j.verified_pending}</span>` +
    `<span title="rows successfully uploaded to Supabase" style="color:#2c8a4a">uploaded: ${j.verified_done}</span>` +
    (j.verified_failed > 0
      ? `<span title="rows that exceeded retry limit" style="color:#c33">failed: ${j.verified_failed}</span>`
      : '') +
    (j.llm_calls > 0
      ? `<span title="GPT-4o-mini vision calls in this session" style="color:#9333ea">🤖 ${j.llm_calls} ($${j.llm_cost_usd.toFixed(2)})</span>`
      : '');
}

async function load(idx) {
  // Auto-save before leaving the current image so arrow-key navigation
  // never loses in-progress edits.
  if (state.dirty && state.current) {
    await saveDraftNow();
  }

  if (idx < 0 || idx >= state.total) return;
  state.idx = idx;
  state.dirty = false;
  setSaveState('idle');
  document.getElementById('position').textContent = `${idx + 1} / ${state.total}`;
  document.getElementById('img').src = `/api/image/${idx}`;
  document.getElementById('meta').textContent = 'OCR running…';
  document.getElementById('form').innerHTML = '<div class="loading">Loading…</div>';

  const r = await fetch(`/api/parse/${idx}`);
  const j = await r.json();
  if (!j.done) {
    document.getElementById('meta').textContent = 'still processing — try again in a moment';
    return;
  }
  if (j.error) {
    document.getElementById('meta').textContent = '';
    document.getElementById('form').innerHTML = `<div class="error">Pipeline error: ${j.error}</div>`;
    return;
  }
  state.current = j;
  const sigs = j.result.ocr_signals;
  const upload = j.upload;
  let badges = '';
  if (upload?.upload_status === 'pending') badges += `<span class="badge pending">in queue · ${upload.upload_attempts} attempts</span>`;
  if (upload?.upload_status === 'done')    badges += `<span class="badge done">uploaded</span>`;
  if (upload?.upload_status === 'failed')  badges += `<span class="badge failed">upload failed: ${upload.last_error?.slice(0, 60) ?? ''}</span>`;
  if (j.draft) badges += `<span class="badge draft">draft restored</span>`;
  document.getElementById('meta').innerHTML =
    `${j.filename} · ${sigs.n_detections} detections · ` +
    `mean conf ${sigs.mean_conf.toFixed(2)} · ${sigs.ocr_time_s}s` + badges;

  // Prefer the saved draft over the raw OCR result, so navigating away and
  // back returns the user to exactly what they were typing.
  const seed = j.draft || j.result.parsed;
  renderForm(seed);
}

function renderForm(parsed) {
  const items = parsed.items || [];
  const html = `
    <div class="field">
      <label>Store</label>
      <input id="f-store" value="${escape(parsed.store ?? '')}" />
    </div>
    <div class="field">
      <label>Date (YYYY-MM-DD)</label>
      <input id="f-date" value="${escape(parsed.date ?? '')}" />
    </div>
    <div class="field" style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px;">
      <div>
        <label>Subtotal</label>
        <input id="f-subtotal" type="number" step="0.01" value="${parsed.subtotal ?? ''}" />
      </div>
      <div>
        <label>Total</label>
        <input id="f-total" type="number" step="0.01" value="${parsed.total ?? ''}" />
      </div>
    </div>
    <div class="field">
      <label>Items (${items.length})</label>
      <div id="items">
        ${items.map((it, i) => itemRow(it, i)).join('')}
      </div>
      <button class="add-item" id="add-item">+ add item</button>
    </div>
  `;
  document.getElementById('form').innerHTML = html;
  document.getElementById('add-item').onclick = () => {
    const idx = document.querySelectorAll('#items .items-row').length;
    document.getElementById('items').insertAdjacentHTML('beforeend', itemRow({ name:'', quantity:1, price:0 }, idx));
    wireRemoves();
    markDirty();
  };
  wireRemoves();
  // Wire change tracking on every input in the form.
  document.querySelectorAll('#form input').forEach(inp => {
    inp.addEventListener('input', markDirty);
  });
}

function itemRow(it, i) {
  return `
    <div class="items-row" data-i="${i}">
      <input class="i-name" value="${escape(it.name ?? '')}" />
      <input class="i-qty"  type="number" min="1" value="${it.quantity ?? 1}" />
      <input class="i-price" type="number" step="0.01" value="${it.price ?? 0}" />
      <button class="remove" data-i="${i}">×</button>
    </div>
  `;
}

function escape(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

function wireRemoves() {
  document.querySelectorAll('.remove').forEach(btn => {
    btn.onclick = (e) => {
      e.target.closest('.items-row').remove();
      markDirty();
    };
  });
}

function collect() {
  const items = [];
  document.querySelectorAll('#items .items-row').forEach(row => {
    const name = row.querySelector('.i-name').value.trim();
    const qty  = parseInt(row.querySelector('.i-qty').value) || 1;
    const price = parseFloat(row.querySelector('.i-price').value) || 0;
    if (name || price > 0) items.push({ name, quantity: qty, price });
  });
  const sub  = document.getElementById('f-subtotal').value;
  const tot  = document.getElementById('f-total').value;
  const date = document.getElementById('f-date').value.trim();
  return {
    store: document.getElementById('f-store').value.trim() || 'Unknown',
    date: date || null,
    items,
    subtotal: sub === '' ? null : parseFloat(sub),
    total: tot === '' ? null : parseFloat(tot),
    taxes: state.current?.result?.parsed?.taxes ?? [],
  };
}

// Debounced auto-save: every keystroke marks dirty, the trailing-edge
// timer (700ms) fires the actual draft save. Plus we save on navigation.
function markDirty() {
  state.dirty = true;
  setSaveState('dirty');
  if (state.saveTimer) clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveDraftNow, 700);
}

async function saveDraftNow() {
  if (!state.current) return;
  if (state.saveTimer) { clearTimeout(state.saveTimer); state.saveTimer = null; }
  setSaveState('saving');
  try {
    const r = await fetch('/api/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: state.idx, draft_parse: collect() }),
    });
    if (!r.ok) throw new Error(await r.text());
    state.dirty = false;
    setSaveState('saved');
    setTimeout(() => { if (!state.dirty) setSaveState('idle'); }, 1500);
  } catch (e) {
    console.error('draft save failed', e);
    setSaveState('failed');
  }
}

async function submit(action) {
  if (!state.current) return;
  // Always flush any pending draft FIRST so accept-then-server-error doesn't lose work.
  if (state.dirty) await saveDraftNow();
  const body = { index: state.idx, action };
  if (action === 'confirm' || action === 'edit') {
    body.edited_parse = collect();
    if (action === 'confirm') body.action = 'edit'; // both submit the form values
  }
  const r = await fetch('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) {
    alert('Submit failed: ' + (j.detail ?? r.status) + '\n\nYour draft is still saved; navigate away and back to recover it.');
    return;
  }
  await refreshStats();
  load(state.idx + 1);
}

document.getElementById('confirm').onclick = () => submit('confirm');
document.getElementById('save').onclick    = () => submit('edit');
document.getElementById('llm').onclick     = () => llmReparse();
document.getElementById('reject').onclick  = () => submit('reject');
document.getElementById('skip').onclick    = () => submit('skip');
document.getElementById('next').onclick    = () => load(state.idx + 1);
document.getElementById('prev').onclick    = () => load(state.idx - 1);

async function llmReparse() {
  if (!state.current) return;
  setSaveState('saving');
  // Subtle visual cue while waiting on the API
  const meta = document.getElementById('meta');
  const oldMeta = meta.innerHTML;
  meta.innerHTML = '🤖 calling GPT-4o-mini vision (~3s, ~$0.005)…';
  try {
    const r = await fetch(`/api/llm-reparse/${state.idx}`, { method: 'POST' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.detail ?? r.status);
    // Replace form contents with the LLM's parse, mark dirty so a save
    // will commit it (or 'confirm' since dirty edits are auto-flushed).
    renderForm(j.parse);
    state.dirty = true;
    setSaveState('dirty');
    meta.innerHTML = oldMeta + ` <span class="badge done">LLM parse loaded ($${j.cost_usd.toFixed(4)})</span>`;
    refreshStats();
  } catch (e) {
    meta.innerHTML = oldMeta;
    alert('LLM reparse failed: ' + (e instanceof Error ? e.message : String(e)));
    setSaveState('failed');
  }
}

document.addEventListener('keydown', (e) => {
  if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName) && e.key !== 'Enter') return;
  if (e.key === 'Enter' || e.key === 'y' || e.key === 'Y') { e.preventDefault(); submit('confirm'); }
  else if (e.key === 'r' || e.key === 'R') submit('reject');
  else if (e.key === 's' || e.key === 'S') submit('skip');
  else if (e.key === 'e' || e.key === 'E') document.getElementById('f-store')?.focus();
  else if (e.key === 'l' || e.key === 'L') llmReparse();
  else if (e.key === 'ArrowLeft')  load(state.idx - 1);
  else if (e.key === 'ArrowRight') load(state.idx + 1);
  else if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); submit('edit'); }
});

// Save before unloading the page (closing tab / refreshing).
window.addEventListener('beforeunload', () => {
  if (!state.dirty || !state.current) return;
  // Use sendBeacon — fire-and-forget but guaranteed to leave the browser.
  const body = JSON.stringify({ index: state.idx, draft_parse: collect() });
  navigator.sendBeacon('/api/draft', new Blob([body], { type: 'application/json' }));
});

refreshStats().then(() => load(0));
setInterval(refreshStats, 3000);
</script>
</body>
</html>
"""


# ── Main ──────────────────────────────────────────────────────────────────


def discover_images(root: Path, extensions: list[str]) -> list[Path]:
    suffixes = {f".{e.lower().lstrip('.')}" for e in extensions}
    out: list[Path] = []
    for p in sorted(root.rglob("*")):
        if p.is_file() and p.suffix.lower() in suffixes:
            out.append(p)
    return out


def _resolve_journal_path(images_root: Path, override: Optional[Path]) -> Path:
    """Pick the journal location: --journal flag wins, then images-folder
    sibling, then ~/.secretsauce/ as a writable fallback."""
    if override is not None:
        return override
    candidate = images_root / ".annotate_journal.db"
    try:
        candidate.touch(exist_ok=True)
        return candidate
    except (PermissionError, OSError):
        home = Path.home() / ".secretsauce"
        # Mangle the images folder into the filename so multiple folders
        # don't share a journal.
        slug = hashlib.md5(str(images_root.resolve()).encode()).hexdigest()[:10]
        return home / f"annotate_journal_{slug}.db"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--images", required=True, type=Path,
                    help="Folder containing receipt images (recursively scanned)")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--annotator", default=os.getenv("USER", "anon"),
                    help="Stored in verified_by; default = $USER")
    ap.add_argument("--engine", default="easyocr",
                    choices=["easyocr", "paddle", "ensemble"])
    ap.add_argument("--no-open", action="store_true",
                    help="Don't auto-open the browser")
    ap.add_argument("--extensions", default="jpg,jpeg,png,heic,heif,webp")
    ap.add_argument("--journal", type=Path, default=None,
                    help="Override journal SQLite path (default: alongside the images folder)")
    ap.add_argument(
        "--ocr-mode",
        choices=["fast", "balanced", "full"],
        default="fast",
        help=(
            "OCR speed/quality tradeoff. 'fast' (default) targets ~3-5s per "
            "image by skipping non-local-means denoise and capping image + "
            "OCR canvas dims at 1200/1280. 'full' is the production preset "
            "(~10-30s) used by ocr_bench. 'balanced' is in between."
        ),
    )
    args = ap.parse_args()

    # Translate --ocr-mode into the env vars engines.py reads at import time.
    # Set these BEFORE any later import of engines.py through the loader.
    if args.ocr_mode == "fast":
        os.environ.setdefault("RECEIPT_OCR_FAST", "1")
    elif args.ocr_mode == "balanced":
        os.environ.setdefault("RECEIPT_OCR_MAX_HEIGHT", "1500")
        os.environ.setdefault("RECEIPT_OCR_CANVAS_SIZE", "1600")
        os.environ.setdefault("RECEIPT_OCR_TARGET_HEIGHT", "1500")
        # keep denoise on
    # 'full' leaves all defaults, matching ocr_bench / production preset.

    if not args.images.is_dir():
        sys.exit(f"--images must be a directory: {args.images}")

    print(f"Scanning {args.images} …", file=sys.stderr)
    all_images = discover_images(args.images, args.extensions.split(","))
    print(f"Found {len(all_images)} images", file=sys.stderr)
    if not all_images:
        sys.exit("Nothing to do.")

    print("Connecting to Supabase …", file=sys.stderr)
    sb = _supabase()
    known = fetch_known_sha256s(sb)
    print(f"Known sha256 in training table: {len(known)}", file=sys.stderr)

    # Hash + filter (skip already-uploaded receipts so re-runs are idempotent).
    print("Computing sha256 to dedupe (may take a moment) …", file=sys.stderr)
    todo: list[Path] = []
    todo_shas: list[str] = []
    skipped_dup = 0
    for p in all_images:
        try:
            h = sha256_of(p)
        except OSError:
            continue
        if h in known:
            skipped_dup += 1
        else:
            todo.append(p)
            todo_shas.append(h)
    print(f"Skipped {skipped_dup} already in training set; {len(todo)} to annotate",
          file=sys.stderr)
    if not todo:
        print("Everything already uploaded. Done.", file=sys.stderr)
        return 0

    journal_path = _resolve_journal_path(args.images, args.journal)
    print(f"Journal: {journal_path}", file=sys.stderr)
    journal = JournalDB(journal_path)
    pre_stats = journal.stats()
    if pre_stats["verified_pending"] or pre_stats["verified_failed"]:
        print(
            f"  found existing journal with "
            f"{pre_stats['verified_pending']} pending uploads, "
            f"{pre_stats['verified_failed']} failed — "
            "uploader will retry these on startup.",
            file=sys.stderr,
        )

    print(f"Loading {args.engine} engine …", file=sys.stderr)
    engine = _ensure_engine(args.engine)
    # _ensure_engine triggers engines.py module load, so the speed knobs are
    # now resolved. Echo the active values so a slow run is debuggable.
    print(
        f"{args.engine} ready. ocr_mode={args.ocr_mode} "
        f"max_height={_engines_mod._MAX_HEIGHT} "
        f"canvas={_engines_mod._CANVAS_SIZE} "
        f"skip_denoise={_engines_mod._SKIP_DENOISE}",
        file=sys.stderr,
    )

    state = AnnotatorState(todo, todo_shas, engine, args.annotator, journal)
    uploader = UploaderWorker(journal, sb, args.annotator)
    uploader.start()
    app = build_app(state, journal, args.annotator)

    url = f"http://127.0.0.1:{args.port}"
    print(f"\n  ▶  Open {url}\n", file=sys.stderr)
    if not args.no_open:
        try:
            webbrowser.open(url)
        except Exception:
            pass

    import uvicorn
    try:
        uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")
    finally:
        uploader.stop()
        uploader.join(timeout=5.0)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
