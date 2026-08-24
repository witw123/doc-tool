export interface PrefixFileItem {
  filename: string;
  folder_name: string;
  rel_path: string;
  size_bytes: number;
  size_formatted: string;
  ext: string;
}

export interface PrefixStatItem {
  prefix: string;
  match_count: number;
  total_size_bytes: number;
  size_formatted: string;
  percentage: number;
  extensions: Record<string, number>;
  sample_files: string[];
  folders?: string[];
  files?: PrefixFileItem[];
}

export interface LeafDirectoryItem {
  path: string;
  rel_path: string;
  depth: number;
  is_leaf: boolean;
  file_count: number;
  total_size_bytes: number;
  size_formatted: string;
  extensions: Record<string, number>;
  prefix_distribution: Record<string, number>;
  sample_files: string[];
}

export interface ScanSummary {
  target_path: string;
  scan_time_ms: number;
  total_files: number;
  total_size_bytes: number;
  total_size_formatted: string;
  total_directories: number;
  total_leaf_directories: number;
  max_depth: number;
  avg_files_per_leaf_dir: number;
  max_files_dir?: {
    rel_path: string;
    file_count: number;
    size_formatted: string;
  } | null;
  min_files_dir?: {
    rel_path: string;
    file_count: number;
    size_formatted: string;
  } | null;
  empty_leaf_dirs_count: number;
  top_extensions: Record<string, number>;
  auto_discovered_prefixes: string[];
}

export interface ScanRequest {
  path: string;
  prefixes?: string[];
  include_regex?: string | null;
  exclude_regex?: string | null;
  max_depth?: number | null;
  ignore_hidden?: boolean;
}

export interface ScanResponse {
  success: boolean;
  message: string;
  summary: ScanSummary;
  prefix_stats: PrefixStatItem[];
  leaf_directories: LeafDirectoryItem[];
  all_directories?: LeafDirectoryItem[];
}
