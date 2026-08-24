import {
  ScanResponse,
  ScanSummary,
  PrefixStatItem,
  PrefixFileItem,
  LeafDirectoryItem,
} from '../models/scan.model.js';
import {
  CompareResponse,
  CompareSummary,
  DiffItem,
  DiffStatus,
} from '../models/compare.model.js';
import {
  FilenamePreviewResponse,
  SplitFieldItem,
} from '../models/split.model.js';
import { formatBytes } from './format.util.js';
import { clusterCommonPrefixes, FileEntryMeta } from './prefix.util.js';

export interface LocalScannedFile {
  filename: string;
  relPath: string; // e.g. "media/photos/raw/IMG_001.jpg" or "IMG_001.jpg"
  size: number;
  mtime?: string | null;
  ext: string;
}

/**
 * Process a local file list scanned directly in the browser into a ScanResponse
 */
export function processLocalFolderScan(
  folderName: string,
  files: LocalScannedFile[],
  options: {
    prefixes?: string[];
    includeRegex?: string;
    excludeRegex?: string;
    maxDepth?: number;
  } = {}
): ScanResponse {
  const startTime = performance.now();
  const includeRe = options.includeRegex ? new RegExp(options.includeRegex) : null;
  const excludeRe = options.excludeRegex ? new RegExp(options.excludeRegex) : null;
  const prefixes = (options.prefixes || []).map((p) => p.trim()).filter(Boolean);

  // Group by directory
  const dirMap = new Map<string, LocalScannedFile[]>();
  const dirSizes = new Map<string, number>();
  const allDirPaths = new Set<string>();

  const filteredFiles: LocalScannedFile[] = [];
  const globalExtCounts: Record<string, number> = {};

  const userPrefixCounts: Record<string, number> = {};
  const userPrefixSizes: Record<string, number> = {};
  const userPrefixExts: Record<string, Record<string, number>> = {};
  const userPrefixSamples: Record<string, string[]> = {};
  const userPrefixFiles: Record<string, PrefixFileItem[]> = {};

  let unmatchedUserCount = 0;
  let unmatchedUserSize = 0;
  const unmatchedUserExts: Record<string, number> = {};
  const unmatchedUserSamples: string[] = [];
  const unmatchedUserFiles: PrefixFileItem[] = [];

  let totalSize = 0;
  let maxDepthSeen = 0;

  for (const file of files) {
    if (includeRe && !includeRe.test(file.filename)) continue;
    if (excludeRe && excludeRe.test(file.filename)) continue;

    const normalizedRel = file.relPath.replace(/\\/g, '/');
    const parts = normalizedRel.split('/');
    const depth = parts.length > 1 ? parts.length - 1 : 0;
    if (depth > maxDepthSeen) maxDepthSeen = depth;

    if (options.maxDepth !== undefined && options.maxDepth !== null && depth > options.maxDepth) {
      continue;
    }

    filteredFiles.push(file);
    totalSize += file.size;

    const ext = file.ext || '[no ext]';
    globalExtCounts[ext] = (globalExtCounts[ext] || 0) + 1;

    // Track directories
    const dirRelPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    allDirPaths.add(dirRelPath);

    // Register ancestor directories
    if (dirRelPath) {
      const subParts = dirRelPath.split('/');
      for (let i = 1; i < subParts.length; i++) {
        allDirPaths.add(subParts.slice(0, i).join('/'));
      }
    }

    if (!dirMap.has(dirRelPath)) {
      dirMap.set(dirRelPath, []);
      dirSizes.set(dirRelPath, 0);
    }
    dirMap.get(dirRelPath)!.push(file);
    dirSizes.set(dirRelPath, (dirSizes.get(dirRelPath) || 0) + file.size);

    const dirFolder = parts.length > 1 ? parts.slice(0, -1).join('/') : '(根目录)';
    const prefixFileEntry: PrefixFileItem = {
      filename: file.filename,
      folder_name: dirFolder,
      rel_path: normalizedRel,
      size_bytes: file.size,
      size_formatted: formatBytes(file.size),
      ext,
    };

    // Prefix matching
    if (prefixes.length > 0) {
      let matchedAny = false;
      for (const p of prefixes) {
        if (file.filename.startsWith(p)) {
          matchedAny = true;
          userPrefixCounts[p] = (userPrefixCounts[p] || 0) + 1;
          userPrefixSizes[p] = (userPrefixSizes[p] || 0) + file.size;

          if (!userPrefixExts[p]) userPrefixExts[p] = {};
          userPrefixExts[p]![ext] = (userPrefixExts[p]![ext] || 0) + 1;

          if (!userPrefixSamples[p]) userPrefixSamples[p] = [];
          if (userPrefixSamples[p]!.length < 8) {
            userPrefixSamples[p]!.push(file.relPath);
          }

          if (!userPrefixFiles[p]) userPrefixFiles[p] = [];
          userPrefixFiles[p]!.push(prefixFileEntry);
        }
      }

      if (!matchedAny) {
        unmatchedUserCount += 1;
        unmatchedUserSize += file.size;
        unmatchedUserExts[ext] = (unmatchedUserExts[ext] || 0) + 1;
        if (unmatchedUserSamples.length < 8) {
          unmatchedUserSamples.push(file.relPath);
        }
        unmatchedUserFiles.push(prefixFileEntry);
      }
    }
  }

  // Identify leaf directories (directories that contain files and no sub-directories that also exist in allDirPaths)
  const allDirectories: LeafDirectoryItem[] = [];
  const sortedDirPaths = Array.from(allDirPaths).sort();

  for (const dPath of sortedDirPaths) {
    const hasSubDir = sortedDirPaths.some(
      (other) => other !== dPath && other.startsWith(dPath ? `${dPath}/` : '')
    );
    const filesInDir = dirMap.get(dPath) || [];
    const isLeaf = !hasSubDir;
    const depth = dPath ? dPath.split('/').length : 0;
    const size = dirSizes.get(dPath) || 0;

    const extCounts: Record<string, number> = {};
    const samples: string[] = [];
    for (const f of filesInDir) {
      extCounts[f.ext] = (extCounts[f.ext] || 0) + 1;
      if (samples.length < 6) samples.push(f.filename);
    }

    allDirectories.push({
      path: dPath ? `${folderName}/${dPath}` : folderName,
      rel_path: dPath || '(根目录)',
      depth,
      is_leaf: isLeaf,
      file_count: filesInDir.length,
      total_size_bytes: size,
      size_formatted: formatBytes(size),
      extensions: extCounts,
      prefix_distribution: {},
      sample_files: samples,
    });
  }

  // Prefix Stat Items
  const prefixStatItems: PrefixStatItem[] = [];
  const autoDiscoveredPrefixes: string[] = [];
  const totalFiles = filteredFiles.length;

  if (prefixes.length > 0) {
    for (const p of prefixes) {
      const count = userPrefixCounts[p] || 0;
      const sz = userPrefixSizes[p] || 0;
      const pct = totalFiles > 0 ? Number(((count / totalFiles) * 100).toFixed(2)) : 0;
      const fList = userPrefixFiles[p] || [];
      const uniqueFolders = Array.from(new Set(fList.map((f) => f.folder_name)));

      prefixStatItems.push({
        prefix: p,
        match_count: count,
        total_size_bytes: sz,
        size_formatted: formatBytes(sz),
        percentage: pct,
        extensions: userPrefixExts[p] || {},
        sample_files: userPrefixSamples[p] || [],
        folders: uniqueFolders,
        files: fList,
      });
    }

    if (unmatchedUserCount > 0) {
      const otherPct = totalFiles > 0 ? Number(((unmatchedUserCount / totalFiles) * 100).toFixed(2)) : 0;
      const uniqueFolders = Array.from(new Set(unmatchedUserFiles.map((f) => f.folder_name)));
      prefixStatItems.push({
        prefix: '[其他/未匹配]',
        match_count: unmatchedUserCount,
        total_size_bytes: unmatchedUserSize,
        size_formatted: formatBytes(unmatchedUserSize),
        percentage: otherPct,
        extensions: unmatchedUserExts,
        sample_files: unmatchedUserSamples,
        folders: uniqueFolders,
        files: unmatchedUserFiles,
      });
    }
  } else {
    // Automatic Clustering
    const clusterMeta: FileEntryMeta[] = filteredFiles.map((f) => {
      const norm = f.relPath.replace(/\\/g, '/');
      const pts = norm.split('/');
      const fName = pts.length > 1 ? pts.slice(0, -1).join('/') : '(根目录)';
      return {
        filename: f.filename,
        folderName: fName,
        relPath: norm,
        size: f.size,
        ext: f.ext,
      };
    });
    const clusters = clusterCommonPrefixes(clusterMeta);
    const sortedKeys = Object.keys(clusters)
      .filter((k) => k !== '[无固定前缀]')
      .sort((a, b) => (clusters[b]?.length ?? 0) - (clusters[a]?.length ?? 0));

    for (const p of sortedKeys) {
      const items = clusters[p] || [];
      const count = items.length;
      const sz = items.reduce((acc, curr) => acc + curr.size, 0);
      const pct = totalFiles > 0 ? Number(((count / totalFiles) * 100).toFixed(2)) : 0;

      const exts: Record<string, number> = {};
      const samples: string[] = [];
      const fileList: PrefixFileItem[] = [];
      for (const it of items) {
        exts[it.ext] = (exts[it.ext] || 0) + 1;
        if (samples.length < 8) samples.push(it.relPath);
        fileList.push({
          filename: it.filename,
          folder_name: it.folderName,
          rel_path: it.relPath,
          size_bytes: it.size,
          size_formatted: formatBytes(it.size),
          ext: it.ext,
        });
      }

      const uniqueFolders = Array.from(new Set(fileList.map((f) => f.folder_name)));

      prefixStatItems.push({
        prefix: p,
        match_count: count,
        total_size_bytes: sz,
        size_formatted: formatBytes(sz),
        percentage: pct,
        extensions: exts,
        sample_files: samples,
        folders: uniqueFolders,
        files: fileList,
      });

      autoDiscoveredPrefixes.push(`${p} (${count}个)`);
    }

    if (clusters['[无固定前缀]']) {
      const unassigned = clusters['[无固定前缀]']!;
      const count = unassigned.length;
      const sz = unassigned.reduce((acc, curr) => acc + curr.size, 0);
      const pct = totalFiles > 0 ? Number(((count / totalFiles) * 100).toFixed(2)) : 0;

      const exts: Record<string, number> = {};
      const samples: string[] = [];
      const fileList: PrefixFileItem[] = [];
      for (const it of unassigned) {
        exts[it.ext] = (exts[it.ext] || 0) + 1;
        if (samples.length < 8) samples.push(it.relPath);
        fileList.push({
          filename: it.filename,
          folder_name: it.folderName,
          rel_path: it.relPath,
          size_bytes: it.size,
          size_formatted: formatBytes(it.size),
          ext: it.ext,
        });
      }

      const uniqueFolders = Array.from(new Set(fileList.map((f) => f.folder_name)));

      prefixStatItems.push({
        prefix: '[无固定前缀]',
        match_count: count,
        total_size_bytes: sz,
        size_formatted: formatBytes(sz),
        percentage: pct,
        extensions: exts,
        sample_files: samples,
        folders: uniqueFolders,
        files: fileList,
      });
    }
  }

  const leafDirs = allDirectories.filter((d) => d.is_leaf);
  leafDirs.sort((a, b) => b.file_count - a.file_count);

  const maxLeaf = leafDirs[0] || null;
  const nonEmptyLeafs = leafDirs.filter((d) => d.file_count > 0);
  const minLeaf = nonEmptyLeafs.length > 0 ? nonEmptyLeafs[nonEmptyLeafs.length - 1] : null;

  const durationMs = Number((performance.now() - startTime).toFixed(2));

  const summary: ScanSummary = {
    target_path: folderName,
    scan_time_ms: durationMs,
    total_files: totalFiles,
    total_size_bytes: totalSize,
    total_size_formatted: formatBytes(totalSize),
    total_directories: allDirectories.length,
    total_leaf_directories: leafDirs.length,
    max_depth: maxDepthSeen,
    avg_files_per_leaf_dir: leafDirs.length > 0 ? Number((totalFiles / leafDirs.length).toFixed(2)) : 0,
    max_files_dir: maxLeaf
      ? {
          rel_path: maxLeaf.rel_path,
          file_count: maxLeaf.file_count,
          size_formatted: maxLeaf.size_formatted,
        }
      : null,
    min_files_dir: minLeaf
      ? {
          rel_path: minLeaf.rel_path,
          file_count: minLeaf.file_count,
          size_formatted: minLeaf.size_formatted,
        }
      : null,
    empty_leaf_dirs_count: leafDirs.filter((d) => d.file_count === 0).length,
    top_extensions: globalExtCounts,
    auto_discovered_prefixes: autoDiscoveredPrefixes,
  };

  return {
    success: true,
    message: 'Local scan completed',
    summary,
    prefix_stats: prefixStatItems,
    leaf_directories: leafDirs,
    all_directories: allDirectories,
  };
}

/**
 * Compare two local folder file lists directly in browser
 */
export function processLocalFolderCompare(
  folderNameA: string,
  filesA: LocalScannedFile[],
  folderNameB: string,
  filesB: LocalScannedFile[],
  options: {
    mode?: 'prefix_strip' | 'relative_path' | 'filename_only';
    ignoreCase?: boolean;
    compareSize?: boolean;
    prefixStripA?: string;
    prefixStripB?: string;
    delimiter?: string;
    compareFieldIndices?: number[];
  } = {}
): CompareResponse {
  const startTime = performance.now();
  const mode = options.mode || 'prefix_strip';
  const ignoreCase = options.ignoreCase ?? false;
  const compareSize = options.compareSize ?? true;
  const prefixStripA = options.prefixStripA || null;
  const prefixStripB = options.prefixStripB || null;
  const delimiter = options.delimiter || '_';
  const fieldIndices = options.compareFieldIndices && options.compareFieldIndices.length > 0 ? options.compareFieldIndices : null;

  const normalizeKey = (val: string) => (ignoreCase ? val.toLowerCase() : val);

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

  if (mode === 'prefix_strip') {
    const getCompareKey = (filename: string, pfx: string | null) => {
      let name = filename;
      if (pfx && name.startsWith(pfx)) {
        name = name.slice(pfx.length);
      }
      if (fieldIndices) {
        const lastDot = name.lastIndexOf('.');
        const stem = lastDot > 0 ? name.substring(0, lastDot) : name;
        const parts = stem.split(delimiter);
        const selectedParts = fieldIndices.filter((idx) => idx < parts.length).map((idx) => parts[idx]);
        if (selectedParts.length > 0) return selectedParts.join(delimiter);
      }
      return name;
    };

    const mapA = new Map<string, LocalScannedFile[]>();
    const mapB = new Map<string, LocalScannedFile[]>();

    for (const f of filesA) {
      const k = normalizeKey(getCompareKey(f.filename, prefixStripA));
      if (!mapA.has(k)) mapA.set(k, []);
      mapA.get(k)!.push(f);
    }

    for (const f of filesB) {
      const k = normalizeKey(getCompareKey(f.filename, prefixStripB));
      if (!mapB.has(k)) mapB.set(k, []);
      mapB.get(k)!.push(f);
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
          diff_reason: `比对字段主体一致: ${k}`,
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
            diff_reason: `目录 B 缺失主体 [${k}]`,
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
            diff_reason: `目录 A 缺失主体 [${k}]`,
          });
        }
      }
    }
  } else if (mode === 'relative_path') {
    const mapA = new Map<string, LocalScannedFile>();
    const mapB = new Map<string, LocalScannedFile>();

    for (const f of filesA) mapA.set(normalizeKey(f.relPath), f);
    for (const f of filesB) mapB.set(normalizeKey(f.relPath), f);

    const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);
    for (const k of Array.from(allKeys).sort()) {
      const fileA = mapA.get(k);
      const fileB = mapB.get(k);

      if (fileA && fileB) {
        let hasDiff = false;
        const reasons: string[] = [];
        if (compareSize && fileA.size !== fileB.size) {
          hasDiff = true;
          reasons.push(`大小不同 (A: ${formatBytes(fileA.size)}, B: ${formatBytes(fileB.size)})`);
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
          ext: fileB.ext,
          diff_reason: '目录 A 中缺失',
        });
      }
    }
  } else {
    // filename_only
    const nameMapA = new Map<string, LocalScannedFile[]>();
    const nameMapB = new Map<string, LocalScannedFile[]>();

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
    for (const n of Array.from(allNames).sort()) {
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
  }

  const totalUnique = diffItems.length;
  const matchPct = totalUnique > 0 ? Number(((countExact / totalUnique) * 100).toFixed(2)) : 0;
  const durationMs = Number((performance.now() - startTime).toFixed(2));

  const summary: CompareSummary = {
    dir_a: folderNameA,
    dir_b: folderNameB,
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
    message: 'Local comparison completed',
    summary,
    diff_items: diffItems,
  };
}

/**
 * Process filename split preview for local files using unified SplitFieldItem list
 */
/**
 * Process filename split preview for local files using unified SplitFieldItem list
 */
export function processLocalFilenameSplit(
  folderName: string,
  files: LocalScannedFile[],
  fields: SplitFieldItem[]
): FilenamePreviewResponse {
  if (!fields || fields.length === 0) {
    throw new Error('请至少配置一个拆分字段');
  }

  const enabledFields = fields.filter((f) => f.enabled);
  if (enabledFields.length === 0) {
    throw new Error('请至少开启一个需要导出的字段');
  }

  const headers = [
    '文件夹名称',
    '原始文件名',
    ...enabledFields.map((f) => f.value.trim() || '未命名'),
  ];

  const rows: string[][] = [];
  let unmatchedCount = 0;
  const leafDirs = new Set<string>();

  for (const f of files) {
    const lastDotIdx = f.filename.lastIndexOf('.');
    const stem = lastDotIdx > 0 ? f.filename.substring(0, lastDotIdx) : f.filename;

    let remaining = stem;
    let matched = true;
    const outputValues: string[] = [];

    let i = 0;
    while (i < fields.length) {
      const current = fields[i]!;

      // Find the next delimiter or terminating boundary
      let nextDelim: string | null = null;
      let nextDelimIdx = -1;

      for (let j = i + 1; j < fields.length; j++) {
        if (!fields[j]!.enabled || ['_', '-', '.', ' ', '/', '\\', '@', '#'].includes(fields[j]!.value)) {
          nextDelim = fields[j]!.value;
          nextDelimIdx = j;
          break;
        }
      }

      if (current.enabled) {
        if (nextDelim && remaining.includes(nextDelim)) {
          const splitIdx = remaining.indexOf(nextDelim);
          const val = remaining.substring(0, splitIdx);
          remaining = remaining.substring(splitIdx + nextDelim.length);
          outputValues.push(val);
          i = nextDelimIdx + 1;
        } else if (i === fields.length - 1 || !nextDelim) {
          outputValues.push(remaining);
          remaining = '';
          i += 1;
        } else {
          outputValues.push(remaining);
          remaining = '';
          matched = false;
          i += 1;
        }
      } else {
        // Disabled field acts as separator / skip token
        if (current.value && remaining.startsWith(current.value)) {
          remaining = remaining.substring(current.value.length);
        } else if (current.value && remaining.includes(current.value)) {
          const splitIdx = remaining.indexOf(current.value);
          remaining = remaining.substring(splitIdx + current.value.length);
        }
        i += 1;
      }
    }

    if (remaining.length > 0) {
      matched = false;
    }

    const relParts = f.relPath.replace(/\\/g, '/').split('/');
    const relDir = relParts.length > 1 ? relParts.slice(0, -1).join('/') : '(根目录)';
    const folderNameLeaf = relParts.length > 1 ? relParts[relParts.length - 2]! : folderName;

    leafDirs.add(relDir);

    if (!matched) unmatchedCount += 1;

    rows.push([folderNameLeaf, f.filename, ...outputValues]);
  }

  return {
    success: true,
    message: 'Local split preview generated',
    headers,
    rows,
    file_count: files.length,
    leaf_count: leafDirs.size,
    unmatched_count: unmatchedCount,
  };
}

