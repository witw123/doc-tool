import {
  ScanRequest,
  ScanResponse,
  CompareRequest,
  CompareResponse,
  BrowseResponse,
  OpenFolderRequest,
  OpenFolderResponse,
  HealthResponse,
  FilenamePreviewRequest,
  FilenamePreviewResponse,
  FilenameExportRequest,
} from '@doc-tool/shared';

const API_BASE = '/api';

async function fetchJSON<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.detail || `请求失败 (HTTP ${res.status})`);
  }
  return data as T;
}

export async function apiScanDirectory(payload: ScanRequest): Promise<ScanResponse> {
  return fetchJSON<ScanResponse>('/scan', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiCompareDirectories(payload: CompareRequest): Promise<CompareResponse> {
  return fetchJSON<CompareResponse>('/compare', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiBrowseDirectory(pathQuery?: string): Promise<BrowseResponse> {
  const query = pathQuery ? `?path=${encodeURIComponent(pathQuery)}` : '';
  return fetchJSON<BrowseResponse>(`/browse${query}`, {
    method: 'GET',
  });
}

export async function apiOpenSystemFolder(targetPath: string): Promise<OpenFolderResponse> {
  return fetchJSON<OpenFolderResponse>('/open-system-folder', {
    method: 'POST',
    body: JSON.stringify({ path: targetPath } satisfies OpenFolderRequest),
  });
}

export async function apiCheckHealth(): Promise<HealthResponse> {
  return fetchJSON<HealthResponse>('/health', {
    method: 'GET',
  });
}

export async function apiPreviewFilenameSplit(
  payload: FilenamePreviewRequest
): Promise<FilenamePreviewResponse> {
  return fetchJSON<FilenamePreviewResponse>('/filename-split/preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiExportFilenameSplitXlsx(
  payload: FilenameExportRequest
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${API_BASE}/filename-split/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let errMessage = `导出失败 (HTTP ${res.status})`;
    try {
      const errData = await res.json();
      errMessage = errData.message || errMessage;
    } catch {
      // ignore
    }
    throw new Error(errMessage);
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  let filename = 'filename_split_export.xlsx';
  const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
  if (match && match[1]) {
    filename = decodeURIComponent(match[1]);
  }

  const blob = await res.blob();
  return { blob, filename };
}
