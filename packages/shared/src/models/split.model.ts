export interface SplitFieldItem {
  id: string;
  value: string;     // 用户直接输入的字段内容或符号（如 "项目", "_", "年份", "-", "序号"）
  enabled: boolean;   // 是否开启（开启则输出为数据列；关闭则仅作为拆分定位/跳过，不输出到列）
}

export interface UserTemplate {
  id: string;
  name: string;
  fields: SplitFieldItem[];
  layout: 'grouped_sheets' | 'single_sheet';
  createdAt: number;
}

export interface FilenamePreviewRequest {
  path: string;
  fields: SplitFieldItem[];
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
  fields: SplitFieldItem[];
  layout?: 'grouped_sheets' | 'single_sheet';
}
