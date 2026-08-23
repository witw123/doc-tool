/**
 * API client module for FileScope Web
 */

const API_BASE = '';

async function fetchJSON(url, options = {}) {
  try {
    const response = await fetch(API_BASE + url, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || data.message || `请求失败 (HTTP ${response.status})`);
    }
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Scan single directory
async function apiScanDirectory(payload) {
  return await fetchJSON('/api/scan', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

// Compare two directories
async function apiCompareDirectories(payload) {
  return await fetchJSON('/api/compare', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

async function apiSelectLocalFolder(initialPath = '') {
  return await fetchJSON('/api/select-local-folder', {
    method: 'POST',
    body: JSON.stringify({ initial_path: initialPath || null }),
  });
}

// Open host OS system folder
async function apiOpenSystemFolder(path) {
  return await fetchJSON('/api/open-system-folder', {
    method: 'POST',
    body: JSON.stringify({ path: path })
  });
}

// Export filename-split workbook as a binary download.
async function apiExportFilenameXlsx(payload) {
  const response = await fetch(API_BASE + '/api/export-filename-xlsx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(data.detail || `请求失败 (HTTP ${response.status})`);
  }

  return {
    blob: await response.blob(),
    filename: parseDownloadFilename(response.headers.get('Content-Disposition')) || 'filename_split_export.xlsx',
    fileCount: response.headers.get('X-Export-File-Count') || '0',
    leafCount: response.headers.get('X-Export-Leaf-Count') || '0',
    unmatchedCount: response.headers.get('X-Export-Unmatched-Count') || '0',
  };
}

async function apiPreviewFilename(payload) {
  return await fetchJSON('/api/preview-filename', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function parseDownloadFilename(contentDisposition) {
  if (!contentDisposition) return '';
  const match = contentDisposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  return match ? decodeURIComponent(match[1].replace(/\"/g, '').trim()) : '';
}

// Server Health
async function apiCheckHealth() {
  return await fetchJSON('/api/health', {
    method: 'GET'
  });
}

window.apiScanDirectory = apiScanDirectory;
window.apiCompareDirectories = apiCompareDirectories;
window.apiSelectLocalFolder = apiSelectLocalFolder;
window.apiOpenSystemFolder = apiOpenSystemFolder;
window.apiExportFilenameXlsx = apiExportFilenameXlsx;
window.apiPreviewFilename = apiPreviewFilename;
window.apiCheckHealth = apiCheckHealth;
