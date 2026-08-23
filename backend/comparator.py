"""
Dual-directory comparison engine: filename matching, relative path diff, and difference tracking.
"""
import os
import time
from datetime import datetime
from collections import defaultdict
from typing import List, Dict, Tuple, Optional, Any, Set
from backend.models import (
    CompareRequest,
    CompareResponse,
    CompareSummary,
    DiffItem,
)
from backend.scanner import format_size


def format_mtime(timestamp: float) -> str:
    """Format unix timestamp into readable date time string."""
    try:
        return datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return "-"


class FileEntry:
    def __init__(self, full_path: str, base_dir: str):
        self.full_path = full_path
        self.filename = os.path.basename(full_path)
        self.rel_path = os.path.relpath(full_path, base_dir).replace("\\", "/")
        self.ext = os.path.splitext(self.filename)[1].lower() or "[no ext]"
        try:
            stat = os.stat(full_path)
            self.size = stat.st_size
            self.mtime = stat.st_mtime
        except (OSError, PermissionError):
            self.size = 0
            self.mtime = 0.0


class DirectoryComparator:
    def __init__(self, request: CompareRequest):
        self.request = request
        self.dir_a = os.path.abspath(request.dir_a)
        self.dir_b = os.path.abspath(request.dir_b)
        self.mode = request.mode  # 'relative_path' | 'filename_only' | 'prefix_strip'
        self.ignore_case = request.ignore_case
        self.compare_size = request.compare_size
        self.compare_mtime = request.compare_mtime
        self.prefix_strip_a = request.prefix_strip_a or ""
        self.prefix_strip_b = request.prefix_strip_b or ""
        self.filter_prefix = request.filter_prefix.strip() if request.filter_prefix else None
        self.filter_ext = request.filter_ext.strip().lower() if request.filter_ext else None
        self.ignore_hidden = request.ignore_hidden

    def _normalize_key(self, raw_str: str) -> str:
        s = raw_str
        if self.ignore_case:
            s = s.lower()
        return s

    def _collect_files(self, base_dir: str) -> List[FileEntry]:
        entries: List[FileEntry] = []
        if not os.path.exists(base_dir):
            raise FileNotFoundError(f"Directory not found: {base_dir}")
        if not os.path.isdir(base_dir):
            raise NotADirectoryError(f"Path is not a directory: {base_dir}")

        for root, dirs, files in os.walk(base_dir):
            if self.ignore_hidden:
                dirs[:] = [d for d in dirs if not d.startswith(".")]

            for filename in files:
                if self.ignore_hidden and filename.startswith("."):
                    continue
                if self.filter_prefix and not filename.startswith(self.filter_prefix):
                    continue
                if self.filter_ext:
                    ext = os.path.splitext(filename)[1].lower()
                    if ext != self.filter_ext:
                        continue

                full_path = os.path.join(root, filename)
                entries.append(FileEntry(full_path, base_dir))
        return entries

    def compare(self) -> CompareResponse:
        start_time = time.perf_counter()

        entries_a = self._collect_files(self.dir_a)
        entries_b = self._collect_files(self.dir_b)

        # Indexing Directory A
        # Key by relative path
        rel_map_a: Dict[str, FileEntry] = {}
        # Key by filename
        name_map_a: Dict[str, List[FileEntry]] = defaultdict(list)
        total_size_a = 0
        for entry in entries_a:
            rel_key = self._normalize_key(entry.rel_path)
            name_key = self._normalize_key(entry.filename)
            rel_map_a[rel_key] = entry
            name_map_a[name_key].append(entry)
            total_size_a += entry.size

        # Indexing Directory B
        rel_map_b: Dict[str, FileEntry] = {}
        name_map_b: Dict[str, List[FileEntry]] = defaultdict(list)
        total_size_b = 0
        for entry in entries_b:
            rel_key = self._normalize_key(entry.rel_path)
            name_key = self._normalize_key(entry.filename)
            rel_map_b[rel_key] = entry
            name_map_b[name_key].append(entry)
            total_size_b += entry.size

        diff_items: List[DiffItem] = []
        item_id = 1

        count_exact_match = 0
        count_only_in_a = 0
        count_only_in_b = 0
        count_different_attr = 0
        count_moved = 0

        # COMPARISON MODE 1: Relative Path Mode (Default & Most Strict)
        if self.mode == "relative_path":
            all_rel_keys = set(rel_map_a.keys()) | set(rel_map_b.keys())
            for rel_key in sorted(all_rel_keys):
                in_a = rel_map_a.get(rel_key)
                in_b = rel_map_b.get(rel_key)

                if in_a and in_b:
                    # Present in both with same relative path
                    size_diff = self.compare_size and (in_a.size != in_b.size)
                    mtime_diff = self.compare_mtime and (abs(in_a.mtime - in_b.mtime) > 2)

                    if size_diff or mtime_diff:
                        status = "DIFFERENT_ATTR"
                        status_label = "属性差异"
                        reasons = []
                        if size_diff:
                            reasons.append(f"大小不同 (A: {format_size(in_a.size)}, B: {format_size(in_b.size)})")
                        if mtime_diff:
                            reasons.append("修改时间不同")
                        diff_reason = "; ".join(reasons)
                        count_different_attr += 1
                    else:
                        status = "EXACT_MATCH"
                        status_label = "完全一致"
                        diff_reason = "相对路径与文件属性完全匹配"
                        count_exact_match += 1

                    diff_items.append(DiffItem(
                        id=item_id,
                        filename=in_a.filename,
                        status=status,
                        status_label=status_label,
                        rel_path_a=in_a.rel_path,
                        rel_path_b=in_b.rel_path,
                        size_a=in_a.size,
                        size_b=in_b.size,
                        size_a_formatted=format_size(in_a.size),
                        size_b_formatted=format_size(in_b.size),
                        mtime_a=format_mtime(in_a.mtime),
                        mtime_b=format_mtime(in_b.mtime),
                        ext=in_a.ext,
                        diff_reason=diff_reason,
                    ))
                elif in_a and not in_b:
                    # In A, not in B with this relative path
                    # Check if filename exists anywhere in B (Moved candidate)
                    name_key = self._normalize_key(in_a.filename)
                    if name_key in name_map_b:
                        matched_b = name_map_b[name_key][0]
                        status = "MOVED_PATH"
                        status_label = "路径不同"
                        diff_reason = f"同名文件在B的不同路径: {matched_b.rel_path}"
                        count_moved += 1
                        diff_items.append(DiffItem(
                            id=item_id,
                            filename=in_a.filename,
                            status=status,
                            status_label=status_label,
                            rel_path_a=in_a.rel_path,
                            rel_path_b=matched_b.rel_path,
                            size_a=in_a.size,
                            size_b=matched_b.size,
                            size_a_formatted=format_size(in_a.size),
                            size_b_formatted=format_size(matched_b.size),
                            mtime_a=format_mtime(in_a.mtime),
                            mtime_b=format_mtime(matched_b.mtime),
                            ext=in_a.ext,
                            diff_reason=diff_reason,
                        ))
                    else:
                        status = "ONLY_IN_A"
                        status_label = "仅在目录A"
                        diff_reason = "目录B中缺失该文件"
                        count_only_in_a += 1
                        diff_items.append(DiffItem(
                            id=item_id,
                            filename=in_a.filename,
                            status=status,
                            status_label=status_label,
                            rel_path_a=in_a.rel_path,
                            rel_path_b=None,
                            size_a=in_a.size,
                            size_b=None,
                            size_a_formatted=format_size(in_a.size),
                            size_b_formatted=None,
                            mtime_a=format_mtime(in_a.mtime),
                            mtime_b=None,
                            ext=in_a.ext,
                            diff_reason=diff_reason,
                        ))
                elif in_b and not in_a:
                    # In B, not in A with this relative path
                    name_key = self._normalize_key(in_b.filename)
                    if name_key in name_map_a:
                        # Already covered by in_a loop as MOVED_PATH if it was processed
                        # If not already recorded:
                        matched_a = name_map_a[name_key][0]
                        # Don't double count if we already linked them
                        pass
                    else:
                        status = "ONLY_IN_B"
                        status_label = "仅在目录B"
                        diff_reason = "目录A中缺失该文件"
                        count_only_in_b += 1
                        diff_items.append(DiffItem(
                            id=item_id,
                            filename=in_b.filename,
                            status=status,
                            status_label=status_label,
                            rel_path_a=None,
                            rel_path_b=in_b.rel_path,
                            size_a=None,
                            size_b=in_b.size,
                            size_a_formatted=None,
                            size_b_formatted=format_size(in_b.size),
                            mtime_a=None,
                            mtime_b=format_mtime(in_b.mtime),
                            ext=in_b.ext,
                            diff_reason=diff_reason,
                        ))
                item_id += 1

        # COMPARISON MODE 2: Filename Only (Ignore Hierarchy)
        elif self.mode == "filename_only":
            all_name_keys = set(name_map_a.keys()) | set(name_map_b.keys())
            for name_key in sorted(all_name_keys):
                in_a_list = name_map_a.get(name_key, [])
                in_b_list = name_map_b.get(name_key, [])

                if in_a_list and in_b_list:
                    in_a = in_a_list[0]
                    in_b = in_b_list[0]
                    path_diff = (in_a.rel_path != in_b.rel_path)
                    size_diff = self.compare_size and (in_a.size != in_b.size)

                    if path_diff:
                        status = "MOVED_PATH"
                        status_label = "路径不同"
                        diff_reason = f"A路径: {in_a.rel_path} | B路径: {in_b.rel_path}"
                        count_moved += 1
                    elif size_diff:
                        status = "DIFFERENT_ATTR"
                        status_label = "属性差异"
                        diff_reason = f"大小不同 (A: {format_size(in_a.size)}, B: {format_size(in_b.size)})"
                        count_different_attr += 1
                    else:
                        status = "EXACT_MATCH"
                        status_label = "完全一致"
                        diff_reason = "文件名与路径完全一致"
                        count_exact_match += 1

                    diff_items.append(DiffItem(
                        id=item_id,
                        filename=in_a.filename,
                        status=status,
                        status_label=status_label,
                        rel_path_a=in_a.rel_path,
                        rel_path_b=in_b.rel_path,
                        size_a=in_a.size,
                        size_b=in_b.size,
                        size_a_formatted=format_size(in_a.size),
                        size_b_formatted=format_size(in_b.size),
                        mtime_a=format_mtime(in_a.mtime),
                        mtime_b=format_mtime(in_b.mtime),
                        ext=in_a.ext,
                        diff_reason=diff_reason,
                    ))
                elif in_a_list and not in_b_list:
                    for in_a in in_a_list:
                        count_only_in_a += 1
                        diff_items.append(DiffItem(
                            id=item_id,
                            filename=in_a.filename,
                            status="ONLY_IN_A",
                            status_label="仅在目录A",
                            rel_path_a=in_a.rel_path,
                            rel_path_b=None,
                            size_a=in_a.size,
                            size_b=None,
                            size_a_formatted=format_size(in_a.size),
                            size_b_formatted=None,
                            mtime_a=format_mtime(in_a.mtime),
                            mtime_b=None,
                            ext=in_a.ext,
                            diff_reason="目录B中无此文件名",
                        ))
                        item_id += 1
                    continue
                elif in_b_list and not in_a_list:
                    for in_b in in_b_list:
                        count_only_in_b += 1
                        diff_items.append(DiffItem(
                            id=item_id,
                            filename=in_b.filename,
                            status="ONLY_IN_B",
                            status_label="仅在目录B",
                            rel_path_a=None,
                            rel_path_b=in_b.rel_path,
                            size_a=None,
                            size_b=in_b.size,
                            size_a_formatted=None,
                            size_b_formatted=format_size(in_b.size),
                            mtime_a=None,
                            mtime_b=format_mtime(in_b.mtime),
                            ext=in_b.ext,
                            diff_reason="目录A中无此文件名",
                        ))
                        item_id += 1
                    continue
                item_id += 1

        # COMPARISON MODE 3: Prefix Strip Mode
        elif self.mode == "prefix_strip":
            # Map stripped name to entry
            strip_map_a: Dict[str, FileEntry] = {}
            for entry in entries_a:
                stripped = entry.filename
                if self.prefix_strip_a and stripped.startswith(self.prefix_strip_a):
                    stripped = stripped[len(self.prefix_strip_a):]
                k = self._normalize_key(stripped)
                strip_map_a[k] = entry

            strip_map_b: Dict[str, FileEntry] = {}
            for entry in entries_b:
                stripped = entry.filename
                if self.prefix_strip_b and stripped.startswith(self.prefix_strip_b):
                    stripped = stripped[len(self.prefix_strip_b):]
                k = self._normalize_key(stripped)
                strip_map_b[k] = entry

            all_stripped_keys = set(strip_map_a.keys()) | set(strip_map_b.keys())
            for skey in sorted(all_stripped_keys):
                in_a = strip_map_a.get(skey)
                in_b = strip_map_b.get(skey)

                if in_a and in_b:
                    size_diff = self.compare_size and (in_a.size != in_b.size)
                    if size_diff:
                        status = "DIFFERENT_ATTR"
                        status_label = "属性差异"
                        diff_reason = f"去除前缀后匹配成功，但大小不同 (A:{in_a.filename}, B:{in_b.filename})"
                        count_different_attr += 1
                    else:
                        status = "EXACT_MATCH"
                        status_label = "完全一致"
                        diff_reason = f"去除前缀后主干一致 (A:{in_a.filename}, B:{in_b.filename})"
                        count_exact_match += 1

                    diff_items.append(DiffItem(
                        id=item_id,
                        filename=f"{in_a.filename} ⇄ {in_b.filename}",
                        status=status,
                        status_label=status_label,
                        rel_path_a=in_a.rel_path,
                        rel_path_b=in_b.rel_path,
                        size_a=in_a.size,
                        size_b=in_b.size,
                        size_a_formatted=format_size(in_a.size),
                        size_b_formatted=format_size(in_b.size),
                        mtime_a=format_mtime(in_a.mtime),
                        mtime_b=format_mtime(in_b.mtime),
                        ext=in_a.ext,
                        diff_reason=diff_reason,
                    ))
                elif in_a and not in_b:
                    count_only_in_a += 1
                    diff_items.append(DiffItem(
                        id=item_id,
                        filename=in_a.filename,
                        status="ONLY_IN_A",
                        status_label="仅在目录A",
                        rel_path_a=in_a.rel_path,
                        rel_path_b=None,
                        size_a=in_a.size,
                        size_b=None,
                        size_a_formatted=format_size(in_a.size),
                        size_b_formatted=None,
                        mtime_a=format_mtime(in_a.mtime),
                        mtime_b=None,
                        ext=in_a.ext,
                        diff_reason="去除前缀后在目录B中未找到匹配",
                    ))
                elif in_b and not in_a:
                    count_only_in_b += 1
                    diff_items.append(DiffItem(
                        id=item_id,
                        filename=in_b.filename,
                        status="ONLY_IN_B",
                        status_label="仅在目录B",
                        rel_path_a=None,
                        rel_path_b=in_b.rel_path,
                        size_a=None,
                        size_b=in_b.size,
                        size_a_formatted=None,
                        size_b_formatted=format_size(in_b.size),
                        mtime_a=None,
                        mtime_b=format_mtime(in_b.mtime),
                        ext=in_b.ext,
                        diff_reason="去除前缀后在目录A中未找到匹配",
                    ))
                item_id += 1

        total_unique = len(diff_items)
        match_pct = round((count_exact_match / total_unique * 100), 2) if total_unique > 0 else 0.0
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        summary = CompareSummary(
            dir_a=self.dir_a,
            dir_b=self.dir_b,
            comparison_mode=self.mode,
            scan_time_ms=duration_ms,
            total_unique_items=total_unique,
            count_exact_match=count_exact_match,
            count_only_in_a=count_only_in_a,
            count_only_in_b=count_only_in_b,
            count_different_attr=count_different_attr,
            count_moved=count_moved,
            dir_a_total_files=len(entries_a),
            dir_b_total_files=len(entries_b),
            dir_a_total_size=total_size_a,
            dir_a_total_size_formatted=format_size(total_size_a),
            dir_b_total_size=total_size_b,
            dir_b_total_size_formatted=format_size(total_size_b),
            match_percentage=match_pct,
        )

        return CompareResponse(
            success=True,
            message="Comparison completed successfully",
            summary=summary,
            diff_items=diff_items,
        )
