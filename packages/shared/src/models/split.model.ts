export interface FilenamePreviewRequest {
  path: string;
  fields: string[];
  delimiter: string;
}

export interface FilenamePreviewResponse {
  success: boolean;
  message: string;
  headers: string[];
  rows: string[][];
  file_count: number;
  leaf_count: number;
  unmatched_count: number;
}

export interface FilenameExportRequest {
  path: string;
  fields: string[];
  delimiter: string;
  layout?: 'grouped_sheets' | 'single_sheet';
}
