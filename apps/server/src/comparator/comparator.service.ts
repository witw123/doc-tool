import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  CompareRequest,
  CompareResponse,
  CompareSummary,
  DiffItem,
  DiffStatus,
  formatBytes,
} from '@doc-tool/shared';

interface DiscoveredFile {
  relPath: string;
  filename: string;
  size: number;
  mtime: Date;
  ext: string;
}

@Injectable()
export class ComparatorService {
  private resolvePath(rawPath: string): string {
    let target = path.resolve(rawPath);
    if (!fs.existsSync(target)) {
      const rootWorkspace = path.resolve(process.cwd(), '..', '..', rawPath);
      if (fs.existsSync(rootWorkspace)) {
        return rootWorkspace;
      }
    }
    return target;
  }

  async compare(request: CompareRequest): Promise<CompareResponse> {
    const startTime = performance.now();
    const dirAPath = this.resolvePath(request.dir_a);
    const dirBPath = this.resolvePath(request.dir_b);

    if (!fs.existsSync(dirAPath)) {
      throw new NotFoundException(`Directory A does not exist: ${dirAPath}`);
    }
    if (!fs.existsSync(dirBPath)) {
      throw new NotFoundException(`Directory B does not exist: ${dirBPath}`);
    }

    const filesA = this.collectFiles(dirAPath, request);
    const filesB = this.collectFiles(dirBPath, request);

    const mode = request.mode || 'relative_path';
    const ignoreCase = request.ignore_case ?? false;
    const compareSize = request.compare_size ?? false;
    const compareMtime = request.compare_mtime ?? false;
    const prefixStripA = request.prefix_strip_a || null;
    const prefixStripB = request.prefix_strip_b || null;

    const diffItems: DiffItem[] = [];
    let itemId = 1;

    let countExact = 0;
    let countOnlyA = 0;
    let countOnlyB = 0;
    let countDifferent = 0;
    let countMoved = 0;

    let dirATotalSize = 0;
    let dirBTotalSize = 0;

    for (const f of filesA) dirATotalSize += f.size;
    for (const f of filesB) dirBTotalSize += f.size;

    const normalizeKey = (val: string) => (ignoreCase ? val.toLowerCase() : val);

    if (mode === 'relative_path') {
      const mapA = new Map<string, DiscoveredFile>();
      const mapB = new Map<string, DiscoveredFile>();

      for (const f of filesA) mapA.set(normalizeKey(f.relPath), f);
      for (const f of filesB) mapB.set(normalizeKey(f.relPath), f);

      const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);
      const sortedKeys = Array.from(allKeys).sort();

      for (const k of sortedKeys) {
        const fileA = mapA.get(k);
        const fileB = mapB.get(k);

        if (fileA && fileB) {
          let hasDiff = false;
          const reasons: string[] = [];

          if (compareSize && fileA.size !== fileB.size) {
            hasDiff = true;
            reasons.push(`大小不同 (A: ${formatBytes(fileA.size)}, B: ${formatBytes(fileB.size)})`);
          }

          if (compareMtime && Math.abs(fileA.mtime.getTime() - fileB.mtime.getTime()) > 2000) {
            hasDiff = true;
            reasons.push(`修改时间不同`);
          }

          if (hasDiff) {
            countDifferent += 1;
            diffItems.push({
              id: itemId++,
              filename: fileA.filename,
              status: 'DIFFERENT_ATTR',
              status_label: '属性差异',
              rel_path_a: fileA.relPath,
              rel_path_b: fileB.relPath,
              size_a: fileA.size,
              size_b: fileB.size,
              size_a_formatted: formatBytes(fileA.size),
              size_b_formatted: formatBytes(fileB.size),
              mtime_a: fileA.mtime.toISOString().replace('T', ' ').slice(0, 19),
              mtime_b: fileB.mtime.toISOString().replace('T', ' ').slice(0, 19),
              ext: fileA.ext,
              diff_reason: reasons.join('; '),
            });
          } else {
            countExact += 1;
            diffItems.push({
              id: itemId++,
              filename: fileA.filename,
              status: 'EXACT_MATCH',
              status_label: '完全匹配',
              rel_path_a: fileA.relPath,
              rel_path_b: fileB.relPath,
              size_a: fileA.size,
              size_b: fileB.size,
              size_a_formatted: formatBytes(fileA.size),
              size_b_formatted: formatBytes(fileB.size),
              mtime_a: fileA.mtime.toISOString().replace('T', ' ').slice(0, 19),
              mtime_b: fileB.mtime.toISOString().replace('T', ' ').slice(0, 19),
              ext: fileA.ext,
              diff_reason: '完全一致',
            });
          }
        } else if (fileA && !fileB) {
          countOnlyA += 1;
          diffItems.push({
            id: itemId++,
            filename: fileA.filename,
            status: 'ONLY_IN_A',
            status_label: '仅在目录 A',
            rel_path_a: fileA.relPath,
            rel_path_b: null,
            size_a: fileA.size,
            size_b: null,
            size_a_formatted: formatBytes(fileA.size),
            size_b_formatted: null,
            mtime_a: fileA.mtime.toISOString().replace('T', ' ').slice(0, 19),
            mtime_b: null,
            ext: fileA.ext,
            diff_reason: '目录 B 中缺失',
          });
        } else if (!fileA && fileB) {
          countOnlyB += 1;
          diffItems.push({
            id: itemId++,
            filename: fileB.filename,
            status: 'ONLY_IN_B',
            status_label: '仅在目录 B',
            rel_path_a: null,
            rel_path_b: fileB.relPath,
            size_a: null,
            size_b: fileB.size,
            size_a_formatted: null,
            size_b_formatted: formatBytes(fileB.size),
            mtime_a: null,
            mtime_b: fileB.mtime.toISOString().replace('T', ' ').slice(0, 19),
            ext: fileB.ext,
            diff_reason: '目录 A 中缺失',
          });
        }
      }
    } else if (mode === 'filename_only') {
      const nameMapA = new Map<string, DiscoveredFile[]>();
      const nameMapB = new Map<string, DiscoveredFile[]>();

      for (const f of filesA) {
        const k = normalizeKey(f.filename);
        if (!nameMapA.has(k)) nameMapA.set(k, []);
        nameMapA.get(k)!.push(f);
      }

      for (const f of filesB) {
        const k = normalizeKey(f.filename);
        if (!nameMapB.has(k)) nameMapB.set(k, []);
        nameMapB.get(k)!.push(f);
      }

      const allNames = new Set([...nameMapA.keys(), ...nameMapB.keys()]);
      const sortedNames = Array.from(allNames).sort();

      for (const n of sortedNames) {
        const listA = nameMapA.get(n) || [];
        const listB = nameMapB.get(n) || [];

        if (listA.length > 0 && listB.length > 0) {
          const fileA = listA[0]!;
          const fileB = listB[0]!;

          if (fileA.relPath === fileB.relPath) {
            countExact += 1;
            diffItems.push({
              id: itemId++,
              filename: fileA.filename,
              status: 'EXACT_MATCH',
              status_label: '完全匹配',
              rel_path_a: fileA.relPath,
              rel_path_b: fileB.relPath,
              size_a: fileA.size,
              size_b: fileB.size,
              size_a_formatted: formatBytes(fileA.size),
              size_b_formatted: formatBytes(fileB.size),
              ext: fileA.ext,
              diff_reason: '路径与名称均一致',
            });
          } else {
            countMoved += 1;
            diffItems.push({
              id: itemId++,
              filename: fileA.filename,
              status: 'MOVED_PATH',
              status_label: '位置变动',
              rel_path_a: fileA.relPath,
              rel_path_b: fileB.relPath,
              size_a: fileA.size,
              size_b: fileB.size,
              size_a_formatted: formatBytes(fileA.size),
              size_b_formatted: formatBytes(fileB.size),
              ext: fileA.ext,
              diff_reason: `相对路径不同 (A: ${fileA.relPath}, B: ${fileB.relPath})`,
            });
          }
        } else if (listA.length > 0 && listB.length === 0) {
          for (const fileA of listA) {
            countOnlyA += 1;
            diffItems.push({
              id: itemId++,
              filename: fileA.filename,
              status: 'ONLY_IN_A',
              status_label: '仅在目录 A',
              rel_path_a: fileA.relPath,
              rel_path_b: null,
              size_a: fileA.size,
              size_b: null,
              size_a_formatted: formatBytes(fileA.size),
              size_b_formatted: null,
              ext: fileA.ext,
              diff_reason: '目录 B 中无同名文件',
            });
          }
        } else if (listA.length === 0 && listB.length > 0) {
          for (const fileB of listB) {
            countOnlyB += 1;
            diffItems.push({
              id: itemId++,
              filename: fileB.filename,
              status: 'ONLY_IN_B',
              status_label: '仅在目录 B',
              rel_path_a: null,
              rel_path_b: fileB.relPath,
              size_a: null,
              size_b: fileB.size,
              size_a_formatted: null,
              size_b_formatted: formatBytes(fileB.size),
              ext: fileB.ext,
              diff_reason: '目录 A 中无同名文件',
            });
          }
        }
      }
    } else if (mode === 'prefix_strip') {
      const delimiter = request.delimiter || '_';
      const fieldIndices = request.compare_field_indices && request.compare_field_indices.length > 0 ? request.compare_field_indices : null;

      const getCompareKey = (filename: string, pfx: string | null) => {
        let name = filename;
        if (pfx && name.startsWith(pfx)) {
          name = name.slice(pfx.length);
        }

        if (fieldIndices) {
          const lastDot = name.lastIndexOf('.');
          const stem = lastDot > 0 ? name.substring(0, lastDot) : name;
          const parts = stem.split(delimiter);
          const selectedParts = fieldIndices
            .filter((idx) => idx < parts.length)
            .map((idx) => parts[idx]);
          if (selectedParts.length > 0) {
            return selectedParts.join(delimiter);
          }
        }

        return name;
      };

      const mapA = new Map<string, DiscoveredFile[]>();
      const mapB = new Map<string, DiscoveredFile[]>();

      for (const f of filesA) {
        const key = normalizeKey(getCompareKey(f.filename, prefixStripA));
        if (!mapA.has(key)) mapA.set(key, []);
        mapA.get(key)!.push(f);
      }

      for (const f of filesB) {
        const key = normalizeKey(getCompareKey(f.filename, prefixStripB));
        if (!mapB.has(key)) mapB.set(key, []);
        mapB.get(key)!.push(f);
      }

      const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);
      for (const k of Array.from(allKeys).sort()) {
        const listA = mapA.get(k) || [];
        const listB = mapB.get(k) || [];

        if (listA.length > 0 && listB.length > 0) {
          const fileA = listA[0]!;
          const fileB = listB[0]!;
          countExact += 1;
          diffItems.push({
            id: itemId++,
            filename: fileA.filename,
            status: 'EXACT_MATCH',
            status_label: fieldIndices ? '按指定字段匹配' : '按前缀匹配',
            rel_path_a: fileA.relPath,
            rel_path_b: fileB.relPath,
            size_a: fileA.size,
            size_b: fileB.size,
            size_a_formatted: formatBytes(fileA.size),
            size_b_formatted: formatBytes(fileB.size),
            ext: fileA.ext,
            diff_reason: `比对字段主体匹配: ${k}`,
          });
        } else if (listA.length > 0 && listB.length === 0) {
          for (const fileA of listA) {
            countOnlyA += 1;
            diffItems.push({
              id: itemId++,
              filename: fileA.filename,
              status: 'ONLY_IN_A',
              status_label: '仅在目录 A',
              rel_path_a: fileA.relPath,
              rel_path_b: null,
              size_a: fileA.size,
              size_b: null,
              size_a_formatted: formatBytes(fileA.size),
              size_b_formatted: null,
              ext: fileA.ext,
              diff_reason: `目录 B 中无匹配字段主体 [${k}]`,
            });
          }
        } else if (listA.length === 0 && listB.length > 0) {
          for (const fileB of listB) {
            countOnlyB += 1;
            diffItems.push({
              id: itemId++,
              filename: fileB.filename,
              status: 'ONLY_IN_B',
              status_label: '仅在目录 B',
              rel_path_a: null,
              rel_path_b: fileB.relPath,
              size_a: null,
              size_b: fileB.size,
              size_a_formatted: null,
              size_b_formatted: formatBytes(fileB.size),
              ext: fileB.ext,
              diff_reason: `目录 A 中无匹配字段主体 [${k}]`,
            });
          }
        }
      }
    }

    const totalUnique = diffItems.length;
    const matchPct = totalUnique > 0 ? Number(((countExact / totalUnique) * 100).toFixed(2)) : 0;
    const durationMs = Number((performance.now() - startTime).toFixed(2));

    const summary: CompareSummary = {
      dir_a: dirAPath,
      dir_b: dirBPath,
      comparison_mode: mode,
      scan_time_ms: durationMs,
      total_unique_items: totalUnique,
      count_exact_match: countExact,
      count_only_in_a: countOnlyA,
      count_only_in_b: countOnlyB,
      count_different_attr: countDifferent,
      count_moved: countMoved,
      dir_a_total_files: filesA.length,
      dir_b_total_files: filesB.length,
      dir_a_total_size: dirATotalSize,
      dir_a_total_size_formatted: formatBytes(dirATotalSize),
      dir_b_total_size: dirBTotalSize,
      dir_b_total_size_formatted: formatBytes(dirBTotalSize),
      match_percentage: matchPct,
    };

    return {
      success: true,
      message: 'Comparison completed successfully',
      summary,
      diff_items: diffItems,
    };
  }

  private collectFiles(dirPath: string, request: CompareRequest): DiscoveredFile[] {
    const results: DiscoveredFile[] = [];
    const ignoreHidden = request.ignore_hidden ?? true;

    const queue: string[] = [dirPath];

    while (queue.length > 0) {
      const currentDir = queue.shift()!;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (ignoreHidden && entry.name.startsWith('.')) continue;

        const full = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          queue.push(full);
        } else if (entry.isFile() || entry.isSymbolicLink()) {
          const rel = path.relative(dirPath, full).replace(/\\/g, '/');
          let size = 0;
          let mtime = new Date();
          try {
            const stat = fs.statSync(full);
            size = stat.size;
            mtime = stat.mtime;
          } catch {
            // ignore
          }
          const ext = path.extname(entry.name).toLowerCase();
          results.push({
            relPath: rel,
            filename: entry.name,
            size,
            mtime,
            ext,
          });
        }
      }
    }

    return results;
  }
}
