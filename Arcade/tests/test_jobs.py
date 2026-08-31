from arcade_core.jobs import BackgroundJobService


class ImmediateThread:
    def __init__(self, *, target, daemon):
        self.target = target
        self.daemon = daemon

    def start(self):
        self.target()


def test_background_jobs_publish_progress_and_completion():
    service = BackgroundJobService(thread_factory=ImmediateThread)

    job_id = service.start("Rebuild", lambda progress: progress("scan", 4, 10, "Scanning"))
    result = service.get(job_id)

    assert result["title"] == "Rebuild"
    assert result["status"] == "done"
    assert result["phase"] == "done"
    assert result["current"] == 4
    assert result["total"] == 10
    assert "updated_at" in result


def test_background_jobs_capture_failures_and_return_copies():
    service = BackgroundJobService(thread_factory=ImmediateThread)

    def fail(_progress):
        raise RuntimeError("index failed")

    job_id = service.start("Rebuild", fail)
    first = service.get(job_id)
    first["status"] = "tampered"

    assert service.get(job_id)["status"] == "error"
    assert service.get(job_id)["error"] == "index failed"
    assert service.get("missing") == {"id": "missing", "status": "missing", "error": "Unknown job"}


def test_background_jobs_keep_only_bounded_finished_history():
    service = BackgroundJobService(thread_factory=ImmediateThread, max_jobs=2)

    first = service.start("First", lambda _progress: None)
    second = service.start("Second", lambda _progress: None)
    third = service.start("Third", lambda _progress: None)

    assert service.get(first)["status"] == "missing"
    assert service.get(second)["status"] == "done"
    assert service.get(third)["status"] == "done"


def test_background_jobs_report_thread_start_failures():
    class BrokenThread:
        def __init__(self, *, target, daemon):
            pass

        def start(self):
            raise RuntimeError("threads unavailable")

    service = BackgroundJobService(thread_factory=BrokenThread)
    job_id = service.start("Rebuild", lambda _progress: None)

    assert service.get(job_id)["status"] == "error"
    assert service.get(job_id)["error"] == "threads unavailable"
