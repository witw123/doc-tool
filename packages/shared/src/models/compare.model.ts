export type DiffStatus =
  | 'EXACT_MATCH'
  | 'ONLY_IN_A'
  | 'ONLY_IN_B'
  | 'DIFFERENT_ATTR'
  | 'MOVED_PATH';

export interface DiffItem {
  id: number;
  filename: string;
  status: DiffStatus;
  status_label: string;
  rel_path_a?: string | null;
  rel_path_b?: string | null;
  size_a?: number | null;
  size_b?: number | null;
  size_a_formatted?: string | null;
  size_b_formatted?: string | null;
  mtime_a?: string | null;
  mtime_b?: string | null;
  ext: string;
  diff_reason?: string | null;
}

export interface CompareSummary {
  dir_a: string;
  dir_b: string;
  comparison_mode: string;
  scan_time_ms: number;
  total_unique_items: number;
  count_exact_match: number;
  count_only_in_a: number;
  count_only_in_b: number;
  count_different_attr: number;
  count_moved: number;
  dir_a_total_files: number;
  dir_b_total_files: number;
  dir_a_total_size: number;
  dir_a_total_size_formatted: string;
  dir_b_total_size: number;
  dir_b_total_size_formatted: string;
  match_percentage: number;
}

export interface CompareRequest {
  dir_a: string;
  dir_b: string;
  mode?: 'prefix_strip' | 'relative_path' | 'filename_only';
  ignore_case?: boolean;
  compare_size?: boolean;
  compare_mtime?: boolean;
  prefix_strip_a?: string | null;
  prefix_strip_b?: string | null;
  delimiter?: string;
  compare_field_indices?: number[];
  filter_prefix?: string | null;
  filter_ext?: string | null;
  ignore_hidden?: boolean;
}

export interface CompareResponse {
  success: boolean;
  message: string;
  summary: CompareSummary;
  diff_items: DiffItem[];
}
