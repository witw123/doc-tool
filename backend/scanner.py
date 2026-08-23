"""
Directory scanner engine: prefix statistics, leaf directory discovery, and rollup aggregation.
Supports default automatic identification of shared prefix fields across filenames.
"""
import os
import re
import time
from collections import defaultdict
from typing import List, Dict, Tuple, Optional, Any
from backend.models import (
    ScanRequest,
    ScanResponse,
    ScanSummary,
    PrefixStatItem,
    LeafDirectoryItem,
)


def format_size(bytes_val: int) -> str:
    """Format bytes into human-readable string."""
    if bytes_val < 1024:
        return f"{bytes_val} B"
    elif bytes_val < 1024 * 1024:
        return f"{bytes_val / 1024:.2f} KB"
    elif bytes_val < 1024 * 1024 * 1024:
        return f"{bytes_val / (1024 * 1024):.2f} MB"
    else:
        return f"{bytes_val / (1024 * 1024 * 1024):.2f} GB"


def extract_candidate_prefixes(filename: str) -> List[str]:
    """
    Extract meaningful candidate prefix fields from a filename.
    Examples:
      - 'DOC_2024_report.docx' -> ['DOC_', 'DOC_2024_']
      - 'IMG_RAW_0001.jpg' -> ['IMG_', 'IMG_RAW_']
      - 'order-2024-01.pdf' -> ['order-']
      - 'REPORT 2024.pdf' -> ['REPORT ']
      - 'IMG0001.jpg' -> ['IMG']
      - '【财务】2024报表.xlsx' -> ['【财务】']
      - '2024_Q1.xlsx' -> ['2024_']
    """
    name_without_ext = os.path.splitext(filename)[0]
    candidates = []

    # 1. Delimiter-based tokens (e.g. _, -, ., space, brackets)
    delimiters = r'([_\-\. \u3010\u3011\uff08\uff09\(\)\[\]])'
    parts = re.split(delimiters, name_without_ext)
    
    if len(parts) >= 3:
        # First prefix token (e.g., 'DOC_')
        first_token = parts[0] + parts[1]
        if len(first_token) >= 2:
            candidates.append(first_token)
        
        # Second compound prefix token if available (e.g., 'DOC_2024_')
        if len(parts) >= 5:
            second_token = parts[0] + parts[1] + parts[2] + parts[3]
            if len(second_token) >= 4 and not second_token.endswith('.'):
                candidates.append(second_token)

    # 2. Chinese bracketed tags like 【财务】 or （报表）
    chinese_match = re.match(r"^([\u3010\uff08\[\(].*?[\u3011\uff09\]\)])", name_without_ext)
    if chinese_match:
        tag = chinese_match.group(1)
        if tag not in candidates:
            candidates.append(tag)

    # 3. Alpha prefix followed by digits (e.g. 'IMG0001' -> 'IMG', 'DOC2024' -> 'DOC')
    alpha_digit = re.match(r"^([a-zA-Z]{2,})(?=[0-9])", name_without_ext)
    if alpha_digit:
        p = alpha_digit.group(1)
        if p not in candidates:
            candidates.append(p)

    # 4. Year/Date prefix e.g. 2024_ or 2024-
    year_prefix = re.match(r"^([0-9]{4}[_\-\.])", name_without_ext)
    if year_prefix:
        yp = year_prefix.group(1)
        if yp not in candidates:
            candidates.append(yp)

    return candidates


def cluster_common_prefixes(files_info: List[Tuple[str, str, int, str]]) -> Dict[str, List[Tuple[str, str, int, str]]]:
    """
    Cluster files by their common shared prefix fields.
    Each file tuple: (filename, rel_path, file_size, ext)
    """
    # Step 1: Count occurrences of all candidate prefixes across all files
    prefix_candidates_count: Dict[str, int] = defaultdict(int)
    file_candidates_map: Dict[str, List[str]] = {}

    for filename, _, _, _ in files_info:
        cands = extract_candidate_prefixes(filename)
        file_candidates_map[filename] = cands
        for c in cands:
            prefix_candidates_count[c] += 1

    # Step 2: Keep candidate prefixes that appear in at least 1 file, sorted by specificity (length) & frequency
    # We prioritize common prefixes that have multiple files or distinct delimiter tokens
    valid_prefixes = sorted(
        prefix_candidates_count.keys(),
        key=lambda p: (prefix_candidates_count[p] > 1, len(p), prefix_candidates_count[p]),
        reverse=True
    )

    # Step 3: Assign each file to its most specific matched prefix
    clusters: Dict[str, List[Tuple[str, str, int, str]]] = defaultdict(list)
    unassigned: List[Tuple[str, str, int, str]] = []

    for item in files_info:
        filename, rel_path, size, ext = item
        assigned = False

        # Try to match the best valid prefix for this file
        for p in valid_prefixes:
            if filename.startswith(p):
                clusters[p].append(item)
                assigned = True
                break

        if not assigned:
            unassigned.append(item)

    if unassigned:
        clusters["[无固定前缀]"] = unassigned

    return clusters


class DirectoryScanner:
    def __init__(self, request: ScanRequest):
        self.request = request
        self.target_path = os.path.abspath(request.path)
        self.include_re = re.compile(request.include_regex) if request.include_regex else None
        self.exclude_re = re.compile(request.exclude_regex) if request.exclude_regex else None
        self.ignore_hidden = request.ignore_hidden
        self.prefixes = [p.strip() for p in request.prefixes if p.strip()]

    def scan(self) -> ScanResponse:
        start_time = time.perf_counter()

        if not os.path.exists(self.target_path):
            raise FileNotFoundError(f"Path does not exist: {self.target_path}")
        if not os.path.isdir(self.target_path):
            raise NotADirectoryError(f"Path is not a directory: {self.target_path}")

        # Metrics accumulators
        all_directories: List[Dict[str, Any]] = []
        global_ext_counts: Dict[str, int] = defaultdict(int)
        all_scanned_files: List[Tuple[str, str, int, str]] = [] # (filename, rel_file_path, size, ext)
        
        # User specified prefix metrics
        user_prefix_counts: Dict[str, int] = defaultdict(int)
        user_prefix_sizes: Dict[str, int] = defaultdict(int)
        user_prefix_exts: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        user_prefix_samples: Dict[str, List[str]] = defaultdict(list)

        total_files = 0
        total_size = 0
        max_depth_seen = 0

        unmatched_user_count = 0
        unmatched_user_size = 0
        unmatched_user_exts: Dict[str, int] = defaultdict(int)
        unmatched_user_samples: List[str] = []

        # Traverse directory tree
        for root, dirs, files in os.walk(self.target_path, topdown=True):
            rel_path = os.path.relpath(root, self.target_path)
            if rel_path == ".":
                rel_path = ""
                current_depth = 0
            else:
                current_depth = len(rel_path.replace("\\", "/").split("/"))

            if current_depth > max_depth_seen:
                max_depth_seen = current_depth

            if self.ignore_hidden:
                dirs[:] = [d for d in dirs if not d.startswith(".")]

            if self.request.max_depth is not None and current_depth >= self.request.max_depth:
                dirs.clear()

            valid_files = []
            dir_size = 0
            dir_ext_counts: Dict[str, int] = defaultdict(int)
            dir_prefix_counts: Dict[str, int] = defaultdict(int)
            dir_samples: List[str] = []

            for filename in files:
                if self.ignore_hidden and filename.startswith("."):
                    continue
                if self.include_re and not self.include_re.search(filename):
                    continue
                if self.exclude_re and self.exclude_re.search(filename):
                    continue

                full_file_path = os.path.join(root, filename)
                try:
                    f_stat = os.stat(full_file_path)
                    f_size = f_stat.st_size
                except (OSError, PermissionError):
                    f_size = 0

                valid_files.append((filename, f_size))
                dir_size += f_size
                total_size += f_size
                total_files += 1

                ext = os.path.splitext(filename)[1].lower() or "[no ext]"
                dir_ext_counts[ext] += 1
                global_ext_counts[ext] += 1

                rel_file = os.path.join(rel_path, filename).replace("\\", "/")
                all_scanned_files.append((filename, rel_file, f_size, ext))

                # If user provided custom prefixes, track them
                if self.prefixes:
                    matched_any = False
                    for p in self.prefixes:
                        if filename.startswith(p):
                            matched_any = True
                            dir_prefix_counts[p] += 1
                            user_prefix_counts[p] += 1
                            user_prefix_sizes[p] += f_size
                            user_prefix_exts[p][ext] += 1
                            if len(user_prefix_samples[p]) < 8:
                                user_prefix_samples[p].append(rel_file)

                    if not matched_any:
                        unmatched_user_count += 1
                        unmatched_user_size += f_size
                        unmatched_user_exts[ext] += 1
                        if len(unmatched_user_samples) < 8:
                            unmatched_user_samples.append(rel_file)

                if len(dir_samples) < 6:
                    dir_samples.append(filename)

            is_leaf = (len(dirs) == 0)

            all_directories.append({
                "path": root,
                "rel_path": rel_path or "(根目录)",
                "depth": current_depth,
                "is_leaf": is_leaf,
                "file_count": len(valid_files),
                "total_size_bytes": dir_size,
                "size_formatted": format_size(dir_size),
                "extensions": dict(dir_ext_counts),
                "prefix_distribution": dict(dir_prefix_counts),
                "sample_files": dir_samples,
            })

        # Process prefix stats list
        prefix_stat_items: List[PrefixStatItem] = []
        auto_discovered_prefixes_list: List[str] = []

        if self.prefixes:
            # Custom prefixes mode
            for p in self.prefixes:
                count = user_prefix_counts.get(p, 0)
                sz = user_prefix_sizes.get(p, 0)
                pct = round((count / total_files * 100), 2) if total_files > 0 else 0.0
                prefix_stat_items.append(PrefixStatItem(
                    prefix=p,
                    match_count=count,
                    total_size_bytes=sz,
                    size_formatted=format_size(sz),
                    percentage=pct,
                    extensions=dict(user_prefix_exts[p]),
                    sample_files=user_prefix_samples[p],
                ))

            if unmatched_user_count > 0:
                other_pct = round((unmatched_user_count / total_files * 100), 2) if total_files > 0 else 0.0
                prefix_stat_items.append(PrefixStatItem(
                    prefix="[其他/未匹配]",
                    match_count=unmatched_user_count,
                    total_size_bytes=unmatched_user_size,
                    size_formatted=format_size(unmatched_user_size),
                    percentage=other_pct,
                    extensions=dict(unmatched_user_exts),
                    sample_files=unmatched_user_samples,
                ))
        else:
            # DEFAULT AUTOMATIC IDENTIFICATION of shared prefix fields
            clusters = cluster_common_prefixes(all_scanned_files)
            
            # Sort clusters: named prefixes first by count descending, [无固定前缀] at the end
            sorted_prefix_keys = sorted(
                [k for k in clusters.keys() if k != "[无固定前缀]"],
                key=lambda k: len(clusters[k]),
                reverse=True
            )

            for p in sorted_prefix_keys:
                items = clusters[p]
                count = len(items)
                sz = sum(x[2] for x in items)
                pct = round((count / total_files * 100), 2) if total_files > 0 else 0.0
                
                exts: Dict[str, int] = defaultdict(int)
                samples: List[str] = []
                for _, rel_f, _, e in items:
                    exts[e] += 1
                    if len(samples) < 8:
                        samples.append(rel_f)

                prefix_stat_items.append(PrefixStatItem(
                    prefix=p,
                    match_count=count,
                    total_size_bytes=sz,
                    size_formatted=format_size(sz),
                    percentage=pct,
                    extensions=dict(exts),
                    sample_files=samples,
                ))
                auto_discovered_prefixes_list.append(f"{p} ({count}个)")

            # Append unassigned files group if present
            if "[无固定前缀]" in clusters:
                unassigned = clusters["[无固定前缀]"]
                count = len(unassigned)
                sz = sum(x[2] for x in unassigned)
                pct = round((count / total_files * 100), 2) if total_files > 0 else 0.0
                
                exts: Dict[str, int] = defaultdict(int)
                samples: List[str] = []
                for _, rel_f, _, e in unassigned:
                    exts[e] += 1
                    if len(samples) < 8:
                        samples.append(rel_f)

                prefix_stat_items.append(PrefixStatItem(
                    prefix="[无固定前缀]",
                    match_count=count,
                    total_size_bytes=sz,
                    size_formatted=format_size(sz),
                    percentage=pct,
                    extensions=dict(exts),
                    sample_files=samples,
                ))

        # Leaf directories processing
        leaf_dirs = [d for d in all_directories if d["is_leaf"]]
        leaf_dirs.sort(key=lambda x: x["file_count"], reverse=True)

        leaf_items: List[LeafDirectoryItem] = [
            LeafDirectoryItem(**d) for d in leaf_dirs
        ]

        all_dir_items: List[LeafDirectoryItem] = [
            LeafDirectoryItem(**d) for d in all_directories
        ]

        # Aggregate Statistics
        total_leaf_dirs = len(leaf_dirs)
        avg_files_leaf = round(total_files / total_leaf_dirs, 2) if total_leaf_dirs > 0 else 0.0

        max_leaf = leaf_dirs[0] if leaf_dirs else None
        non_empty_leafs = [d for d in leaf_dirs if d["file_count"] > 0]
        min_leaf = min(non_empty_leafs, key=lambda x: x["file_count"]) if non_empty_leafs else None
        empty_leafs_count = sum(1 for d in leaf_dirs if d["file_count"] == 0)

        sorted_exts = dict(sorted(global_ext_counts.items(), key=lambda x: x[1], reverse=True)[:15])
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        summary = ScanSummary(
            target_path=self.target_path,
            scan_time_ms=duration_ms,
            total_files=total_files,
            total_size_bytes=total_size,
            total_size_formatted=format_size(total_size),
            total_directories=len(all_directories),
            total_leaf_directories=total_leaf_dirs,
            max_depth=max_depth_seen,
            avg_files_per_leaf_dir=avg_files_leaf,
            max_files_dir={
                "rel_path": max_leaf["rel_path"],
                "file_count": max_leaf["file_count"],
                "size_formatted": max_leaf["size_formatted"],
            } if max_leaf else None,
            min_files_dir={
                "rel_path": min_leaf["rel_path"],
                "file_count": min_leaf["file_count"],
                "size_formatted": min_leaf["size_formatted"],
            } if min_leaf else None,
            empty_leaf_dirs_count=empty_leafs_count,
            top_extensions=sorted_exts,
            auto_discovered_prefixes=auto_discovered_prefixes_list,
        )

        return ScanResponse(
            success=True,
            message="Scan completed successfully",
            summary=summary,
            prefix_stats=prefix_stat_items,
            leaf_directories=leaf_items,
            all_directories=all_dir_items,
        )
