export interface UserTemplate {
  id: string;
  name: string;
  pattern: string;    // 正则表达式捕获规则，例如 ^(\d+kV)(.*?线)(.*?支线)_(.*?)_(.+)$
  columns: string[];  // 提取的目标列名列表，例如 ['电压等级', '主线路名', '支线名称', '部件位置', '缺陷现象']
  layout: 'grouped_sheets' | 'single_sheet';
  createdAt: number;
}

export interface FilenamePreviewRequest {
  path: string;
  pattern: string;
  columns: string[];
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
  pattern: string;
  columns: string[];
  layout?: 'grouped_sheets' | 'single_sheet';
}
