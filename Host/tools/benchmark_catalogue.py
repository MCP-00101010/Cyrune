"""Synthetic end-to-end library browse benchmark; no live config or emulator launches.

Run from the repository: python -B Host/tools/benchmark_catalogue.py --entries 12933
All fixture files live in a temporary directory and are removed by its owner.
"""

import argparse
from contextlib import nullcontext
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import tracemalloc
import uuid


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--entries", type=int, default=12933)
    parser.add_argument("--baseline", action="store_true")
    parser.add_argument("--prepared", action="store_true", help="Measure an existing prepared library")
    parser.add_argument("--relocate", action="store_true", help="Verify a full-size explicit relocation and retained identities")
    parser.add_argument("--allocation", action="store_true", help="Measure traced read allocation separately from latency")
    parser.add_argument("--bind", type=int, default=0, help="Measure explicit synthetic binding of 1–100 entries")
    args = parser.parse_args()
    if not 100 <= args.entries <= 100000:
        parser.error("entries must be between 100 and 100000")
    if not 0 <= args.bind <= 100:
        parser.error("bind must be between 0 and 100")
    repo = Path(__file__).resolve().parents[2]
    with tempfile.TemporaryDirectory(prefix="Cyrune-catalogue-benchmark-") as temporary:
        root = Path(temporary)
        runtime, source = root / "Arcade", root / "spectrum"
        runtime.mkdir()
        source.mkdir()
        os.environ.update(CYRUNE_HOST_CONFIG=str(root / "host.json"), CYRUNE_ARCADE_DATA=str(runtime),
            CYRUNE_ARCADE_COLLECTION=str(source), CYRUNE_ARCADE_COLLECTIONS_BASE=str(root))
        executable = root / "synthetic.exe"
        executable.write_bytes(b"Never execute this synthetic fixture")
        (root / "host.json").write_text(json.dumps({"arcadeRoot": str(repo / "Arcade")}), encoding="utf-8")
        rows = []
        for index in range(args.entries):
            filename = f"game{index:05}.tap"
            (source / filename).write_bytes(b"synthetic Spectrum media")
            rows.append({"id": f"g{index}", "title": f"Game {index:05}", "file": filename, "system": "48K"})
        (source / "collection-metadata.json").write_text(json.dumps({"games": rows, "poks": []}), encoding="utf-8")
        (runtime / "config.json").write_text(json.dumps({"collections": [{"id": "spectrum", "root": str(source),
            "writable": True, "default_emulator": "test"}], "emulators": {"test": {"type": "generic", "path": str(executable)}},
            "emulator_profiles": []}), encoding="utf-8")
        spec = importlib.util.spec_from_file_location("catalogue_benchmark_host", repo / "Host" / "morpheus_host.py")
        host = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(host)
        arcade = host._load_emugui_module()
        lifecycle = arcade.get_catalogue_lifecycle(create=True)
        started = time.perf_counter()
        if args.prepared or args.relocate:
            lifecycle.prepare_source("spectrum", dry_run=False)
        preparation = time.perf_counter() - started
        transport = host.get_catalogue_transport()
        opened = transport.handle({"type": "ARCADE_CATALOGUE_OPEN_SESSION", "protocol": 1, "role": "portal",
            "tabId": 7, "pageUrl": (repo / "Portal" / "index.html").as_uri()})
        request = {"type": "ARCADE_CATALOGUE_SEARCH", "protocol": 1, "sessionId": opened["sessionId"], "payload": {"pageSize": 100}}
        watches = [0]
        library = arcade.get_library_catalogue()
        watch = library._watch
        def observed():
            watches[0] += 1
            return watch()
        library._watch = observed
        results = []
        page_response = None
        for label in (["cold", "warm", "baseline"] if args.baseline else ["cold", "warm"]):
            if label == "baseline":
                transport._read_scope = nullcontext
            watches[0] = 0
            started = time.perf_counter()
            response = transport.handle(request)
            if label != "baseline":
                page_response = response
            results.append({"run": label, "seconds": round(time.perf_counter() - started, 3), "sourcePasses": watches[0],
                "ok": response["ok"], "code": response.get("code", ""), "selectable": sum(e["availability"] in {"ready", "available"} for e in response.get("entries", [])),
                "responseBytes": len(json.dumps(response, ensure_ascii=False).encode("utf-8"))})
        transport._read_scope = arcade.catalogue_read_snapshot
        measurements = {}
        queries = []
        for query in ("Game 12", "Game 012", "Game 001"):
            started = time.perf_counter()
            response = transport.handle({**request, "payload": {"query": query, "pageSize": 50}})
            queries.append({"seconds": round(time.perf_counter() - started, 4), "ok": response["ok"],
                            "results": len(response.get("entries", []))})
            assert response["ok"]
        measurements["searches"] = queries
        if args.bind:
            selection = [{"catalogueId": entry["catalogueId"], "entryRevision": entry["entryRevision"]}
                         for entry in page_response["entries"][:args.bind]]
            started = time.perf_counter()
            bind_request = {"type": "ARCADE_CATALOGUE_BIND_ENTRIES", "protocol": 1,
                "sessionId": opened["sessionId"], "payload": {"requestId": str(uuid.uuid4()), "entries": selection}}
            binding = transport.handle(bind_request)
            measurements["binding"] = {"seconds": round(time.perf_counter() - started, 3), "ok": binding["ok"],
                "code": binding.get("code", ""), "approved": sum(r["ok"] for r in binding.get("results", []))}
            if binding["ok"]:
                started = time.perf_counter()
                repeated = transport.handle(bind_request)
                measurements["binding"]["retrySeconds"] = round(time.perf_counter() - started, 3)
                assert repeated == binding
        if args.allocation:
            # Tracing slows Python substantially; it must not be reported as a
            # production latency sample or consume the production deadline.
            real_clock = transport._clock
            transport._clock = lambda: 0
            tracemalloc.start()
            response = transport.handle(request)
            measurements["warmReadPeakBytes"] = tracemalloc.get_traced_memory()[1]
            tracemalloc.stop()
            transport._clock = real_clock
            assert response["ok"] and len(response["entries"]) == 100
        if args.relocate:
            before = lifecycle.registry.load()["sources"]["spectrum"]
            destination = root / "relocated-spectrum"
            source.rename(destination)
            started = time.perf_counter()
            preview = lifecycle.reattach_source("spectrum", destination)
            assert preview["status"] == "preview"
            lifecycle.reattach_source("spectrum", destination, dry_run=False)
            measurements["relocationSeconds"] = round(time.perf_counter() - started, 3)
            after = lifecycle.registry.load()["sources"]["spectrum"]
            assert before["sourceId"] == after["sourceId"] and before["entries"] == after["entries"]
            started = time.perf_counter()
            response = transport.handle(request)
            measurements["relocatedReadSeconds"] = round(time.perf_counter() - started, 3)
            assert response["ok"] and len(response["entries"]) == 100
            assert all(e["availability"] == "available" for e in response["entries"])
            measurements["retainedEntries"] = len(after["entries"])
        print(json.dumps({"entries": args.entries, "preparationSeconds": round(preparation, 3), "results": results, **measurements}, indent=2))
        assert all(result["ok"] and result["selectable"] == 100 for result in results if result["run"] != "baseline")
        if args.bind:
            assert measurements["binding"]["approved"] == args.bind


if __name__ == "__main__":
    main()
