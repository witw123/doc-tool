import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BrowseResponse, BrowseItem, formatBytes } from '@doc-tool/shared';

@Injectable()
export class BrowserService {
  browse(inputPath?: string): BrowseResponse {
    let targetPath = inputPath?.trim() || '';

    // If path is empty on Windows, list all available drive letters
    if (!targetPath && process.platform === 'win32') {
      const drives = this.getWindowsDrives();
      return {
        success: true,
        current_path: '',
        parent_path: null,
        items: drives.map((d) => ({
          name: `本地磁盘 (${d})`,
          path: `${d}\\`,
          is_dir: true,
          size: null,
          mtime: null,
        })),
      };
    }

    // Default to root on Unix if empty
    if (!targetPath) {
      targetPath = '/';
    }

    let resolved = path.resolve(targetPath);
    if (!fs.existsSync(resolved)) {
      const altWorkspace = path.resolve(process.cwd(), '..', '..', targetPath);
      if (fs.existsSync(altWorkspace)) {
        resolved = altWorkspace;
      } else {
        return {
          success: false,
          current_path: targetPath,
          parent_path: null,
          items: [],
        };
      }
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return {
        success: true,
        current_path: resolved,
        parent_path: path.dirname(resolved),
        items: [],
      };
    }

    const parent = path.dirname(resolved);
    const parentPath = parent === resolved ? (process.platform === 'win32' ? '' : null) : parent;

    const items: BrowseItem[] = [];
    try {
      const entries = fs.readdirSync(resolved, { withFileTypes: true });

      // Sort directories first, then alphabetically
      entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.') continue;

        const fullPath = path.join(resolved, entry.name);
        const isDir = entry.isDirectory();
        let size: number | null = null;
        let mtime: string | null = null;

        try {
          const fStat = fs.statSync(fullPath);
          size = isDir ? null : fStat.size;
          mtime = fStat.mtime.toISOString().replace('T', ' ').slice(0, 19);
        } catch {
          // ignore permission errors
        }

        items.push({
          name: entry.name,
          path: fullPath,
          is_dir: isDir,
          size,
          mtime,
        });
      }
    } catch {
      // Permission or reading error
    }

    return {
      success: true,
      current_path: resolved,
      parent_path: parentPath,
      items,
    };
  }

  private getWindowsDrives(): string[] {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const validDrives: string[] = [];

    for (const letter of letters) {
      const drivePath = `${letter}:\\`;
      try {
        if (fs.existsSync(drivePath)) {
          validDrives.push(`${letter}:`);
        }
      } catch {
        // Drive not ready or accessible
      }
    }

    return validDrives.length > 0 ? validDrives : ['C:'];
  }
}
