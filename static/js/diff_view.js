/**
 * Diff View Module: Dual directory comparison, filtering, screening, and export
 */

let currentCompareData = null;
let currentDiffFilter = 'ALL';
let currentSearchQuery = '';
let currentPage = 1;
let pageSize = 100;

document.addEventListener('DOMContentLoaded', () => {
  const btnRun = document.getElementById('btn-run-diff');
  if (btnRun) {
    btnRun.addEventListener('click', runCompare);
  }
});

// Mode switch handler
function onDiffModeChange() {
  const mode = document.getElementById('diff-compare-mode').value;
  const stripDiv = document.getElementById('prefix-strip-inputs');
  if (mode === 'prefix_strip') {
    stripDiv.style.display = 'block';
  } else {
    stripDiv.style.display = 'none';
  }
}

// Run Comparison
async function runCompare() {
  const dirA = document.getElementById('diff-dir-a').value.trim();
  const dirB = document.getElementById('diff-dir-b').value.trim();

  if (!dirA || !dirB) {
    showToast('请输入目录 A 和目录 B 的路径', 'warning');
    return;
  }

  const btnRun = document.getElementById('btn-run-diff');
  btnRun.disabled = true;
  btnRun.innerHTML = `<span class="spinner"></span> 正在深度比对与计算差异...`;

  try {
    const payload = {
      dir_a: dirA,
      dir_b: dirB,
      mode: document.getElementById('diff-compare-mode').value,
      compare_size: document.getElementById('diff-opt-size').checked,
      compare_mtime: document.getElementById('diff-opt-mtime').checked,
      ignore_case: document.getElementById('diff-opt-case').checked,
      ignore_hidden: document.getElementById('diff-opt-hidden').checked,
      prefix_strip_a: document.getElementById('prefix-strip-a').value.trim() || null,
      prefix_strip_b: document.getElementById('prefix-strip-b').value.trim() || null,
      filter_ext: document.getElementById('diff-filter-ext').value.trim() || null,
    };

    const resp = await apiCompareDirectories(payload);
    currentCompareData = resp;
    currentPage = 1;
    displayDiffResults(resp);
    showToast(`比对完成：总条目 ${resp.summary.total_unique_items}, 匹配率 ${resp.summary.match_percentage}%`, 'success');
  } catch (err) {
    showToast('比对失败: ' + err.message, 'error');
  } finally {
    btnRun.disabled = false;
    btnRun.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
      <span>开始比对与筛查</span>
    `;
  }
}

// Display Diff Results in UI
function displayDiffResults(data) {
  const emptyGuide = document.getElementById('diff-empty-guide');
  if (emptyGuide) emptyGuide.style.display = 'none';

  const resArea = document.getElementById('diff-results-area');
  resArea.style.display = 'block';

  const sum = data.summary;

  // KPI Metrics
  document.getElementById('diff-kpi-total').textContent = sum.total_unique_items.toLocaleString();
  document.getElementById('diff-kpi-match-rate').textContent = `匹配率: ${sum.match_percentage}% (A:${sum.dir_a_total_files}项, B:${sum.dir_b_total_files}项)`;
  document.getElementById('diff-kpi-exact').textContent = sum.count_exact_match.toLocaleString();
  document.getElementById('diff-kpi-only-a').textContent = sum.count_only_in_a.toLocaleString();
  document.getElementById('diff-kpi-only-b').textContent = sum.count_only_in_b.toLocaleString();
  document.getElementById('diff-kpi-diff-attr').textContent = sum.count_different_attr.toLocaleString();
  document.getElementById('diff-kpi-moved').textContent = sum.count_moved.toLocaleString();

  // Filter Chip Counts (Pill format)
  document.getElementById('filter-cnt-all').textContent = sum.total_unique_items.toLocaleString();
  document.getElementById('filter-cnt-only-a').textContent = sum.count_only_in_a.toLocaleString();
  document.getElementById('filter-cnt-only-b').textContent = sum.count_only_in_b.toLocaleString();
  document.getElementById('filter-cnt-diff').textContent = sum.count_different_attr.toLocaleString();
  document.getElementById('filter-cnt-moved').textContent = sum.count_moved.toLocaleString();
  document.getElementById('filter-cnt-exact').textContent = sum.count_exact_match.toLocaleString();

  renderDiffTable();

  resArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Status Filter Handler
function filterDiffStatus(status) {
  currentDiffFilter = status;
  currentPage = 1;

  // Update active chip
  const chips = document.querySelectorAll('#diff-status-chips .filter-chip');
  chips.forEach(chip => {
    if (chip.getAttribute('data-status') === status) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });

  renderDiffTable();
}

// Search Query Handler
function onDiffSearchChange() {
  currentSearchQuery = document.getElementById('diff-search-input').value.toLowerCase().trim();
  currentPage = 1;
  renderDiffTable();
}

// Page Size Change Handler
function onPageSizeChange() {
  pageSize = parseInt(document.getElementById('diff-page-size').value, 10);
  currentPage = 1;
  renderDiffTable();
}

// Change Page
function changePage(delta) {
  currentPage += delta;
  renderDiffTable();
}

// Get filtered items
function getFilteredDiffItems() {
  if (!currentCompareData || !currentCompareData.diff_items) return [];

  return currentCompareData.diff_items.filter(item => {
    // Status filter
    if (currentDiffFilter !== 'ALL' && item.status !== currentDiffFilter) {
      return false;
    }

    // Search query filter
    if (currentSearchQuery) {
      const matchName = item.filename.toLowerCase().includes(currentSearchQuery);
      const matchPathA = item.rel_path_a && item.rel_path_a.toLowerCase().includes(currentSearchQuery);
      const matchPathB = item.rel_path_b && item.rel_path_b.toLowerCase().includes(currentSearchQuery);
      const matchReason = item.diff_reason && item.diff_reason.toLowerCase().includes(currentSearchQuery);
      if (!matchName && !matchPathA && !matchPathB && !matchReason) {
        return false;
      }
    }

    return true;
  });
}

// Render Diff Table with Adaptive Columns and Pagination
function renderDiffTable() {
  const filtered = getFilteredDiffItems();
  const totalFiltered = filtered.length;

  document.getElementById('diff-showing-count').textContent = totalFiltered.toLocaleString();

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = startIdx + pageSize;
  const pageItems = filtered.slice(startIdx, endIdx);

  // Update Pagination Controls
  document.getElementById('diff-page-info').textContent = `第 ${currentPage} / ${totalPages} 页 (共 ${totalFiltered} 项)`;
  document.getElementById('btn-page-prev').disabled = (currentPage <= 1);
  document.getElementById('btn-page-next').disabled = (currentPage >= totalPages);

  const tbody = document.getElementById('diff-tbody');
  tbody.innerHTML = '';

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2.5rem;">未找到匹配的比对记录</td></tr>`;
    return;
  }

  pageItems.forEach((item, index) => {
    const tr = document.createElement('tr');

    let badgeClass = 'badge-exact';
    let badgeText = item.status_label;
    if (item.status === 'ONLY_IN_A') badgeClass = 'badge-only-a';
    else if (item.status === 'ONLY_IN_B') badgeClass = 'badge-only-b';
    else if (item.status === 'DIFFERENT_ATTR') badgeClass = 'badge-diff';
    else if (item.status === 'MOVED_PATH') badgeClass = 'badge-moved';

    const baseDirA = (currentCompareData && currentCompareData.summary && currentCompareData.summary.dir_a) || '';
    const fullPathA = item.rel_path_a ? (baseDirA ? (baseDirA.replace(/\\/g, '/') + '/' + item.rel_path_a.replace(/\\/g, '/')) : item.rel_path_a) : '';
    const dirOnlyA = fullPathA.includes('/') ? fullPathA.substring(0, fullPathA.lastIndexOf('/')) : fullPathA;

    const baseDirB = (currentCompareData && currentCompareData.summary && currentCompareData.summary.dir_b) || '';
    const fullPathB = item.rel_path_b ? (baseDirB ? (baseDirB.replace(/\\/g, '/') + '/' + item.rel_path_b.replace(/\\/g, '/')) : item.rel_path_b) : '';
    const dirOnlyB = fullPathB.includes('/') ? fullPathB.substring(0, fullPathB.lastIndexOf('/')) : fullPathB;

    const pathA = item.rel_path_a 
      ? `<div class="path-link" data-open-path="${escapeHtml(dirOnlyA)}" role="button" tabindex="0" title="点击在系统文件管理器中直接打开目录 A: ${escapeHtml(dirOnlyA)}">
           <svg class="link-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
           <span class="table-code">${escapeHtml(item.rel_path_a)}</span>
           <span class="path-sub">(${item.size_a_formatted || '-'})</span>
         </div>`
      : `<span style="color: var(--text-muted); font-size: 0.75rem;">(无)</span>`;

    const pathB = item.rel_path_b 
      ? `<div class="path-link" data-open-path="${escapeHtml(dirOnlyB)}" role="button" tabindex="0" title="点击在系统文件管理器中直接打开目录 B: ${escapeHtml(dirOnlyB)}">
           <svg class="link-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
           <span class="table-code">${escapeHtml(item.rel_path_b)}</span>
           <span class="path-sub">(${item.size_b_formatted || '-'})</span>
         </div>`
      : `<span style="color: var(--text-muted); font-size: 0.75rem;">(无)</span>`;

    tr.innerHTML = `
      <td class="col-diff-idx" style="color: var(--text-muted); font-family: var(--font-mono); font-size: 0.75rem;">${startIdx + index + 1}</td>
      <td class="col-diff-status">
        <span class="status-badge ${badgeClass}">
          <span class="status-dot"></span>
          <span>${escapeHtml(badgeText)}</span>
        </span>
      </td>
      <td class="col-diff-filename">${escapeHtml(item.filename)}</td>
      <td class="col-diff-path-a">${pathA}</td>
      <td class="col-diff-path-b">${pathB}</td>
      <td class="col-diff-reason" style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(item.diff_reason || '-')}</td>
      <td class="col-diff-action">
        <button class="btn btn-secondary btn-sm" onclick="copyToClipboard('${escapeHtml(item.filename)}', '已复制文件名')" title="复制文件名">
          复制
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Copy All Differing Filenames to Clipboard
function copyDifferingFilenames() {
  if (!currentCompareData || !currentCompareData.diff_items) {
    showToast('暂无比对数据', 'warning');
    return;
  }

  const diffs = currentCompareData.diff_items.filter(item => item.status !== 'EXACT_MATCH');
  if (diffs.length === 0) {
    showToast('两端文件完全一致，没有差异文件名', 'info');
    return;
  }

  const names = diffs.map(i => i.filename).join('\n');
  copyToClipboard(names, `已成功复制 ${diffs.length} 个差异文件名到剪贴板`);
}

// Export Diff to CSV
function exportDiffCSV() {
  const items = getFilteredDiffItems();
  if (items.length === 0) {
    showToast('暂无匹配数据可导出', 'warning');
    return;
  }

  let csv = '\uFEFF序号,状态,文件名,扩展名,目录A相对路径,目录A大小,目录A修改时间,目录B相对路径,目录B大小,目录B修改时间,差异说明\n';

  items.forEach((item, idx) => {
    csv += `${idx + 1},"${item.status_label}","${item.filename}","${item.ext}","${item.rel_path_a || ''}","${item.size_a_formatted || ''}","${item.mtime_a || ''}","${item.rel_path_b || ''}","${item.size_b_formatted || ''}","${item.mtime_b || ''}","${item.diff_reason || ''}"\n`;
  });

  const filename = `file_diff_report_${new Date().toISOString().slice(0, 10)}.csv`;
  downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  showToast(`已成功导出 ${items.length} 条差异记录为 CSV`, 'success');
}

// Export Diff to JSON
function exportDiffJSON() {
  const items = getFilteredDiffItems();
  if (items.length === 0) {
    showToast('暂无匹配数据可导出', 'warning');
    return;
  }

  const data = {
    summary: currentCompareData.summary,
    exported_at: new Date().toISOString(),
    total_items: items.length,
    diff_items: items
  };

  const jsonStr = JSON.stringify(data, null, 2);
  const filename = `file_diff_report_${new Date().toISOString().slice(0, 10)}.json`;
  downloadFile(jsonStr, filename, 'application/json;charset=utf-8;');
  showToast(`已成功导出 ${items.length} 条差异记录为 JSON`, 'success');
}
