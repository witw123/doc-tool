'use client';

import React, { useState } from 'react';
import {
  FolderOpen,
  Play,
  ArrowRightLeft,
  FileCheck2,
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
  Check,
} from 'lucide-react';
import {
  CompareResponse,
  CompareRequest,
  processLocalFolderCompare,
  LocalScannedFile,
} from '@doc-tool/shared';
import { apiCompareDirectories } from '@/lib/api';
import { pickLocalFolder } from '@/lib/local-folder-picker';
import { DiffTable } from './DiffTable';
import { useToast } from './Toast';

interface DiffViewProps {
  initialDirA?: string;
  initialDirB?: string;
}

export function DiffView({ initialDirA = '', initialDirB = '' }: DiffViewProps) {
  const { showToast } = useToast();

  // Folder A & Folder B local browser files
  const [folderNameA, setFolderNameA] = useState(initialDirA || '');
  const [filesA, setFilesA] = useState<LocalScannedFile[] | null>(null);

  const [folderNameB, setFolderNameB] = useState(initialDirB || '');
  const [filesB, setFilesB] = useState<LocalScannedFile[] | null>(null);

  // Default mode is 'prefix_strip' (按名字前缀比对)
  const [mode, setMode] = useState<'prefix_strip' | 'relative_path' | 'filename_only'>('prefix_strip');

  const [delimiter, setDelimiter] = useState('_');
  const [compareFields, setCompareFields] = useState<number[]>([0, 1]);
  const [useFieldMatching, setUseFieldMatching] = useState(false);

  const [compareSize, setCompareSize] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);

  const [prefixA, setPrefixA] = useState('');
  const [prefixB, setPrefixB] = useState('');

  const [loading, setLoading] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareResponse | null>(null);

  const handlePickFolderA = async () => {
    try {
      const result = await pickLocalFolder();
      setFolderNameA(result.folderName);
      setFilesA(result.files);
      showToast(`已选择目录 A: ${result.folderName} (${result.files.length} 个文件)`, 'info');

      if (filesB && filesB.length > 0) {
        runLocalCompare(result.folderName, result.files, folderNameB, filesB);
      }
    } catch (err: any) {
      if (err.message !== '用户取消了文件夹选择') {
        showToast(`选择文件夹失败: ${err.message}`, 'error');
      }
    }
  };

  const handlePickFolderB = async () => {
    try {
      const result = await pickLocalFolder();
      setFolderNameB(result.folderName);
      setFilesB(result.files);
      showToast(`已选择目录 B: ${result.folderName} (${result.files.length} 个文件)`, 'info');

      if (filesA && filesA.length > 0) {
        runLocalCompare(folderNameA, filesA, result.folderName, result.files);
      }
    } catch (err: any) {
      if (err.message !== '用户取消了文件夹选择') {
        showToast(`选择文件夹失败: ${err.message}`, 'error');
      }
    }
  };

  const handleSwapDirs = () => {
    const tempName = folderNameA;
    const tempFiles = filesA;
    setFolderNameA(folderNameB);
    setFilesA(filesB);
    setFolderNameB(tempName);
    setFilesB(tempFiles);

    if (tempFiles && filesA) {
      runLocalCompare(folderNameB, filesB!, tempName, tempFiles);
    }
  };

  const toggleField = (fieldIdx: number) => {
    setCompareFields((prev) =>
      prev.includes(fieldIdx) ? prev.filter((i) => i !== fieldIdx) : [...prev, fieldIdx].sort()
    );
  };

  const runLocalCompare = (
    nameA: string,
    listA: LocalScannedFile[],
    nameB: string,
    listB: LocalScannedFile[]
  ) => {
    setLoading(true);
    try {
      const res = processLocalFolderCompare(nameA, listA, nameB, listB, {
        mode,
        ignoreCase,
        compareSize,
        prefixStripA: prefixA.trim() || undefined,
        prefixStripB: prefixB.trim() || undefined,
        delimiter: mode === 'prefix_strip' && useFieldMatching ? delimiter : undefined,
        compareFieldIndices:
          mode === 'prefix_strip' && useFieldMatching && compareFields.length > 0
            ? compareFields
            : undefined,
      });

      setCompareResult(res);
      showToast(
        `比对完成：共比对 ${res.summary.total_unique_items} 项，匹配率 ${res.summary.match_percentage}%`,
        'success'
      );
    } finally {
      setLoading(false);
    }
  };

  const triggerCompare = async () => {
    if (filesA && filesB) {
      runLocalCompare(folderNameA, filesA, folderNameB, filesB);
      return;
    }

    if (!folderNameA.trim() || !folderNameB.trim()) {
      showToast('请先选择目录 A 和目录 B 的电脑文件夹', 'warning');
      return;
    }

    setLoading(true);
    try {
      const req: CompareRequest = {
        dir_a: folderNameA.trim(),
        dir_b: folderNameB.trim(),
        mode,
        compare_size: compareSize,
        ignore_case: ignoreCase,
        prefix_strip_a: prefixA.trim() || undefined,
        prefix_strip_b: prefixB.trim() || undefined,
        delimiter: mode === 'prefix_strip' && useFieldMatching ? delimiter : undefined,
        compare_field_indices:
          mode === 'prefix_strip' && useFieldMatching && compareFields.length > 0
            ? compareFields
            : undefined,
      };

      const res = await apiCompareDirectories(req);
      setCompareResult(res);
      showToast(
        `比对完成：共比对 ${res.summary.total_unique_items} 项，匹配率 ${res.summary.match_percentage}%`,
        'success'
      );
    } catch (err: any) {
      showToast(`比对失败: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuration & Inputs Card */}
      <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 sm:p-6 shadow-xl space-y-4">
        {/* Directories Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
          {/* Folder A Picker */}
          <div>
            <div className="flex items-center justify-between min-h-[32px] mb-1.5">
              <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-brand-accent" />
                <span>基准目录 (Directory A)</span>
              </label>
              {filesA && (
                <span className="text-[11px] font-semibold text-emerald-accent flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  <span>已选择 ({filesA.length} 个文件)</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePickFolderA}
                className="h-[42px] px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 shrink-0"
              >
                <FolderOpen className="w-4 h-4" />
                <span>选择目录 A 文件夹</span>
              </button>

              <input
                type="text"
                readOnly={Boolean(filesA)}
                placeholder="点击左侧按钮选择本机目录 A..."
                value={folderNameA}
                onChange={(e) => {
                  setFolderNameA(e.target.value);
                  setFilesA(null);
                }}
                className="flex-1 h-[42px] px-3.5 rounded-xl text-xs font-mono bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:border-indigo-500 outline-none transition-all"
              />
            </div>
          </div>

          {/* Folder B Picker */}
          <div>
            <div className="flex items-center justify-between min-h-[32px] mb-1.5">
              <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-cyan-accent" />
                <span>对比目录 (Directory B)</span>
              </label>
              <button
                type="button"
                onClick={handleSwapDirs}
                className="text-[11px] text-[var(--text-muted)] hover:text-cyan-accent transition-colors flex items-center gap-1"
                title="对调 A 和 B"
              >
                <ArrowRightLeft className="w-3 h-3" />
                <span>对调目录</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePickFolderB}
                className="h-[42px] px-4 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/20 transition-all flex items-center gap-2 shrink-0"
              >
                <FolderOpen className="w-4 h-4" />
                <span>选择目录 B 文件夹</span>
              </button>

              <input
                type="text"
                readOnly={Boolean(filesB)}
                placeholder="点击左侧按钮选择本机目录 B..."
                value={folderNameB}
                onChange={(e) => {
                  setFolderNameB(e.target.value);
                  setFilesB(null);
                }}
                className="flex-1 h-[42px] px-3.5 rounded-xl text-xs font-mono bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:border-cyan-500 outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {/* Mode Selector & Flags */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          {/* Mode Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-[var(--text-secondary)] shrink-0">比对模式:</span>
            <div className="flex flex-wrap sm:flex-nowrap items-center p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] overflow-x-auto">
              <button
                type="button"
                onClick={() => setMode('prefix_strip')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                  mode === 'prefix_strip'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>按名字前缀比对 (默认推荐)</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('relative_path')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                  mode === 'relative_path'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                相对路径完全匹配
              </button>
              <button
                type="button"
                onClick={() => setMode('filename_only')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                  mode === 'filename_only'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                仅文件名匹配 (检测移动)
              </button>
            </div>
          </div>

          {/* Flags */}
          <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={compareSize}
                onChange={(e) => setCompareSize(e.target.checked)}
                className="rounded border-[var(--border-subtle)] bg-[var(--bg-input)] text-indigo-500 focus:ring-0"
              />
              <span>严格比对文件大小</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ignoreCase}
                onChange={(e) => setIgnoreCase(e.target.checked)}
                className="rounded border-[var(--border-subtle)] bg-[var(--bg-input)] text-indigo-500 focus:ring-0"
              />
              <span>忽略大小写</span>
            </label>
          </div>
        </div>

        {/* Prefix & Field Comparison Options (When in prefix_strip mode) */}
        {mode === 'prefix_strip' && (
          <div className="p-4 rounded-xl bg-[var(--bg-input)]/70 border border-[var(--border-subtle)] space-y-3.5 animate-in fade-in duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-cyan-accent" />
                <span>前缀与分段比对字段配置</span>
              </span>
              <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useFieldMatching}
                  onChange={(e) => setUseFieldMatching(e.target.checked)}
                  className="rounded border-[var(--border-subtle)] bg-[var(--bg-input)] text-indigo-500 focus:ring-0"
                />
                <span>按指定分段字段进行比对 (如仅比对第1段+第2段)</span>
              </label>
            </div>

            {/* If Segment Field Matching Enabled */}
            {useFieldMatching ? (
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-secondary)]">字段分隔符:</span>
                  <input
                    type="text"
                    value={delimiter}
                    onChange={(e) => setDelimiter(e.target.value)}
                    className="w-14 h-8 text-center px-2 rounded-lg text-xs font-mono font-bold bg-[var(--bg-surface)] text-cyan-accent border border-[var(--border-subtle)] outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-secondary)]">选择参与比对的字段:</span>
                  {[
                    { idx: 0, label: '第 1 段 (前缀/类型)' },
                    { idx: 1, label: '第 2 段 (年份/分类)' },
                    { idx: 2, label: '第 3 段 (序号/编码)' },
                    { idx: 3, label: '第 4 段' },
                  ].map((field) => {
                    const isSelected = compareFields.includes(field.idx);
                    return (
                      <button
                        key={field.idx}
                        type="button"
                        onClick={() => toggleField(field.idx)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
                        }`}
                      >
                        {field.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Prefix Strip Input */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    目录 A 指定待剥离前缀 (可选，例如: PROD_ 或 DOC_)
                  </label>
                  <input
                    type="text"
                    placeholder="留空时自动比对共同前缀主体..."
                    value={prefixA}
                    onChange={(e) => setPrefixA(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg text-xs font-mono bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    目录 B 指定待剥离前缀 (可选，例如: TEST_ 或 OLD_)
                  </label>
                  <input
                    type="text"
                    placeholder="留空时自动比对共同前缀主体..."
                    value={prefixB}
                    onChange={(e) => setPrefixB(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg text-xs font-mono bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            disabled={loading}
            onClick={triggerCompare}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white shadow-lg shadow-indigo-500/20 disabled:opacity-50 transition-all"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>正在执行差异比对...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>开始双目录比对</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Comparison Summary KPI Cards */}
      {compareResult && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 shadow-lg">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold mb-1">
              <span>独立项总数</span>
              <FileCheck2 className="w-3.5 h-3.5 text-brand-accent" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
              {compareResult.summary.total_unique_items.toLocaleString()}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1 font-mono">
              A: {compareResult.summary.dir_a_total_files} 项 | B: {compareResult.summary.dir_b_total_files} 项
            </div>
          </div>

          <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 shadow-lg">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold mb-1">
              <span>完全匹配数</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-accent" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-accent">
              {compareResult.summary.count_exact_match.toLocaleString()}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1 font-mono">
              匹配率: {compareResult.summary.match_percentage}%
            </div>
          </div>

          <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 shadow-lg">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold mb-1">
              <span>仅在 A 存在</span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-amber-accent">
              {compareResult.summary.count_only_in_a.toLocaleString()}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1 font-mono truncate">
              空间: {compareResult.summary.dir_a_total_size_formatted}
            </div>
          </div>

          <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 shadow-lg">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold mb-1">
              <span>仅在 B 存在</span>
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-rose-accent">
              {compareResult.summary.count_only_in_b.toLocaleString()}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1 font-mono truncate">
              空间: {compareResult.summary.dir_b_total_size_formatted}
            </div>
          </div>

          <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 shadow-lg col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold mb-1">
              <span>比对耗时</span>
              <Clock className="w-3.5 h-3.5 text-cyan-accent" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-cyan-accent">
              {compareResult.summary.scan_time_ms} ms
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1 font-mono">
              前端零上传极速比对
            </div>
          </div>
        </div>
      )}

      {/* Diff Table */}
      {compareResult && (
        <DiffTable
          diffItems={compareResult.diff_items}
          summary={compareResult.summary}
        />
      )}
    </div>
  );
}
