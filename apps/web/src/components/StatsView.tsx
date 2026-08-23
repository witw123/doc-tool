'use client';

import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  Play,
  Sparkles,
  Trash2,
  SlidersHorizontal,
  Clock,
  Layers,
  FileSpreadsheet,
  FolderCheck,
  Zap,
  Check,
} from 'lucide-react';
import { ScanResponse, ScanRequest, processLocalFolderScan, LocalScannedFile } from '@doc-tool/shared';
import { apiScanDirectory } from '@/lib/api';
import { pickLocalFolder } from '@/lib/local-folder-picker';
import { PrefixTable } from './PrefixTable';
import { LeafDirectoryTable } from './LeafDirectoryTable';
import { useToast } from './Toast';

const STORAGE_KEY_PREFIXES = 'filescope_saved_prefixes';

interface StatsViewProps {
  initialPath?: string;
}

export function StatsView({ initialPath = '' }: StatsViewProps) {
  const { showToast } = useToast();

  const [path, setPath] = useState(initialPath);
  const [localFiles, setLocalFiles] = useState<LocalScannedFile[] | null>(null);
  const [folderDisplayName, setFolderDisplayName] = useState('');

  const [prefixes, setPrefixes] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [includeRegex, setIncludeRegex] = useState('');
  const [excludeRegex, setExcludeRegex] = useState('');
  const [maxDepth, setMaxDepth] = useState<number | ''>('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);

  // Load saved prefixes from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PREFIXES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setPrefixes(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Sync initialPath when updated from preset
  useEffect(() => {
    if (initialPath) {
      setPath(initialPath);
      setLocalFiles(null);
      setFolderDisplayName(initialPath);
      triggerScan(initialPath);
    }
  }, [initialPath]);

  const savePrefixes = (newPrefixes: string[]) => {
    setPrefixes(newPrefixes);
    localStorage.setItem(STORAGE_KEY_PREFIXES, JSON.stringify(newPrefixes));
  };

  const handleAddTag = () => {
    const val = tagInput.trim();
    if (val && !prefixes.includes(val)) {
      const updated = [...prefixes, val];
      savePrefixes(updated);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    const updated = prefixes.filter((p) => p !== tag);
    savePrefixes(updated);
  };

  const handleClearPrefixes = () => {
    savePrefixes([]);
    showToast('已清空指定前缀缓存', 'info');
  };

  // Direct Native Local Folder Picker
  const handlePickLocalFolder = async () => {
    try {
      setLoading(true);
      const result = await pickLocalFolder();
      setLocalFiles(result.files);
      setFolderDisplayName(result.folderName);
      setPath(result.folderName);

      // Instantly run local scan
      const res = processLocalFolderScan(result.folderName, result.files, {
        prefixes: prefixes.length > 0 ? prefixes : undefined,
        includeRegex: includeRegex.trim() || undefined,
        excludeRegex: excludeRegex.trim() || undefined,
        maxDepth: maxDepth !== '' ? Number(maxDepth) : undefined,
      });

      setScanResult(res);
      showToast(
        `已选择电脑文件夹「${result.folderName}」，共读取 ${res.summary.total_files} 个文件`,
        'success'
      );
    } catch (err: any) {
      if (err.message !== '用户取消了文件夹选择') {
        showToast(`选择文件夹失败: ${err.message}`, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const triggerScan = async (targetPath?: string) => {
    if (localFiles && localFiles.length > 0) {
      setLoading(true);
      try {
        const res = processLocalFolderScan(folderDisplayName || '选择的文件夹', localFiles, {
          prefixes: prefixes.length > 0 ? prefixes : undefined,
          includeRegex: includeRegex.trim() || undefined,
          excludeRegex: excludeRegex.trim() || undefined,
          maxDepth: maxDepth !== '' ? Number(maxDepth) : undefined,
        });
        setScanResult(res);
        showToast(`分析完成：共计 ${res.summary.total_files} 个文件`, 'success');
      } finally {
        setLoading(false);
      }
      return;
    }

    const pathToScan = targetPath !== undefined ? targetPath : path;
    if (!pathToScan.trim()) {
      showToast('请先点击「选择电脑文件夹」', 'warning');
      return;
    }

    setLoading(true);
    try {
      const req: ScanRequest = {
        path: pathToScan.trim(),
        prefixes: prefixes.length > 0 ? prefixes : undefined,
        include_regex: includeRegex.trim() || undefined,
        exclude_regex: excludeRegex.trim() || undefined,
        max_depth: maxDepth !== '' ? Number(maxDepth) : undefined,
      };

      const res = await apiScanDirectory(req);
      setScanResult(res);
      showToast(
        `分析完成：共计 ${res.summary.total_files} 个文件，${res.summary.total_leaf_directories} 个最深层目录`,
        'success'
      );
    } catch (err: any) {
      showToast(`统计分析失败: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Search & Control Panel Card */}
      <div className="glass-panel p-6 sm:p-7 space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* Target Folder Input with Direct Native OS Picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-brand-accent" />
                <span>选择用户的电脑文件夹</span>
              </label>
              {localFiles && (
                <span className="text-[11px] font-semibold text-emerald-accent flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  <span>已载入 {localFiles.length} 个文件</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handlePickLocalFolder}
                className="h-11 px-5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/25 transition-all flex items-center gap-2 shrink-0"
              >
                <FolderOpen className="w-4 h-4" />
                <span>选择电脑文件夹</span>
              </button>

              <input
                type="text"
                readOnly={Boolean(localFiles)}
                placeholder="点击左侧按钮选择本机电脑文件夹..."
                value={folderDisplayName || path}
                onChange={(e) => {
                  setPath(e.target.value);
                  setFolderDisplayName(e.target.value);
                  setLocalFiles(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    triggerScan();
                  }
                }}
                className="flex-1 h-11 px-4 rounded-xl text-xs font-mono interactive-input"
              />
            </div>
          </div>

          {/* Specified Prefixes Tag Box */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-accent" />
                <span>指定统计前缀 (默认留空即全自动聚类归纳)</span>
              </label>
              {prefixes.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearPrefixes}
                  className="text-[11px] text-[var(--text-muted)] hover:text-rose-400 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>清空</span>
                </button>
              )}
            </div>

            <div className="min-h-[44px] p-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex flex-wrap items-center gap-1.5">
              {prefixes.map((pfx) => (
                <span
                  key={pfx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-bold tag-badge"
                >
                  <span>{pfx}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(pfx)}
                    className="hover:text-rose-400 text-xs ml-0.5"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder={
                  prefixes.length === 0
                    ? '留空时默认全自动识别所有公共前缀字段，或输入自定义前缀按回车...'
                    : '输入自定义前缀按回车...'
                }
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                className="flex-1 min-w-[160px] px-2 py-1 text-xs bg-transparent text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
            </div>
          </div>
        </div>

        {/* Advanced Options Collapsible */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors py-1"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{showAdvanced ? '收起高级筛选参数' : '展开高级筛选参数 (正则匹配 / 深度限制)'}</span>
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 mt-2 border-t border-[var(--border-subtle)] animate-in fade-in duration-200">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  包含匹配正则 (Include Regex)
                </label>
                <input
                  type="text"
                  placeholder="例如: \.(docx|pdf)$"
                  value={includeRegex}
                  onChange={(e) => setIncludeRegex(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg text-xs font-mono interactive-input"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  排除匹配正则 (Exclude Regex)
                </label>
                <input
                  type="text"
                  placeholder="例如: ^(~|\.tmp)"
                  value={excludeRegex}
                  onChange={(e) => setExcludeRegex(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg text-xs font-mono interactive-input"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  最大扫描层级深度
                </label>
                <input
                  type="number"
                  placeholder="不限深度"
                  value={maxDepth}
                  onChange={(e) =>
                    setMaxDepth(e.target.value ? parseInt(e.target.value, 10) : '')
                  }
                  className="w-full px-3 py-1.5 rounded-lg text-xs font-mono interactive-input"
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="flex justify-end pt-3 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            disabled={loading}
            onClick={() => triggerScan()}
            className="action-btn-primary inline-flex items-center gap-2 px-6 py-2.5 text-xs sm:text-sm disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>正在深度分析中...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>执行统计分析</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* KPI Cards Summary */}
      {scanResult && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="glass-panel p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold mb-1">
              <span>总文件数量</span>
              <FileSpreadsheet className="w-3.5 h-3.5 text-brand-accent" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
              {scanResult.summary.total_files.toLocaleString()}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1 font-mono">
              总空间: {scanResult.summary.total_size_formatted}
            </div>
          </div>

          <div className="glass-panel p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold mb-1">
              <span>最深层(叶子)目录数</span>
              <FolderCheck className="w-3.5 h-3.5 text-emerald-accent" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-accent">
              {scanResult.summary.total_leaf_directories.toLocaleString()}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1 font-mono">
              总扫描目录: {scanResult.summary.total_directories}
            </div>
          </div>

          <div className="glass-panel p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold mb-1">
              <span>平均叶子目录文件数</span>
              <Layers className="w-3.5 h-3.5 text-brand-accent" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-brand-accent">
              {scanResult.summary.avg_files_per_leaf_dir}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1 font-mono">
              最大层级深度: {scanResult.summary.max_depth}
            </div>
          </div>

          <div className="glass-panel p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold mb-1">
              <span>单目录最多文件</span>
              <Zap className="w-3.5 h-3.5 text-amber-accent" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-amber-accent">
              {scanResult.summary.max_files_dir ? `${scanResult.summary.max_files_dir.file_count} 个` : '0'}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1 font-mono truncate" title={scanResult.summary.max_files_dir?.rel_path || '-'}>
              {scanResult.summary.max_files_dir?.rel_path || '-'}
            </div>
          </div>

          <div className="glass-panel p-4 col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold mb-1">
              <span>分析耗时</span>
              <Clock className="w-3.5 h-3.5 text-cyan-accent" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-cyan-accent">
              {scanResult.summary.scan_time_ms} ms
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1 font-mono">
              浏览器极速渲染
            </div>
          </div>
        </div>
      )}

      {/* Results Tables */}
      {scanResult && (
        <div className="space-y-6">
          <PrefixTable prefixStats={scanResult.prefix_stats} />
          <LeafDirectoryTable
            leafDirectories={scanResult.leaf_directories}
            allDirectories={scanResult.all_directories}
          />
        </div>
      )}
    </div>
  );
}
