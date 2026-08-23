/**
 * Main application coordinator: navigation tabs, theme switching, local folder selection, keyboard shortcuts, and mock presets
 */

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

function getDirectoryPath(inputId) {
  return document.getElementById(inputId)?.value.trim() || '';
}

async function selectLocalFolder(targetInputId) {
  const targetInput = document.getElementById(targetInputId);
  if (!targetInput) return;

  targetInput.disabled = true;
  try {
    const result = await apiSelectLocalFolder(targetInput.value.trim());
    if (!result.selected || !result.path) return;
    targetInput.value = result.path;
    targetInput.title = result.path;
    showToast(`已选择本地文件夹：${result.path}`, 'success', 3500);
    if (targetInputId === 'stats-input-path' && typeof runStatsScan === 'function') {
      runStatsScan();
    }
  } catch (error) {
    showToast(`选择本地文件夹失败: ${error.message}`, 'error', 4500);
  } finally {
    targetInput.disabled = false;
  }
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
