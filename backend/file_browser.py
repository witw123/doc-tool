"""
Server filesystem browser helper to allow interactive directory picking from Web UI.
"""
import os
import sys
import platform
from typing import List, Optional
from datetime import datetime
from backend.models import BrowseResponse, BrowseItem


def get_server_drives() -> List[BrowseItem]:
    """Get available drive letters on Windows or root on Unix."""
    drives = []
    if platform.system() == "Windows":
        import string
        from ctypes import windll
        bitmask = windll.kernel32.GetLogicalDrives()
        for letter in string.ascii_uppercase:
            if bitmask & 1:
                drive_path = f"{letter}:\\"
                drives.append(BrowseItem(
                    name=f"磁盘 ({letter}:)",
                    path=drive_path,
                    is_dir=True,
                    size=None,
                    mtime=None
                ))
            bitmask >>= 1
    else:
        drives.append(BrowseItem(
            name="根目录 (/)",
            path="/",
            is_dir=True,
            size=None,
            mtime=None
        ))
    return drives


def browse_directory(target_path: Optional[str] = None) -> BrowseResponse:
    """Browse a server directory, or return available drives if target_path is empty."""
    if not target_path or target_path.strip() in ("", "/", "\\") and platform.system() == "Windows":
        drives = get_server_drives()
        return BrowseResponse(
            success=True,
            current_path="",
            parent_path=None,
            items=drives
        )

    norm_path = os.path.abspath(target_path)
    if not os.path.exists(norm_path):
        # Fall back to parent or drives
        norm_path = os.path.dirname(norm_path)
        if not os.path.exists(norm_path):
            drives = get_server_drives()
            return BrowseResponse(
                success=True,
                current_path="",
                parent_path=None,
                items=drives
            )

    parent_path = os.path.dirname(norm_path)
    if parent_path == norm_path:
        # At root
        parent_path = "" if platform.system() == "Windows" else None

    items: List[BrowseItem] = []
    try:
        with os.scandir(norm_path) as it:
            for entry in it:
                try:
                    is_dir = entry.is_dir(follow_symlinks=False)
                    stat = entry.stat(follow_symlinks=False)
                    mtime_str = datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M")
                    size = None if is_dir else stat.st_size
                    items.append(BrowseItem(
                        name=entry.name,
                        path=entry.path,
                        is_dir=is_dir,
                        size=size,
                        mtime=mtime_str
                    ))
                except (OSError, PermissionError):
                    continue
    except (OSError, PermissionError) as e:
        return BrowseResponse(
            success=False,
            current_path=norm_path,
            parent_path=parent_path,
            items=[]
        )

    # Sort directories first, then alphabetically
    items.sort(key=lambda x: (not x.is_dir, x.name.lower()))

    return BrowseResponse(
        success=True,
        current_path=norm_path,
        parent_path=parent_path,
        items=items
    )
