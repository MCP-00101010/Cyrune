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

    def __init__(
        self,
        thread_factory: Callable[..., threading.Thread] = threading.Thread,
        max_jobs: int = 100,
    ) -> None:
        self._lock = threading.Lock()
        self._jobs: dict[str, dict[str, object]] = {}
        self._thread_factory = thread_factory
        self._max_jobs = max(1, max_jobs)

    def _prune_finished_locked(self) -> None:
        overflow = len(self._jobs) - self._max_jobs
        if overflow <= 0:
            return
        finished = [
            job_id for job_id, job in self._jobs.items()
            if job.get("status") in {"done", "error"}
        ]
        for job_id in finished[:overflow]:
            self._jobs.pop(job_id, None)

    def start(self, title: str, work: JobWork) -> str:
        job_id = uuid.uuid4().hex[:12]
        created_at = dt.datetime.now(dt.UTC).isoformat(timespec="seconds")
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
                "created_at": created_at,
                "updated_at": created_at,
            }
            self._prune_finished_locked()

        def progress(phase: str, current: int, total: int, message: str) -> None:
            self.update(job_id, phase=phase, current=current, total=total, message=message)

        def runner() -> None:
            try:
                work(progress)
                self.update(job_id, status="done", phase="done", message="Done")
            except Exception as exc:
                self.update(job_id, status="error", phase="error", error=str(exc), message=str(exc))

        try:
            self._thread_factory(target=runner, daemon=True).start()
        except Exception as exc:
            self.update(job_id, status="error", phase="error", error=str(exc), message=str(exc))
        return job_id

    def update(self, job_id: str, **updates: object) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job.update(updates)
            job["updated_at"] = dt.datetime.now(dt.UTC).isoformat(timespec="seconds")
            self._prune_finished_locked()

    def get(self, job_id: str) -> dict[str, object]:
        with self._lock:
            return dict(self._jobs.get(job_id, {"id": job_id, "status": "missing", "error": "Unknown job"}))
