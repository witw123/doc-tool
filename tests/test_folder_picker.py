"""Minimal tests for the native local folder selection endpoint."""
import os
import unittest
from unittest.mock import patch

from backend.main import choose_local_folder
from backend.models import SelectFolderRequest


class TestFolderPicker(unittest.TestCase):
    def test_selected_folder_returns_its_absolute_path(self):
        selected_path = os.path.abspath("test_mock_env")
        with patch("backend.main.select_local_folder", return_value=selected_path):
            response = choose_local_folder(SelectFolderRequest())

        self.assertTrue(response.selected)
        self.assertEqual(response.path, selected_path)

    def test_cancel_returns_no_path(self):
        with patch("backend.main.select_local_folder", return_value=None):
            response = choose_local_folder(SelectFolderRequest())

        self.assertFalse(response.selected)
        self.assertIsNone(response.path)


if __name__ == "__main__":
    unittest.main()
