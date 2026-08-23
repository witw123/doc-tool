"""Tests for opening scanned directories in the host file manager."""

import asyncio
import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from backend.main import open_system_folder
from backend.models import OpenFolderRequest


class TestOpenSystemFolder(unittest.TestCase):
    def test_existing_directory_is_opened(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch("backend.main.sys.platform", "win32"), patch("backend.main.os.startfile") as startfile:
                response = asyncio.run(open_system_folder(OpenFolderRequest(path=directory)))

            self.assertTrue(response["success"])
            self.assertEqual(response["path"], os.path.normpath(os.path.abspath(directory)))
            startfile.assert_called_once_with(response["path"])

    def test_missing_path_is_not_replaced_with_parent_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            missing = os.path.join(directory, "does-not-exist")
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(open_system_folder(OpenFolderRequest(path=missing)))

            self.assertEqual(raised.exception.status_code, 404)

    def test_file_path_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            file_path = os.path.join(directory, "report.txt")
            with open(file_path, "w", encoding="utf-8"):
                pass

            with self.assertRaises(HTTPException) as raised:
                asyncio.run(open_system_folder(OpenFolderRequest(path=file_path)))

            self.assertEqual(raised.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
