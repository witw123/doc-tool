/**
 * Main application coordinator: navigation tabs, theme switching, directory modal, keyboard shortcuts, and mock presets
 */

let activeBrowserTargetInputId = null;
let currentBrowserPath = '';
let currentParentPath = null;

// Tab Switching
function switchTab(tabName) {
  const tabs = ['stats', 'diff', 'export'];
  if (!tabs.includes(tabName)) return;

  tabs.forEach(name => {
    document.getElementById(`tab-${name}-btn`)?.classList.toggle('active', name === tabName);
    document.getElementById(`view-${name}`)?.classList.toggle('active', name === tabName);
  });
}

// Theme Switcher
function initTheme() {
  const savedTheme = localStorage.getItem('filescope_theme') || 'dark';
  setTheme(savedTheme);

  const themeBtn = document.getElementById('btn-theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      setTheme(next);
    });
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('filescope_theme', theme);

  const iconDark = document.getElementById('theme-icon-dark');
  const iconLight = document.getElementById('theme-icon-light');
  if (iconDark && iconLight) {
    if (theme === 'dark') {
      iconDark.style.display = 'block';
      iconLight.style.display = 'none';
    } else {
      iconDark.style.display = 'none';
      iconLight.style.display = 'block';
    }
  }
}

const STORAGE_KEY_LAST_PATH = 'filescope_last_browsed_path';

// Server File Browser Modal
async function openBrowserModal(targetInputId) {
  activeBrowserTargetInputId = targetInputId;
  let currentVal = document.getElementById(targetInputId).value.trim();
  
  // If input is empty, retrieve last memorized browsed directory
  if (!currentVal) {
    currentVal = localStorage.getItem(STORAGE_KEY_LAST_PATH) || '';
  }

  const modal = document.getElementById('browser-modal');
  modal.classList.add('active');

  await loadDirectoryContent(currentVal);
}

function closeBrowserModal() {
  const modal = document.getElementById('browser-modal');
  modal.classList.remove('active');
}

async function loadDirectoryContent(targetPath) {
  const container = document.getElementById('browser-list-container');
  const pathInput = document.getElementById('browser-current-path');
  const btnUp = document.getElementById('browser-btn-up');

  container.innerHTML = '<div style="text-align:center; padding: 1.5rem; color: var(--text-muted); font-size: 0.85rem;"><span class="spinner"></span> 正在读取目录...</div>';

  try {
    const data = await apiBrowseDirectory(targetPath);
    currentBrowserPath = data.current_path;
    currentParentPath = data.parent_path;

    // Remember currently browsed path
    if (data.current_path) {
      localStorage.setItem(STORAGE_KEY_LAST_PATH, data.current_path);
    }

    pathInput.textContent = data.current_path || '(根目录/磁盘列表)';
    pathInput.title = data.current_path || '(根目录/磁盘列表)';
    btnUp.disabled = !data.parent_path && data.current_path === '';

    container.innerHTML = '';
    if (!data.items || data.items.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding: 1.5rem; color: var(--text-muted); font-size: 0.85rem;">此目录为空</div>';
      return;
    }

    data.items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'browser-item';

      const folderSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
      const fileSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
      const iconSvg = item.is_dir ? folderSvg : fileSvg;
      const sizeStr = item.size !== null ? formatBytes(item.size) : '';

      row.innerHTML = `
        <div class="browser-item-left">
          <span style="display:flex; align-items:center;">${iconSvg}</span>
          <span style="font-weight: ${item.is_dir ? '600' : '400'};">${escapeHtml(item.name)}</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">
          ${sizeStr || item.mtime || ''}
        </div>
      `;

      row.addEventListener('click', () => {
        if (item.is_dir) {
          loadDirectoryContent(item.path);
        } else {
          pathInput.value = item.path;
        }
      });

      container.appendChild(row);
    });
  } catch (err) {
    container.innerHTML = `<div style="color: var(--status-only-b-text); padding: 1rem; font-size: 0.85rem;">读取目录失败: ${escapeHtml(err.message)}</div>`;
  }
}

function browseUpDirectory() {
  if (currentParentPath !== null) {
    loadDirectoryContent(currentParentPath);
  }
}

function confirmBrowserSelection() {
  if (activeBrowserTargetInputId && currentBrowserPath) {
    const targetInput = document.getElementById(activeBrowserTargetInputId);
    if (targetInput) {
      targetInput.value = currentBrowserPath;
      localStorage.setItem(STORAGE_KEY_LAST_PATH, currentBrowserPath);
      
      // Auto-identify & scan immediately upon folder selection for Single Folder Stats
      if (activeBrowserTargetInputId === 'stats-input-path') {
        if (typeof runStatsScan === 'function') {
          runStatsScan();
        }
      }
    }
  }
  closeBrowserModal();
}

// Open and reveal a directory or file in the host OS native file explorer (Windows Explorer, Finder, etc.)
async function openSystemFolder(targetPath) {
  if (!targetPath) return;
  try {
    let resp;
    if (typeof apiOpenSystemFolder === 'function') {
      resp = await apiOpenSystemFolder(targetPath);
    } else {
      const res = await fetch('/api/open-system-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || '打开系统文件夹失败');
      }
      resp = await res.json();
    }
    showToast(resp.message || '已在系统文件夹中打开', 'success', 3000);
  } catch (err) {
    showToast(`系统文件夹唤起提示: ${err.message}`, 'warning', 3500);
  }
}
window.openSystemFolder = openSystemFolder;
window.navigateToDirectory = openSystemFolder;

// Delegate clicks so dynamically rendered table rows remain keyboard-accessible.
document.addEventListener('click', (event) => {
  const pathTarget = event.target.closest('[data-open-path]');
  if (pathTarget) {
    openSystemFolder(pathTarget.dataset.openPath);
  }
});

document.addEventListener('keydown', (event) => {
  const pathTarget = event.target.closest('[data-open-path]');
  if (pathTarget && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    openSystemFolder(pathTarget.dataset.openPath);
  }
});

// Load Mock Demo Data Preset
function initMockPresets() {
  const btnMock = document.getElementById('btn-load-mock');
  if (!btnMock) return;

  btnMock.addEventListener('click', () => {
    const statsPath = document.getElementById('stats-input-path');
    const exportPath = document.getElementById('filename-export-path');
    const exportFields = document.getElementById('filename-export-fields');
    const diffDirA = document.getElementById('diff-dir-a');
    const diffDirB = document.getElementById('diff-dir-b');

    const mockFolderA = "test_mock_env/folder_a";
    const mockFolderB = "test_mock_env/folder_b";

    if (statsPath) {
      statsPath.value = mockFolderA;
    }
    if (exportPath) exportPath.value = mockFolderA;
    if (exportFields) exportFields.value = '项目,年份,序号';
    if (diffDirA) diffDirA.value = mockFolderA;
    if (diffDirB) diffDirB.value = mockFolderB;

    showToast('已载入示例路径并自动识别清单', 'success');

    // Auto-trigger scan if stats view is active
    const statsView = document.getElementById('view-stats');
    if (statsView && statsView.classList.contains('active') && typeof runStatsScan === 'function') {
      runStatsScan();
    }
  });
}

// Global Keyboard Shortcuts
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl + Enter to trigger active action
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const statsView = document.getElementById('view-stats');
      if (statsView && statsView.classList.contains('active')) {
        const btnRun = document.getElementById('btn-run-stats');
        if (btnRun) btnRun.click();
      } else if (document.getElementById('view-export')?.classList.contains('active')) {
        document.getElementById('btn-export-filename-xlsx')?.click();
      } else {
        const btnDiff = document.getElementById('btn-run-diff');
        if (btnDiff) btnDiff.click();
      }
    }
    // Escape to close modal
    if (e.key === 'Escape') {
      closeBrowserModal();
    }
  });
}

// Global initialization
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initMockPresets();
  initKeyboardShortcuts();

  // Check server health
  apiCheckHealth().then(health => {
    console.log('FileScope Server healthy:', health);
  }).catch(err => {
    console.warn('Server health check returned:', err);
  });
});
