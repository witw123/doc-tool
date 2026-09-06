import { LocalScannedFile } from '@doc-tool/shared';

export interface LocalFolderPickResult {
  folderName: string;
  files: LocalScannedFile[];
  handle?: any; // FileSystemDirectoryHandle if supported
}

/**
 * Re-scan a FileSystemDirectoryHandle to get the latest files from disk.
 */
export async function scanDirectoryHandle(dirHandle: any): Promise<LocalScannedFile[]> {
  const files: LocalScannedFile[] = [];

  async function scanHandle(handle: any, currentRelPath: string) {
    for await (const entry of handle.values()) {
      if (entry.name.startsWith('.')) continue;

      if (entry.kind === 'file') {
        const fileObj = await entry.getFile();
        const lastDot = entry.name.lastIndexOf('.');
        const ext = lastDot > 0 ? entry.name.substring(lastDot).toLowerCase() : '';
        const rel = currentRelPath ? `${currentRelPath}/${entry.name}` : entry.name;

        files.push({
          filename: entry.name,
          relPath: rel,
          size: fileObj.size,
          mtime: new Date(fileObj.lastModified).toISOString().replace('T', ' ').slice(0, 19),
          ext,
        });
      } else if (entry.kind === 'directory') {
        const nextRel = currentRelPath ? `${currentRelPath}/${entry.name}` : entry.name;
        await scanHandle(entry, nextRel);
      }
    }
  }

  await scanHandle(dirHandle, '');
  return files;
}

/**
 * Open the user's client computer native folder picker dialog.
 * Reads directory structure and file metadata without uploading actual file contents.
 */
export async function pickLocalFolder(): Promise<LocalFolderPickResult> {
  // Method 1: Modern File System Access API (showDirectoryPicker)
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    try {
      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      const files = await scanDirectoryHandle(dirHandle);
      return {
        folderName: dirHandle.name,
        files,
        handle: dirHandle,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('用户取消了文件夹选择');
      }
      // If permission or feature fails, fallback to input method
    }
  }

  // Method 2: Standard HTML5 webkitdirectory Input Fallback
  return new Promise<LocalFolderPickResult>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.style.display = 'none';

    input.onchange = () => {
      const fileList = input.files;
      if (!fileList || fileList.length === 0) {
        reject(new Error('未选择任何文件夹'));
        return;
      }

      const files: LocalScannedFile[] = [];
      let topFolderName = '';

      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i]!;
        const rel = f.webkitRelativePath || f.name;
        const parts = rel.split('/');
        if (!topFolderName && parts.length > 1) {
          topFolderName = parts[0]!;
        }

        // Subpath relative to root folder
        const subRel = parts.length > 1 ? parts.slice(1).join('/') : f.name;
        const lastDot = f.name.lastIndexOf('.');
        const ext = lastDot > 0 ? f.name.substring(lastDot).toLowerCase() : '';

        files.push({
          filename: f.name,
          relPath: subRel,
          size: f.size,
          mtime: new Date(f.lastModified).toISOString().replace('T', ' ').slice(0, 19),
          ext,
        });
      }

      resolve({
        folderName: topFolderName || '选择的文件夹',
        files,
      });
      document.body.removeChild(input);
    };

    input.oncancel = () => {
      document.body.removeChild(input);
      reject(new Error('用户取消了文件夹选择'));
    };

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Open file picker to choose one or multiple individual files.
 */
export async function pickLocalFiles(): Promise<LocalFolderPickResult> {
  return new Promise<LocalFolderPickResult>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.style.display = 'none';

    input.onchange = () => {
      const fileList = input.files;
      if (!fileList || fileList.length === 0) {
        reject(new Error('未选择任何文件'));
        return;
      }

      const files: LocalScannedFile[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i]!;
        const lastDot = f.name.lastIndexOf('.');
        const ext = lastDot > 0 ? f.name.substring(lastDot).toLowerCase() : '';

        files.push({
          filename: f.name,
          relPath: f.name,
          size: f.size,
          mtime: new Date(f.lastModified).toISOString().replace('T', ' ').slice(0, 19),
          ext,
        });
      }

      resolve({
        folderName: `已导入 ${files.length} 个文件`,
        files,
      });
      document.body.removeChild(input);
    };

    input.oncancel = () => {
      document.body.removeChild(input);
      reject(new Error('用户取消了文件选择'));
    };

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Parse files from HTML5 Drag and Drop event.
 */
export async function parseDroppedItems(dataTransfer: DataTransfer): Promise<LocalFolderPickResult> {
  const files: LocalScannedFile[] = [];

  // Helper for webkitGetAsEntry (handles dropped folders and files)
  const traverseEntry = async (entry: any, path = ''): Promise<void> => {
    if (entry.isFile) {
      const file: File = await new Promise((res, rej) => entry.file(res, rej));
      const lastDot = file.name.lastIndexOf('.');
      const ext = lastDot > 0 ? file.name.substring(lastDot).toLowerCase() : '';
      const relPath = path ? `${path}/${file.name}` : file.name;
      files.push({
        filename: file.name,
        relPath,
        size: file.size,
        mtime: new Date(file.lastModified).toISOString().replace('T', ' ').slice(0, 19),
        ext,
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const entries: any[] = await new Promise((res, rej) => {
        dirReader.readEntries(res, rej);
      });
      for (const child of entries) {
        await traverseEntry(child, path ? `${path}/${entry.name}` : entry.name);
      }
    }
  };

  const items = dataTransfer.items;
  if (items && items.length > 0 && typeof items[0]?.webkitGetAsEntry === 'function') {
    for (let i = 0; i < items.length; i++) {
      const entry = items[i]?.webkitGetAsEntry();
      if (entry) {
        await traverseEntry(entry);
      }
    }
  } else if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const f = dataTransfer.files[i]!;
      const lastDot = f.name.lastIndexOf('.');
      const ext = lastDot > 0 ? f.name.substring(lastDot).toLowerCase() : '';
      files.push({
        filename: f.name,
        relPath: f.name,
        size: f.size,
        mtime: new Date(f.lastModified).toISOString().replace('T', ' ').slice(0, 19),
        ext,
      });
    }
  }

  if (files.length === 0) {
    throw new Error('未检测到可导入的文件');
  }

  return {
    folderName: `拖拽导入 (${files.length} 个文件)`,
    files,
  };
}
