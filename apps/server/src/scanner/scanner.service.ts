import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  ScanRequest,
  ScanResponse,
  ScanSummary,
  PrefixStatItem,
  LeafDirectoryItem,
  formatBytes,
  clusterCommonPrefixes,
  FileEntryMeta,
} from '@doc-tool/shared';

@Injectable()
export class ScannerService {
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

  async scan(request: ScanRequest): Promise<ScanResponse> {
    const startTime = performance.now();
    const targetPath = this.resolvePath(request.path);

    if (!fs.existsSync(targetPath)) {
      throw new NotFoundException(`Path does not exist: ${targetPath}`);
    }

    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      throw new BadRequestException(`Path is not a directory: ${targetPath}`);
    }

    const includeRegex = request.include_regex ? new RegExp(request.include_regex) : null;
    const excludeRegex = request.exclude_regex ? new RegExp(request.exclude_regex) : null;
    const ignoreHidden = request.ignore_hidden ?? true;
    const prefixes = (request.prefixes || []).map((p) => p.trim()).filter(Boolean);

    const allDirectories: LeafDirectoryItem[] = [];
    const globalExtCounts: Record<string, number> = {};
    const allScannedFiles: FileEntryMeta[] = [];

    const userPrefixCounts: Record<string, number> = {};
    const userPrefixSizes: Record<string, number> = {};
    const userPrefixExts: Record<string, Record<string, number>> = {};
    const userPrefixSamples: Record<string, string[]> = {};
    const userPrefixFiles: Record<string, any[]> = {};

    let totalFiles = 0;
    let totalSize = 0;
    let maxDepthSeen = 0;

    let unmatchedUserCount = 0;
    let unmatchedUserSize = 0;
    const unmatchedUserExts: Record<string, number> = {};
    const unmatchedUserSamples: string[] = [];
    const unmatchedUserFiles: any[] = [];

    // Traverse directory tree iteratively
    const queue: { dirPath: string; depth: number }[] = [{ dirPath: targetPath, depth: 0 }];

    while (queue.length > 0) {
      const { dirPath, depth } = queue.shift()!;
      if (depth > maxDepthSeen) {
        maxDepthSeen = depth;
      }

      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
      } catch {
        continue;
      }

      const subDirs: string[] = [];
      const validFiles: { filename: string; size: number }[] = [];
      const dirExtCounts: Record<string, number> = {};
      const dirPrefixCounts: Record<string, number> = {};
      const dirSamples: string[] = [];
      let dirSize = 0;

      const relPath = path.relative(targetPath, dirPath).replace(/\\/g, '/');

      for (const entry of entries) {
        if (ignoreHidden && entry.name.startsWith('.')) {
          continue;
        }

        if (entry.isDirectory()) {
          if (request.max_depth === undefined || request.max_depth === null || depth < request.max_depth) {
            subDirs.push(entry.name);
            queue.push({
              dirPath: path.join(dirPath, entry.name),
              depth: depth + 1,
            });
          }
        } else if (entry.isFile() || entry.isSymbolicLink()) {
          if (includeRegex && !includeRegex.test(entry.name)) continue;
          if (excludeRegex && excludeRegex.test(entry.name)) continue;

          let fileSize = 0;
          try {
            const fStat = fs.statSync(path.join(dirPath, entry.name));
            fileSize = fStat.size;
          } catch {
            fileSize = 0;
          }

          validFiles.push({ filename: entry.name, size: fileSize });
          dirSize += fileSize;
          totalSize += fileSize;
          totalFiles += 1;

          const ext = path.extname(entry.name).toLowerCase() || '[no ext]';
          dirExtCounts[ext] = (dirExtCounts[ext] || 0) + 1;
          globalExtCounts[ext] = (globalExtCounts[ext] || 0) + 1;

          const relFilePath = (relPath ? `${relPath}/${entry.name}` : entry.name).replace(/\\/g, '/');
          allScannedFiles.push({
            filename: entry.name,
            relPath: relFilePath,
            size: fileSize,
            ext,
          });

          // User-specified prefixes matching
          const prefixFileEntry = {
            filename: entry.name,
            rel_path: relFilePath,
            size_bytes: fileSize,
            size_formatted: formatBytes(fileSize),
            ext,
          };

          if (prefixes.length > 0) {
            let matchedAny = false;
            for (const p of prefixes) {
              if (entry.name.startsWith(p)) {
                matchedAny = true;
                dirPrefixCounts[p] = (dirPrefixCounts[p] || 0) + 1;
                userPrefixCounts[p] = (userPrefixCounts[p] || 0) + 1;
                userPrefixSizes[p] = (userPrefixSizes[p] || 0) + fileSize;

                if (!userPrefixExts[p]) userPrefixExts[p] = {};
                userPrefixExts[p]![ext] = (userPrefixExts[p]![ext] || 0) + 1;

                if (!userPrefixSamples[p]) userPrefixSamples[p] = [];
                if (userPrefixSamples[p]!.length < 8) {
                  userPrefixSamples[p]!.push(relFilePath);
                }

                if (!userPrefixFiles[p]) userPrefixFiles[p] = [];
                userPrefixFiles[p]!.push(prefixFileEntry);
              }
            }

            if (!matchedAny) {
              unmatchedUserCount += 1;
              unmatchedUserSize += fileSize;
              unmatchedUserExts[ext] = (unmatchedUserExts[ext] || 0) + 1;
              if (unmatchedUserSamples.length < 8) {
                unmatchedUserSamples.push(relFilePath);
              }
              unmatchedUserFiles.push(prefixFileEntry);
            }
          }

          if (dirSamples.length < 6) {
            dirSamples.push(entry.name);
          }
        }
      }

      const isLeaf = subDirs.length === 0;

      allDirectories.push({
        path: dirPath,
        rel_path: relPath || '(根目录)',
        depth,
        is_leaf: isLeaf,
        file_count: validFiles.length,
        total_size_bytes: dirSize,
        size_formatted: formatBytes(dirSize),
        extensions: dirExtCounts,
        prefix_distribution: dirPrefixCounts,
        sample_files: dirSamples,
      });
    }

    // Process Prefix Statistics
    const prefixStatItems: PrefixStatItem[] = [];
    const autoDiscoveredPrefixes: string[] = [];

    if (prefixes.length > 0) {
      // User specified prefixes
      for (const p of prefixes) {
        const count = userPrefixCounts[p] || 0;
        const sz = userPrefixSizes[p] || 0;
        const pct = totalFiles > 0 ? Number(((count / totalFiles) * 100).toFixed(2)) : 0;

        prefixStatItems.push({
          prefix: p,
          match_count: count,
          total_size_bytes: sz,
          size_formatted: formatBytes(sz),
          percentage: pct,
          extensions: userPrefixExts[p] || {},
          sample_files: userPrefixSamples[p] || [],
          files: userPrefixFiles[p] || [],
        });
      }

      if (unmatchedUserCount > 0) {
        const otherPct = totalFiles > 0 ? Number(((unmatchedUserCount / totalFiles) * 100).toFixed(2)) : 0;
        prefixStatItems.push({
          prefix: '[其他/未匹配]',
          match_count: unmatchedUserCount,
          total_size_bytes: unmatchedUserSize,
          size_formatted: formatBytes(unmatchedUserSize),
          percentage: otherPct,
          extensions: unmatchedUserExts,
          sample_files: unmatchedUserSamples,
          files: unmatchedUserFiles,
        });
      }
    } else {
      // Default Automatic Clustering
      const clusters = clusterCommonPrefixes(allScannedFiles);
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
        const fileList = [];
        for (const it of items) {
          exts[it.ext] = (exts[it.ext] || 0) + 1;
          if (samples.length < 8) {
            samples.push(it.relPath);
          }
          fileList.push({
            filename: it.filename,
            rel_path: it.relPath,
            size_bytes: it.size,
            size_formatted: formatBytes(it.size),
            ext: it.ext,
          });
        }

        prefixStatItems.push({
          prefix: p,
          match_count: count,
          total_size_bytes: sz,
          size_formatted: formatBytes(sz),
          percentage: pct,
          extensions: exts,
          sample_files: samples,
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
        const fileList = [];
        for (const it of unassigned) {
          exts[it.ext] = (exts[it.ext] || 0) + 1;
          if (samples.length < 8) {
            samples.push(it.relPath);
          }
          fileList.push({
            filename: it.filename,
            rel_path: it.relPath,
            size_bytes: it.size,
            size_formatted: formatBytes(it.size),
            ext: it.ext,
          });
        }

        prefixStatItems.push({
          prefix: '[无固定前缀]',
          match_count: count,
          total_size_bytes: sz,
          size_formatted: formatBytes(sz),
          percentage: pct,
          extensions: exts,
          sample_files: samples,
          files: fileList,
        });
      }
    }

    // Leaf directories processing
    const leafDirs = allDirectories.filter((d) => d.is_leaf);
    leafDirs.sort((a, b) => b.file_count - a.file_count);

    const totalLeafDirs = leafDirs.length;
    const avgFilesLeaf = totalLeafDirs > 0 ? Number((totalFiles / totalLeafDirs).toFixed(2)) : 0;

    const maxLeaf = leafDirs[0] || null;
    const nonEmptyLeafs = leafDirs.filter((d) => d.file_count > 0);
    const minLeaf = nonEmptyLeafs.length > 0 ? nonEmptyLeafs[nonEmptyLeafs.length - 1] : null;
    const emptyLeafsCount = leafDirs.filter((d) => d.file_count === 0).length;

    // Top extensions
    const sortedExts = Object.entries(globalExtCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});

    const durationMs = Number((performance.now() - startTime).toFixed(2));

    const summary: ScanSummary = {
      target_path: targetPath,
      scan_time_ms: durationMs,
      total_files: totalFiles,
      total_size_bytes: totalSize,
      total_size_formatted: formatBytes(totalSize),
      total_directories: allDirectories.length,
      total_leaf_directories: totalLeafDirs,
      max_depth: maxDepthSeen,
      avg_files_per_leaf_dir: avgFilesLeaf,
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
      empty_leaf_dirs_count: emptyLeafsCount,
      top_extensions: sortedExts,
      auto_discovered_prefixes: autoDiscoveredPrefixes,
    };

    return {
      success: true,
      message: 'Scan completed successfully',
      summary,
      prefix_stats: prefixStatItems,
      leaf_directories: leafDirs,
      all_directories: allDirectories,
    };
  }
}
