/**
 * Stats View Module: Prefix and leaf directory statistics UI
 * - Persists custom prefixes in browser localStorage
 * - Supports individual deletion and full clear
 * - Automatically recognizes common prefixes for single directories
 */

let currentScanData = null;
let currentPrefixTags = [];
let filenameTemplates = [];
let filenamePreviewData = null;

const STORAGE_KEY_PREFIXES = 'filescope_saved_prefixes';
const STORAGE_KEY_FILENAME_TEMPLATES = 'filescope_filename_templates';

// Load saved prefixes from browser localStorage
function loadSavedPrefixes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIXES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        currentPrefixTags = parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse saved prefixes from localStorage:', e);
  }
}

// Save prefixes to browser localStorage
function savePrefixesToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIXES, JSON.stringify(currentPrefixTags));
  } catch (e) {
    console.warn('Failed to save prefixes to localStorage:', e);
  }
}

// Initialize Tag Input for Prefixes
function initStatsTagInput() {
  const container = document.getElementById('stats-tags-container');
  const input = document.getElementById('stats-tag-input');
  if (!container || !input) return;

  function renderTags() {
    const badges = container.querySelectorAll('.tag-badge');
    badges.forEach(b => b.remove());

    currentPrefixTags.forEach((tag, idx) => {
      const badge = document.createElement('span');
      badge.className = 'tag-badge';
      badge.innerHTML = `
        <span>${escapeHtml(tag)}</span>
        <span class="tag-close" onclick="removePrefixTag(${idx})" title="移除此前缀">×</span>
      `;
      container.insertBefore(badge, input);
    });

    savePrefixesToStorage();
  }

  window.removePrefixTag = function(index) {
    currentPrefixTags.splice(index, 1);
    renderTags();
    showToast('已删除前缀', 'info');
  };

  window.clearAllPrefixTags = function() {
    if (currentPrefixTags.length === 0) return;
    currentPrefixTags = [];
    renderTags();
    showToast('已清空全部前缀缓存', 'info');
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = input.value.trim().replace(/,/g, '');
      if (val && !currentPrefixTags.includes(val)) {
        currentPrefixTags.push(val);
        input.value = '';
        renderTags();
      }
    } else if (e.key === 'Backspace' && input.value === '' && currentPrefixTags.length > 0) {
      currentPrefixTags.pop();
      renderTags();
    }
  });

  renderTags();
}

// Auto-detect and populate prefixes from directory path
async function autoDetectPrefixesForPath(pathValue) {
  if (!pathValue || !pathValue.trim()) return;
  const path = pathValue.trim();

  try {
    const resp = await apiScanDirectory({
      path: path,
      prefixes: [],
    });

    if (resp.summary.auto_discovered_prefixes && resp.summary.auto_discovered_prefixes.length > 0) {
      const detected = resp.summary.auto_discovered_prefixes.map(item => item.split(' ')[0]);
      let addedCount = 0;
      detected.forEach(p => {
        if (!currentPrefixTags.includes(p)) {
          currentPrefixTags.push(p);
          addedCount++;
        }
      });
      initStatsTagInput();
      if (addedCount > 0) {
        showToast(`已自动识别并缓存 ${addedCount} 个文件名前缀`, 'success');
      }
    }
  } catch (err) {
    console.log('Auto prefix detection notice:', err.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadSavedPrefixes();
  initStatsTagInput();

  const pathInput = document.getElementById('stats-input-path');
  if (pathInput) {
    pathInput.addEventListener('change', () => {
      const val = pathInput.value.trim();
      if (val) {
        runStatsScan();
      }
    });

    pathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = pathInput.value.trim();
        if (val) {
          runStatsScan();
        }
      }
    });
  }

  const btnAutoDetect = document.getElementById('btn-auto-detect-prefix');
  if (btnAutoDetect) {
    btnAutoDetect.addEventListener('click', async () => {
      const val = document.getElementById('stats-input-path').value.trim();
      if (!val) {
        showToast('请先输入或选择文件夹路径', 'warning');
        return;
      }
      btnAutoDetect.disabled = true;
      btnAutoDetect.innerHTML = `<span class="spinner"></span> 正在自动识别...`;
      await autoDetectPrefixesForPath(val);
      btnAutoDetect.disabled = false;
      btnAutoDetect.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
        自动识别前缀
      `;
    });
  }

  const btnClearPrefixes = document.getElementById('btn-clear-prefixes');
  if (btnClearPrefixes) {
    btnClearPrefixes.addEventListener('click', () => {
      clearAllPrefixTags();
    });
  }

  const btnRun = document.getElementById('btn-run-stats');
  if (btnRun) {
    btnRun.addEventListener('click', runStatsScan);
  }

  const searchInput = document.getElementById('leaf-table-search');
  if (searchInput) {
    searchInput.addEventListener('input', filterLeafTable);
  }

  const toggleLeaf = document.getElementById('toggle-only-leaf');
  if (toggleLeaf) {
    toggleLeaf.addEventListener('change', renderLeafTable);
  }

  const exportButton = document.getElementById('btn-export-filename-xlsx');
  if (exportButton) {
    exportButton.addEventListener('click', exportFilenameXlsx);
  }

  const previewButton = document.getElementById('btn-preview-filename');
  if (previewButton) {
    previewButton.addEventListener('click', previewFilename);
  }

  initFilenameTemplateManager();
});

function readFilenameTemplates() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_FILENAME_TEMPLATES) || '[]');
    return Array.isArray(parsed) ? parsed.filter(template => (
      template && typeof template.name === 'string' && Array.isArray(template.fields) &&
      typeof template.delimiter === 'string' && ['grouped_sheets', 'single_sheet'].includes(template.layout)
    )) : [];
  } catch (error) {
    console.warn('Failed to parse filename templates from localStorage:', error);
    return [];
  }
}

function writeFilenameTemplates() {
  localStorage.setItem(STORAGE_KEY_FILENAME_TEMPLATES, JSON.stringify(filenameTemplates));
}

function getFilenameTemplateConfig() {
  return {
    fields: document.getElementById('filename-export-fields').value
      .split(/[,，]/)
      .map(field => field.trim())
      .filter(Boolean),
    delimiter: document.getElementById('filename-export-delimiter').value,
    layout: document.getElementById('filename-export-layout').value,
  };
}

function applyFilenameTemplate(template) {
  document.getElementById('filename-export-fields').value = template.fields.join(',');
  document.getElementById('filename-export-delimiter').value = template.delimiter;
  document.getElementById('filename-export-layout').value = template.layout;
  document.getElementById('filename-template-name').value = template.name;
}

function renderFilenameTemplateOptions(selectedName = '') {
  const select = document.getElementById('filename-template-select');
  const deleteButton = document.getElementById('btn-delete-filename-template');
  if (!select || !deleteButton) return;

  select.innerHTML = '<option value="">选择已保存模板</option>';
  filenameTemplates.forEach(template => {
    const option = document.createElement('option');
    option.value = template.name;
    option.textContent = template.name;
    select.appendChild(option);
  });
  select.value = filenameTemplates.some(template => template.name === selectedName) ? selectedName : '';
  deleteButton.disabled = !select.value;
}

function initFilenameTemplateManager() {
  const select = document.getElementById('filename-template-select');
  const saveButton = document.getElementById('btn-save-filename-template');
  const deleteButton = document.getElementById('btn-delete-filename-template');
  if (!select || !saveButton || !deleteButton) return;

  filenameTemplates = readFilenameTemplates();
  renderFilenameTemplateOptions();

  select.addEventListener('change', () => {
    const template = filenameTemplates.find(item => item.name === select.value);
    deleteButton.disabled = !template;
    if (template) applyFilenameTemplate(template);
  });

  saveButton.addEventListener('click', () => {
    const nameInput = document.getElementById('filename-template-name');
    const name = nameInput.value.trim();
    const config = getFilenameTemplateConfig();
    if (!name) {
      showToast('请输入模板名称', 'warning');
      nameInput.focus();
      return;
    }
    if (config.fields.length === 0) {
      showToast('请先配置至少一个字段，再保存模板', 'warning');
      return;
    }
    if (!config.delimiter) {
      showToast('请先填写文件名分隔符，再保存模板', 'warning');
      return;
    }

    const existingIndex = filenameTemplates.findIndex(template => template.name === name);
    const template = { name, ...config, updatedAt: new Date().toISOString() };
    if (existingIndex >= 0) {
      filenameTemplates[existingIndex] = template;
    } else {
      filenameTemplates.push(template);
    }
    writeFilenameTemplates();
    renderFilenameTemplateOptions(name);
    showToast(existingIndex >= 0 ? '模板已更新' : '模板已保存到浏览器缓存', 'success');
  });

  deleteButton.addEventListener('click', () => {
    const name = select.value;
    if (!name) return;
    filenameTemplates = filenameTemplates.filter(template => template.name !== name);
    writeFilenameTemplates();
    renderFilenameTemplateOptions();
    document.getElementById('filename-template-name').value = '';
    showToast('模板已删除', 'info');
  });
}

async function exportFilenameXlsx() {
  const button = document.getElementById('btn-export-filename-xlsx');
  const path = document.getElementById('filename-export-path').value.trim();
  const fields = document.getElementById('filename-export-fields').value
    .split(/[,，]/)
    .map(field => field.trim())
    .filter(Boolean);
  const delimiter = document.getElementById('filename-export-delimiter').value;
  const layout = document.getElementById('filename-export-layout').value;

  if (!path) {
    showToast('请输入文件夹路径', 'warning');
    return;
  }
  if (fields.length === 0) {
    showToast('请至少配置一个文件名字段', 'warning');
    return;
  }
  if (!delimiter) {
    showToast('请输入文件名分隔符', 'warning');
    return;
  }

  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span><span>正在生成 Excel...</span>';

  try {
    const result = await apiExportFilenameXlsx({ path, fields, delimiter, layout });
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast(`导出完成：${result.fileCount} 个文件，${result.leafCount} 个叶子文件夹，不匹配 ${result.unmatchedCount} 个`, 'success', 5000);
  } catch (err) {
    showToast(`Excel 导出失败: ${err.message}`, 'error', 4500);
  } finally {
    button.disabled = false;
    button.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg><span>拆分并导出 Excel</span>';
  }
}

function getFilenamePreviewConfig() {
  return {
    path: document.getElementById('filename-export-path').value.trim(),
    fields: document.getElementById('filename-export-fields').value
      .split(/[,，]/)
      .map(field => field.trim())
      .filter(Boolean),
    delimiter: document.getElementById('filename-export-delimiter').value,
  };
}

async function previewFilename() {
  const button = document.getElementById('btn-preview-filename');
  const config = getFilenamePreviewConfig();
  if (!config.path) {
    showToast('请输入文件夹路径', 'warning');
    return;
  }
  if (config.fields.length === 0) {
    showToast('请至少配置一个文件名字段', 'warning');
    return;
  }
  if (!config.delimiter) {
    showToast('请输入文件名分隔符', 'warning');
    return;
  }

  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span><span>正在预览...</span>';
  try {
    filenamePreviewData = await apiPreviewFilename(config);
    renderFilenamePreviewTable();
    showToast(`预览完成：${filenamePreviewData.file_count} 个文件，${filenamePreviewData.leaf_count} 个叶子文件夹，不匹配 ${filenamePreviewData.unmatched_count} 个`, 'success', 5000);
  } catch (err) {
    filenamePreviewData = null;
    renderFilenamePreviewTable();
    showToast(`表格预览失败: ${err.message}`, 'error', 4500);
  } finally {
    button.disabled = false;
    button.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg><span>预览表格</span>';
  }
}

function renderFilenamePreviewTable() {
  const thead = document.getElementById('filename-preview-thead');
  const tbody = document.getElementById('filename-preview-tbody');
  const summary = document.getElementById('filename-preview-summary');
  if (!thead || !tbody || !summary) return;

  if (!filenamePreviewData) {
    summary.textContent = '尚未预览';
    thead.innerHTML = '<tr><th>预览结果</th></tr>';
    tbody.innerHTML = '<tr><td style="text-align: center; color: var(--text-muted); padding: 2rem;">暂无预览数据</td></tr>';
    return;
  }

  summary.textContent = `共 ${filenamePreviewData.file_count} 个文件 · ${filenamePreviewData.leaf_count} 个叶子文件夹 · 不匹配 ${filenamePreviewData.unmatched_count} 个`;
  thead.innerHTML = '';
  const headerRow = document.createElement('tr');
  filenamePreviewData.headers.forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const rows = filenamePreviewData.rows;
  tbody.innerHTML = '';
  if (rows.length === 0) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = filenamePreviewData.headers.length;
    emptyCell.className = 'filename-preview-empty';
    emptyCell.textContent = '没有找到匹配的清单记录';
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
    return;
  }

  rows.forEach(row => {
    const tr = document.createElement('tr');
    row.forEach((value, index) => {
      const td = document.createElement('td');
      td.textContent = value ?? '';
      if (index === 0 || index === 2) td.className = 'table-code';
      if (index === filenamePreviewData.headers.length - 1) {
        td.innerHTML = `<span class="status-badge ${value === '匹配' ? 'badge-exact' : 'badge-diff'}"><span class="status-dot"></span><span>${escapeHtml(value || '')}</span></span>`;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

// Run Directory Scan
async function runStatsScan() {
  const pathInput = document.getElementById('stats-input-path').value.trim();
  if (!pathInput) {
    showToast('请输入目标文件夹路径', 'warning');
    document.getElementById('stats-input-path').focus();
    return;
  }

  const btnRun = document.getElementById('btn-run-stats');
  btnRun.disabled = true;
  btnRun.innerHTML = `<span class="spinner"></span> 正在深度分析中...`;

  try {
    const payload = {
      path: pathInput,
      prefixes: currentPrefixTags,
      include_regex: document.getElementById('stats-include-regex').value.trim() || null,
      exclude_regex: document.getElementById('stats-exclude-regex').value.trim() || null,
      max_depth: parseInt(document.getElementById('stats-max-depth').value) || null,
    };

    let resp = await apiScanDirectory(payload);

    currentScanData = resp;
    displayStatsResults(resp);
    showToast(`分析完成：共计 ${resp.summary.total_files} 个文件, ${resp.summary.total_leaf_directories} 个最深层目录`, 'success');
  } catch (err) {
    showToast('统计分析失败: ' + err.message, 'error');
  } finally {
    btnRun.disabled = false;
    btnRun.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      <span>开始统计分析</span>
    `;
  }
}

// Display results in UI
function displayStatsResults(data) {
  const emptyGuide = document.getElementById('stats-empty-guide');
  if (emptyGuide) emptyGuide.style.display = 'none';

  const resArea = document.getElementById('stats-results-area');
  resArea.style.display = 'block';

  const sum = data.summary;

  // KPI Metrics
  document.getElementById('kpi-total-files').textContent = sum.total_files.toLocaleString();
  document.getElementById('kpi-total-size').textContent = `总空间: ${sum.total_size_formatted}`;
  document.getElementById('kpi-leaf-dirs').textContent = sum.total_leaf_directories.toLocaleString();
  document.getElementById('kpi-total-dirs').textContent = `总扫描目录: ${sum.total_directories}`;
  document.getElementById('kpi-avg-files').textContent = sum.avg_files_per_leaf_dir;
  document.getElementById('kpi-max-depth').textContent = `最大层级深度: ${sum.max_depth}`;
  
  if (sum.max_files_dir) {
    document.getElementById('kpi-max-files').textContent = `${sum.max_files_dir.file_count} 个`;
    document.getElementById('kpi-max-folder-name').textContent = sum.max_files_dir.rel_path;
  } else {
    document.getElementById('kpi-max-files').textContent = '0';
    document.getElementById('kpi-max-folder-name').textContent = '-';
  }

  document.getElementById('kpi-scan-time').textContent = `${sum.scan_time_ms} ms`;

  // Render Prefix Table List
  renderPrefixTable(data.prefix_stats);

  // Render Leaf Table
  renderLeafTable();

  // Scroll smoothly to results
  resArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Render Prefix Statistics Distribution as a Table List
function renderPrefixTable(stats) {
  const tbody = document.getElementById('prefix-tbody');
  const summaryCount = document.getElementById('prefix-summary-count');
  tbody.innerHTML = '';

  if (!stats || stats.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 2rem;">未发现明显前缀规律或无文件</td></tr>`;
    if (summaryCount) summaryCount.textContent = '';
    return;
  }

  if (summaryCount) summaryCount.textContent = `共归纳 ${stats.length} 个前缀分类`;

  stats.forEach(item => {
    const tr = document.createElement('tr');

    const extPills = Object.entries(item.extensions || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([ext, count]) => `<span class="ext-pill">${escapeHtml(ext)} (${count})</span>`)
      .join(' ');

    const sampleFiles = (item.sample_files || []).slice(0, 3).map(f => escapeHtml(f)).join(', ');

    tr.innerHTML = `
      <td class="col-prefix-name">
        <span style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-cyan); font-size: 0.9rem;">
          ${escapeHtml(item.prefix)}
        </span>
      </td>
      <td class="col-prefix-count" style="font-family: var(--font-mono); font-weight: 700; color: var(--text-primary);">
        ${item.match_count.toLocaleString()}
      </td>
      <td class="col-prefix-pct">
        <div class="prefix-progress-cell">
          <span style="font-family: var(--font-mono); font-size: 0.8rem; font-weight: 600; min-width: 44px;">${item.percentage}%</span>
          <div class="prefix-progress-bar" title="占比 ${item.percentage}%">
            <div class="prefix-progress-fill" style="width: ${Math.min(item.percentage, 100)}%;"></div>
          </div>
        </div>
      </td>
      <td class="col-prefix-size" style="font-family: var(--font-mono); color: var(--text-secondary);">
        ${item.size_formatted}
      </td>
      <td class="col-prefix-exts">
        ${extPills || '<span style="color:var(--text-muted); font-size:0.75rem;">(无文件)</span>'}
      </td>
      <td class="col-prefix-samples" style="font-size: 0.775rem; color: var(--text-muted); line-height: 1.4;">
        ${sampleFiles || '-'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Export Prefix Table to CSV
function exportPrefixTableCSV() {
  if (!currentScanData || !currentScanData.prefix_stats) {
    showToast('暂无前缀数据可导出', 'warning');
    return;
  }

  let csv = '\uFEFF前缀字段,匹配文件数,数量占比(%),占用空间(Byte),空间格式化,主要文件类型,示例文件\n';
  currentScanData.prefix_stats.forEach(item => {
    const exts = Object.entries(item.extensions || {}).map(([k, v]) => `${k}:${v}`).join('; ');
    const samples = (item.sample_files || []).join('; ');
    csv += `"${item.prefix}",${item.match_count},${item.percentage},${item.total_size_bytes},"${item.size_formatted}","${exts}","${samples}"\n`;
  });

  const filename = `prefix_distribution_stats_${new Date().toISOString().slice(0, 10)}.csv`;
  downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  showToast('已导出前缀统计清单 CSV', 'success');
}

// Render Leaf Directories Table with Adaptive Layout
function renderLeafTable() {
  if (!currentScanData) return;

  const onlyLeaf = document.getElementById('toggle-only-leaf').checked;
  const list = onlyLeaf ? currentScanData.leaf_directories : (currentScanData.all_directories || currentScanData.leaf_directories);
  const searchFilter = document.getElementById('leaf-table-search').value.toLowerCase().trim();

  const tbody = document.getElementById('leaf-dirs-tbody');
  tbody.innerHTML = '';

  const filtered = list.filter(dir => {
    if (!searchFilter) return true;
    return dir.rel_path.toLowerCase().includes(searchFilter) ||
           dir.path.toLowerCase().includes(searchFilter);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">没有找到匹配的目录记录</td></tr>`;
    return;
  }

  filtered.forEach(item => {
    const tr = document.createElement('tr');

    const extPills = Object.entries(item.extensions || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([ext, cnt]) => `<span class="ext-pill">${escapeHtml(ext)} (${cnt})</span>`)
      .join(' ');

    const sampleFiles = (item.sample_files || []).slice(0, 3).map(f => escapeHtml(f)).join(', ');

    tr.innerHTML = `
      <td class="col-leaf-path">
        <div class="path-link" data-open-path="${escapeHtml(item.path)}" role="button" tabindex="0" title="点击在系统文件管理器中直接打开此目录">
          <svg class="link-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
          <span style="font-weight: 600; font-family: var(--font-mono); word-break: break-all;">${escapeHtml(item.rel_path)}</span>
        </div>
        <div class="path-sub clickable-path" data-open-path="${escapeHtml(item.path)}" role="button" tabindex="0" title="点击在系统文件夹中打开: ${escapeHtml(item.path)}">${escapeHtml(item.path)}</div>
      </td>
      <td class="col-leaf-depth">
        <span class="status-badge ${item.is_leaf ? 'badge-exact' : 'badge-diff'}">
          <span class="status-dot"></span>
          <span>Level ${item.depth} ${item.is_leaf ? '(叶子)' : ''}</span>
        </span>
      </td>
      <td class="col-leaf-count" style="font-weight: 700; font-family: var(--font-mono); color: var(--accent-cyan);">
        ${item.file_count.toLocaleString()}
      </td>
      <td class="col-leaf-size" style="font-family: var(--font-mono); color: var(--text-secondary);">
        ${item.size_formatted}
      </td>
      <td class="col-leaf-exts">
        ${extPills || '<span style="color:var(--text-muted); font-size:0.75rem;">(无文件)</span>'}
      </td>
      <td class="col-leaf-samples" style="font-size: 0.775rem; color: var(--text-muted); line-height: 1.4;">
        ${sampleFiles || '-'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterLeafTable() {
  renderLeafTable();
}

// Export Leaf Table to CSV
function exportLeafTableCSV() {
  if (!currentScanData || !currentScanData.leaf_directories) {
    showToast('暂无数据可导出', 'warning');
    return;
  }

  const list = currentScanData.leaf_directories;
  let csv = '\uFEFF相对路径,绝对路径,层级深度,是否最深层,文件数量,占用空间(Byte),空间格式化,主要文件类型\n';

  list.forEach(item => {
    const exts = Object.entries(item.extensions || {}).map(([k, v]) => `${k}:${v}`).join('; ');
    csv += `"${item.rel_path}","${item.path}",${item.depth},${item.is_leaf ? '是' : '否'},${item.file_count},${item.total_size_bytes},"${item.size_formatted}","${exts}"\n`;
  });

  const filename = `leaf_directories_stats_${new Date().toISOString().slice(0, 10)}.csv`;
  downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  showToast('已导出叶子目录统计 CSV', 'success');
}
