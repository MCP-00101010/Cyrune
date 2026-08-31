"""Capture a repeatable, content-free Arcade library startup/payload baseline."""

from __future__ import annotations

import json
import sys
import time
import tracemalloc
from pathlib import Path

ARCADE_ROOT = Path(__file__).resolve().parents[1]
if str(ARCADE_ROOT) not in sys.path:
    sys.path.insert(0, str(ARCADE_ROOT))

import arcade_service as service  # noqa: E402


def timed(callable_):
    started = time.perf_counter()
    value = callable_()
    return value, time.perf_counter() - started


def main() -> int:
    tracemalloc.start()
    library, startup_seconds = timed(service.get_library)
    summaries, summary_seconds = timed(lambda: library.list_game_summaries("all"))
    summary_json, serialization_seconds = timed(lambda: json.dumps(summaries, separators=(",", ":")))
    _current, peak = tracemalloc.get_traced_memory()
    result = {
        "schemaVersion": 1,
        "gameCount": len(summaries),
        "startupSeconds": round(startup_seconds, 4),
        "summaryBuildSeconds": round(summary_seconds, 4),
        "summarySerializationSeconds": round(serialization_seconds, 4),
        "summaryPayloadBytes": len(summary_json.encode("utf-8")),
        "peakTracedBytes": peak,
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
