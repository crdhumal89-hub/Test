"""Phase 0 smoke test.

This test is DESIGNED to fail until the engine exists (Phase 1+). It fails for
exactly one reason: run_review.run() is not yet implemented. When the engine
lands, this becomes the cheapest end-to-end sanity check.
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


class SmokeTest(unittest.TestCase):
    def test_engine_entrypoint_exists_and_runs(self):
        try:
            from run_review import run  # noqa: F401
        except ImportError as e:
            self.fail(f"engine entrypoint not implemented yet (expected during Phase 0): {e}")


if __name__ == "__main__":
    unittest.main()
