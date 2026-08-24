"""Transport-independent background job registry."""

from __future__ import annotations

import datetime as dt
import threading
import uuid
from typing import Callable


ProgressCallback = Callable[[str, int, int, str], None]
JobWork = Callable[[ProgressCallback], None]


class BackgroundJobService:
    """Run bounded application jobs and expose immutable status snapshots."""

    def __init__(self, thread_factory: Callable[..., threading.Thread] = threading.Thread) -> None:
        self._lock = threading.Lock()
        self._jobs: dict[str, dict[str, object]] = {}
        self._thread_factory = thread_factory

    def start(self, title: str, work: JobWork) -> str:
        job_id = uuid.uuid4().hex[:12]
        with self._lock:
            self._jobs[job_id] = {
                "id": job_id,
                "status": "running",
                "phase": "starting",
                "current": 0,
                "total": 0,
                "title": title,
                "message": "Starting...",
                "error": "",
            }

        def progress(phase: str, current: int, total: int, message: str) -> None:
            self.update(job_id, phase=phase, current=current, total=total, message=message)

        def runner() -> None:
            try:
                work(progress)
                self.update(job_id, status="done", phase="done", message="Done")
            except Exception as exc:
                self.update(job_id, status="error", phase="error", error=str(exc), message=str(exc))

        self._thread_factory(target=runner, daemon=True).start()
        return job_id

    def update(self, job_id: str, **updates: object) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job.update(updates)
            job["updated_at"] = dt.datetime.now(dt.UTC).isoformat(timespec="seconds")

    def get(self, job_id: str) -> dict[str, object]:
        with self._lock:
            return dict(self._jobs.get(job_id, {"id": job_id, "status": "missing", "error": "Unknown job"}))
