"""
Pydantic data models for FileScope Web API.
"""
from typing import List, Dict, Optional, Any, Literal
from pydantic import BaseModel, Field


class PrefixStatItem(BaseModel):
    prefix: str
    match_count: int
    total_size_bytes: int
    size_formatted: str
    percentage: float
    extensions: Dict[str, int] = Field(default_factory=dict)
    sample_files: List[str] = Field(default_factory=list)


class LeafDirectoryItem(BaseModel):
    path: str
    rel_path: str
    depth: int
    is_leaf: bool
    file_count: int
    total_size_bytes: int
    size_formatted: str
    extensions: Dict[str, int] = Field(default_factory=dict)
    prefix_distribution: Dict[str, int] = Field(default_factory=dict)
    sample_files: List[str] = Field(default_factory=list)


class ScanSummary(BaseModel):
    target_path: str
    scan_time_ms: float
    total_files: int
    total_size_bytes: int
    total_size_formatted: str
    total_directories: int
    total_leaf_directories: int
    max_depth: int
    avg_files_per_leaf_dir: float
    max_files_dir: Optional[Dict[str, Any]] = None
    min_files_dir: Optional[Dict[str, Any]] = None
    empty_leaf_dirs_count: int = 0
    top_extensions: Dict[str, int] = Field(default_factory=dict)
    auto_discovered_prefixes: List[str] = Field(default_factory=list)


class ScanRequest(BaseModel):
    path: str
    prefixes: List[str] = Field(default_factory=list)
    include_regex: Optional[str] = None
    exclude_regex: Optional[str] = None
    max_depth: Optional[int] = None
    ignore_hidden: bool = True


class ScanResponse(BaseModel):
    success: bool
    message: str = "Success"
    summary: ScanSummary
    prefix_stats: List[PrefixStatItem] = Field(default_factory=list)
    leaf_directories: List[LeafDirectoryItem] = Field(default_factory=list)
    all_directories: Optional[List[LeafDirectoryItem]] = None


class DiffItem(BaseModel):
    id: int
    filename: str
    status: str  # 'EXACT_MATCH' | 'ONLY_IN_A' | 'ONLY_IN_B' | 'DIFFERENT_ATTR' | 'MOVED_PATH'
    status_label: str
    rel_path_a: Optional[str] = None
    rel_path_b: Optional[str] = None
    size_a: Optional[int] = None
    size_b: Optional[int] = None
    size_a_formatted: Optional[str] = None
    size_b_formatted: Optional[str] = None
    mtime_a: Optional[str] = None
    mtime_b: Optional[str] = None
    ext: str
    diff_reason: Optional[str] = None


class CompareSummary(BaseModel):
    dir_a: str
    dir_b: str
    comparison_mode: str
    scan_time_ms: float
    total_unique_items: int
    count_exact_match: int
    count_only_in_a: int
    count_only_in_b: int
    count_different_attr: int
    count_moved: int
    dir_a_total_files: int
    dir_b_total_files: int
    dir_a_total_size: int
    dir_a_total_size_formatted: str
    dir_b_total_size: int
    dir_b_total_size_formatted: str
    match_percentage: float


class CompareRequest(BaseModel):
    dir_a: str
    dir_b: str
    mode: str = "relative_path"  # 'relative_path' | 'filename_only' | 'prefix_strip'
    ignore_case: bool = False
    compare_size: bool = True
    compare_mtime: bool = False
    prefix_strip_a: Optional[str] = None
    prefix_strip_b: Optional[str] = None
    filter_prefix: Optional[str] = None
    filter_ext: Optional[str] = None
    ignore_hidden: bool = True


class CompareResponse(BaseModel):
    success: bool
    message: str = "Success"
    summary: CompareSummary
    diff_items: List[DiffItem] = Field(default_factory=list)


class OpenFolderRequest(BaseModel):
    path: str


class SelectFolderRequest(BaseModel):
    initial_path: Optional[str] = None


class SelectFolderResponse(BaseModel):
    selected: bool
    path: Optional[str] = None


class FilenameExportRequest(BaseModel):
    path: str
    fields: List[str]
    delimiter: str
    layout: Literal["grouped_sheets", "single_sheet"] = "grouped_sheets"


class FilenamePreviewRequest(BaseModel):
    path: str
    fields: List[str]
    delimiter: str


class FilenamePreviewResponse(BaseModel):
    success: bool
    message: str = "Success"
    headers: List[str] = Field(default_factory=list)
    rows: List[List[str]] = Field(default_factory=list)
    file_count: int = 0
    leaf_count: int = 0
    unmatched_count: int = 0
