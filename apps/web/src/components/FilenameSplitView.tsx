'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  FolderOpen,
  FileSpreadsheet,
  Download,
  Eye,
  Plus,
  Trash2,
  Search,
  Check,
  Sparkles,
  Layers,
  FileText,
  RotateCw,
  Zap,
  ArrowRight,
  Split,
} from 'lucide-react';
import {
  FilenamePreviewResponse,
  processLocalFilenameSplit,
  inferSegmentsFromSample,
  LocalScannedFile,
} from '@doc-tool/shared';
import { apiPreviewFilenameSplit, apiExportFilenameSplitXlsx } from '@/lib/api';
import { pickLocalFolder, scanDirectoryHandle } from '@/lib/local-folder-picker';
import { exportLocalSplitExcel } from '@/lib/excel-export';
import { useToast } from './Toast';

const DEFAULT_SAMPLE = '10kV范西292线宏伟支线_右横担_柱瓶-绝缘子破损';

interface FilenameSplitViewProps {
  initialPath?: string;
}

export function FilenameSplitView({ initialPath = '' }: FilenameSplitViewProps) {
  const { showToast } = useToast();

  // Folder & Files State
  const [path, setPath] = useState(initialPath);
  const [folderDisplayName, setFolderDisplayName] = useState(initialPath || '');
  const [localFiles, setLocalFiles] = useState<LocalScannedFile[] | null>(null);
  const [dirHandle, setDirHandle] = useState<any>(null);

  // Sample format input (用户发/输入的成品命名格式)
  const [sampleInput, setSampleInput] = useState(DEFAULT_SAMPLE);

  // Auto-inferred pattern & columns
  const [pattern, setPattern] = useState('');
  const [columns, setColumns] = useState<string[]>([]);
  const [segments, setSegments] = useState<{ id: string; sampleValue: string; columnName: string }[]>([]);

  // Excel Layout
  const [layout, setLayout] = useState<'grouped_sheets' | 'single_sheet'>('grouped_sheets');

  // Preview & Export State
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewResult, setPreviewResult] = useState<FilenamePreviewResponse | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Automatically parse sample whenever sampleInput changes
  useEffect(() => {
    if (!sampleInput.trim()) return;
    const inferred = inferSegmentsFromSample(sampleInput.trim());
    setPattern(inferred.pattern);
    setColumns(inferred.columns);
    setSegments(inferred.segments);
  }, [sampleInput]);

  // Pick Native Folder
  const handlePickFolder = async () => {
    try {
      setLoading(true);
      const res = await pickLocalFolder();
      setFolderDisplayName(res.folderName);
      setPath(res.folderName);
      setLocalFiles(res.files);
      setDirHandle(res.handle || null);

      showToast(`已选择文件夹「${res.folderName}」，共计 ${res.files.length} 个文件`, 'success');

      // If user has not changed sample or if files are present, automatically adopt the 1st file as sample
      if (res.files.length > 0) {
        const firstFile = res.files[0]!.filename;
        setSampleInput(firstFile);
        const inferred = inferSegmentsFromSample(firstFile);
        try {
          const preview = processLocalFilenameSplit(
            res.folderName,
            res.files,
            inferred.pattern,
            inferred.columns
          );
          setPreviewResult(preview);
        } catch {
          // ignore
        }
      }
    } catch (err: any) {
      if (err.message !== '用户取消了文件夹选择') {
        showToast(`选择文件夹失败: ${err.message}`, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Refresh Folder from Disk
  const handleRefreshFolder = async () => {
    if (!dirHandle) {
      handlePickFolder();
      return;
    }
    setLoading(true);
    try {
      const freshFiles = await scanDirectoryHandle(dirHandle);
      setLocalFiles(freshFiles);
      showToast(`已刷新读取最新文件：共 ${freshFiles.length} 个文件`, 'success');
      if (freshFiles.length > 0) {
        const preview = processLocalFilenameSplit(
          folderDisplayName || '选择的文件夹',
          freshFiles,
          pattern,
          columns
        );
        setPreviewResult(preview);
      }
    } catch (err: any) {
      showToast(`刷新失败: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Update a column's name
  const handleUpdateColumnName = (index: number, newName: string) => {
    setColumns((prev) => {
      const next = [...prev];
      next[index] = newName;
      return next;
    });
    setSegments((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], columnName: newName };
      }
      return next;
    });
  };

  // Execute Preview
  const handlePreview = async () => {
    if (!pattern.trim()) {
      showToast('请输入成品命名格式样例', 'warning');
      return;
    }

    if (localFiles && localFiles.length > 0) {
      let currentFiles = localFiles;
      if (dirHandle) {
        try {
          currentFiles = await scanDirectoryHandle(dirHandle);
          setLocalFiles(currentFiles);
        } catch {
          // ignore
        }
      }

      setLoading(true);
      try {
        const res = processLocalFilenameSplit(
          folderDisplayName || '选择的文件夹',
          currentFiles,
          pattern,
          columns
        );
        setPreviewResult(res);
        showToast(`解析完成：共 ${res.file_count} 个文件`, 'success');
      } catch (err: any) {
        showToast(`解析失败: ${err.message}`, 'error');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!path.trim()) {
      showToast('请先选择或输入目标文件夹路径', 'warning');
      return;
    }

    setLoading(true);
    try {
      const res = await apiPreviewFilenameSplit({
        path: path.trim(),
        pattern,
        columns,
      });
      setPreviewResult(res);
      showToast(`解析完成：共检索到 ${res.file_count} 个文件`, 'success');
    } catch (err: any) {
      showToast(`解析失败: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Export Excel
  const handleExport = async () => {
    if (!pattern.trim()) {
      showToast('请输入成品命名格式样例', 'warning');
      return;
    }

    setExporting(true);
    try {
      if (localFiles && localFiles.length > 0) {
        let currentFiles = localFiles;
        if (dirHandle) {
          try {
            currentFiles = await scanDirectoryHandle(dirHandle);
            setLocalFiles(currentFiles);
          } catch {
            // ignore
          }
        }

        const preview = processLocalFilenameSplit(
          folderDisplayName || '选择的文件夹',
          currentFiles,
          pattern,
          columns
        );
        const { blob, filename } = await exportLocalSplitExcel(
          preview.headers,
          preview.rows,
          layout
        );

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        showToast(`Excel 导出成功：共 ${preview.file_count} 条记录`, 'success');
      } else {
        if (!path.trim()) {
          showToast('请先选择或输入目标文件夹路径', 'warning');
          return;
        }

        const res = await apiExportFilenameSplitXlsx({
          path: path.trim(),
          pattern,
          columns,
          layout,
        });

        const url = URL.createObjectURL(res.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.filename || `filename_split_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Excel 导出成功！', 'success');
      }
    } catch (err: any) {
      showToast(`导出失败: ${err.message}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  // Filtered rows for preview table
  const filteredRows = useMemo(() => {
    if (!previewResult?.rows) return [];
    if (!searchFilter.trim()) return previewResult.rows;
    const s = searchFilter.toLowerCase();
    return previewResult.rows.filter((row) =>
      row.some((cell) => String(cell).toLowerCase().includes(s))
    );
  }, [previewResult, searchFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Main Unified Input Card */}
      <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 sm:p-6 shadow-xl space-y-5">
        {/* Step 1: Folder Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-brand-accent" />
              <span>选择待拆分的目标文件夹</span>
            </label>
            {localFiles && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-emerald-accent flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>已载入 {localFiles.length} 个文件</span>
                </span>
                {dirHandle && (
                  <button
                    type="button"
                    onClick={handleRefreshFolder}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 border border-indigo-500/20 transition-all"
                    title="从磁盘重新读取最新文件"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>刷新</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handlePickFolder}
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
                setDirHandle(null);
              }}
              className="flex-1 h-11 px-4 rounded-xl text-xs font-mono bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:border-indigo-500 outline-none transition-all"
            />
          </div>
        </div>

        {/* Step 2: Intelligent Sample Format Input (只发成品命名格式即可自动切分) */}
        <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-accent" />
              <span>输入成品命名示例 (系统将全自动识别并拆分成数据列)</span>
            </label>
            <span className="text-[11px] text-[var(--text-muted)]">
              自动识别电力巡检、图纸代号、日期归档等复合命名
            </span>
          </div>

          {/* Sample Format Input Box */}
          <div className="relative">
            <input
              type="text"
              value={sampleInput}
              onChange={(e) => setSampleInput(e.target.value)}
              placeholder="粘贴或输入一个成品文件名示例，如: 10kV范西292线宏伟支线_右横担_柱瓶-绝缘子破损"
              className="w-full h-11 px-4 text-xs font-mono font-bold bg-[var(--bg-input)] text-cyan-accent border border-[var(--border-subtle)] focus:border-cyan-500 rounded-xl outline-none shadow-inner"
            />
          </div>

          {/* Inferred Columns Display (直观卡片展示) */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold">
              <span className="flex items-center gap-1.5">
                <Split className="w-3.5 h-3.5 text-indigo-400" />
                <span>自动切分结果 (共 {segments.length} 个数据列，可直接修改列名):</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {segments.map((seg, idx) => (
                <div
                  key={seg.id || idx}
                  className="flex items-center gap-1.5 p-2 rounded-xl bg-[var(--bg-input)] border border-cyan-500/30 shadow-sm"
                >
                  <div className="flex flex-col">
                    <span className="text-[10px] text-cyan-400 font-mono font-bold">
                      提取值: {seg.sampleValue || '(空)'}
                    </span>
                    <input
                      type="text"
                      value={columns[idx] || seg.columnName}
                      onChange={(e) => handleUpdateColumnName(idx, e.target.value)}
                      className="text-xs font-bold bg-transparent text-[var(--text-primary)] border-b border-[var(--border-subtle)] focus:border-cyan-500 outline-none w-28 py-0.5"
                      title="点击修改此列标题"
                    />
                  </div>
                  {idx < segments.length - 1 && (
                    <ArrowRight className="w-3 h-3 text-[var(--text-muted)] ml-1" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Quick Excel Layout & Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">Excel 排版:</span>
              <div className="flex items-center p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setLayout('grouped_sheets')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    layout === 'grouped_sheets'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  按文件夹分 Sheet
                </button>
                <button
                  type="button"
                  onClick={() => setLayout('single_sheet')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    layout === 'single_sheet'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  汇总至单 Sheet
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={handlePreview}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[var(--bg-input)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-sm transition-all"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span>正在解析...</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 text-cyan-accent" />
                    <span>预览拆分数据</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={exporting}
                onClick={handleExport}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition-all"
              >
                {exporting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>正在导出 Excel...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>一键导出 Excel 表格</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Step 3: Data Preview Table */}
      {previewResult && (
        <div className="glass-panel overflow-hidden space-y-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/40">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center border border-emerald-500/30">
                3
              </span>
              <div>
                <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
                  <span>数据预览 ({filteredRows.length} / {previewResult.file_count} 项)</span>
                  {previewResult.unmatched_count > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      未匹配: {previewResult.unmatched_count} 项
                    </span>
                  )}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="搜索结果数据..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="h-8 pl-8 pr-3 rounded-lg text-xs bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:border-indigo-500 outline-none w-52"
                />
              </div>

              <button
                type="button"
                disabled={exporting}
                onClick={handleExport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>导出 Excel</span>
              </button>
            </div>
          </div>

          {/* Data Table */}
          <div className="overflow-x-auto max-h-[500px]">
            <table className="min-w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold sticky top-0 z-10 select-none">
                  <th className="py-3 px-3 w-10 text-center">#</th>
                  {previewResult.headers.map((header, hIdx) => (
                    <th key={hIdx} className="py-3 px-4 whitespace-nowrap">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={previewResult.headers.length + 1}
                      className="py-12 text-center text-[var(--text-muted)]"
                    >
                      未找到匹配的数据记录
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="hover:bg-[var(--bg-surface-hover)]/70 transition-colors"
                    >
                      <td className="py-2.5 px-3 text-center text-[11px] text-[var(--text-muted)]">
                        {rIdx + 1}
                      </td>
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className={`py-2.5 px-4 whitespace-nowrap ${
                            cIdx === 0
                              ? 'text-indigo-300 font-semibold'
                              : cIdx === 1
                              ? 'text-[var(--text-secondary)]'
                              : 'text-cyan-accent font-bold'
                          }`}
                        >
                          {cell || <span className="text-[var(--text-muted)] font-normal">-</span>}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
