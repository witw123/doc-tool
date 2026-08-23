import { LocalScannedFile } from '@doc-tool/shared';

export interface LocalFolderPickResult {
  folderName: string;
  files: LocalScannedFile[];
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
      return {
        folderName: dirHandle.name,
        files,
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
