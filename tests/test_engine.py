"""
Unit tests for FileScope scanner and comparator engines.
"""
import os
import unittest
from backend.models import ScanRequest, CompareRequest
from backend.scanner import DirectoryScanner
from backend.comparator import DirectoryComparator
from tests.make_mock_data import create_mock_environment


class TestFileScopeEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir_a, cls.dir_b = create_mock_environment("test_mock_env")

    def test_scanner_prefix_and_leaf(self):
        req = ScanRequest(
            path=self.dir_a,
            prefixes=["DOC_", "IMG_", "LOG_"],
        )
        scanner = DirectoryScanner(req)
        resp = scanner.scan()

        self.assertTrue(resp.success)
        self.assertGreater(resp.summary.total_files, 0)
        self.assertGreater(resp.summary.total_leaf_directories, 0)

        # Check prefix stats
        prefix_dict = {p.prefix: p.match_count for p in resp.prefix_stats}
        self.assertEqual(prefix_dict["DOC_"], 15)  # 10 in q1, 5 in q2
        self.assertEqual(prefix_dict["IMG_"], 15)  # 15 in raw
        self.assertEqual(prefix_dict["LOG_"], 7)   # 7 in archive

        # Check leaf directories
        leaf_rel_paths = [d.rel_path for d in resp.leaf_directories]
        self.assertTrue(any("q1" in p for p in leaf_rel_paths))
        self.assertTrue(any("raw" in p for p in leaf_rel_paths))

    def test_scanner_default_auto_prefix_recognition(self):
        """Test default automatic prefix recognition when no prefixes are specified."""
        req = ScanRequest(
            path=self.dir_a,
            prefixes=[],  # Empty -> default auto recognition
        )
        scanner = DirectoryScanner(req)
        resp = scanner.scan()

        self.assertTrue(resp.success)
        self.assertGreater(len(resp.prefix_stats), 0)
        
        # Verify that common prefixes like IMG_ or DOC_ or DATA_ were automatically identified
        prefix_names = [p.prefix for p in resp.prefix_stats]
        self.assertTrue(any("IMG" in p or "DOC" in p or "LOG" in p for p in prefix_names))

    def test_comparator_relative_mode(self):
        req = CompareRequest(
            dir_a=self.dir_a,
            dir_b=self.dir_b,
            mode="relative_path",
            compare_size=True,
        )
        comparator = DirectoryComparator(req)
        resp = comparator.compare()

        self.assertTrue(resp.success)
        summary = resp.summary
        self.assertGreater(summary.total_unique_items, 0)
        self.assertGreater(summary.count_exact_match, 0)
        self.assertGreater(summary.count_only_in_a, 0)
        self.assertGreater(summary.count_only_in_b, 0)

        # Check statuses in diff_items
        statuses = {item.status for item in resp.diff_items}
        self.assertIn("EXACT_MATCH", statuses)
        self.assertIn("ONLY_IN_A", statuses)
        self.assertIn("ONLY_IN_B", statuses)

    def test_comparator_filename_only_mode(self):
        req = CompareRequest(
            dir_a=self.dir_a,
            dir_b=self.dir_b,
            mode="filename_only",
        )
        comparator = DirectoryComparator(req)
        resp = comparator.compare()

        self.assertTrue(resp.success)
        statuses = {item.status for item in resp.diff_items}
        self.assertIn("MOVED_PATH", statuses)


if __name__ == "__main__":
    unittest.main()
