'use client';

import React, { useState, useMemo } from 'react';
import { PrefixStatItem, PrefixFileItem } from '@doc-tool/shared';
import {
  Sparkles,
  Download,
  ChevronRight,
  ChevronDown,
  Search,
  FileSpreadsheet,
  Layers,
  FileText,
  ChevronsUpDown,
  Folder,
} from 'lucide-react';
import ExcelJS from 'exceljs';

interface PrefixTableProps {
  prefixStats: PrefixStatItem[];
}

export function PrefixTable({ prefixStats }: PrefixTableProps) {
  // Set of expanded prefix keys
  const [expandedPrefixes, setExpandedPrefixes] = useState<Set<string>>(() => {
    // Default expand all if 5 or fewer prefixes, or the first one
    const initial = new Set<string>();
    if (prefixStats.length <= 5) {
      prefixStats.forEach((p) => initial.add(p.prefix));
    } else if (prefixStats.length > 0) {
      initial.add(prefixStats[0].prefix);
    }
    return initial;
  });

  const [search, setSearch] = useState('');

  // Toggle single prefix
  const toggleExpand = (pfx: string) => {
    setExpandedPrefixes((prev) => {
      const next = new Set(prev);
      if (next.has(pfx)) {
        next.delete(pfx);
      } else {
        next.add(pfx);
      }
      return next;
    });
  };

  // Expand / Collapse all
  const handleToggleAll = () => {
    if (expandedPrefixes.size === prefixStats.length) {
      setExpandedPrefixes(new Set());
    } else {
      setExpandedPrefixes(new Set(prefixStats.map((p) => p.prefix)));
    }
  };

  // Filter prefixes and files
  const filtered = useMemo(() => {
    return prefixStats.filter((p) => {
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      const matchPrefix = p.prefix.toLowerCase().includes(s);
      const matchFolder = (p.folders || []).some((f) => f.toLowerCase().includes(s));
      const matchFile = (p.files || []).some(
        (f) =>
          f.filename.toLowerCase().includes(s) ||
          f.rel_path.toLowerCase().includes(s) ||
          f.folder_name.toLowerCase().includes(s)
      );
      return matchPrefix || matchFolder || matchFile;
    });
  }, [prefixStats, search]);

  // Export grouped Excel
  const exportGroupedExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FileScope';
    workbook.created = new Date();

    // Summary Sheet
    const summarySheet = workbook.addWorksheet('前缀统计汇总');
    summarySheet.views = [{ state: 'frozen', ySplit: 1 }];

    const summaryHeaders = ['前缀标签', '涉及文件夹', '文件数量', '数量占比(%)', '总大小(字节)', '格式化大小', '格式分布'];
    const headerRow = summarySheet.addRow(summaryHeaders);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    for (const p of prefixStats) {
      summarySheet.addRow([
        p.prefix,
        (p.folders || []).join(', ') || '-',
        p.match_count,
        `${p.percentage}%`,
        p.total_size_bytes,
        p.size_formatted,
        Object.entries(p.extensions)
          .map(([k, v]) => `${k}:${v}`)
          .join('; '),
      ]);
    }

    summarySheet.columns.forEach((col) => {
      col.width = 22;
    });

    // Detail Sheet (Grouped by Prefix)
    const detailSheet = workbook.addWorksheet('按前缀分组明细');
    detailSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const detailHeaders = ['归属前缀', '序号', '所属文件夹', '文件名', '所在相对路径', '大小', '格式'];
    const detailHeaderRow = detailSheet.addRow(detailHeaders);
    detailHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    detailHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2F5597' },
    };
    detailHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' };

    for (const p of prefixStats) {
      const fileList: PrefixFileItem[] = p.files && p.files.length > 0
        ? p.files
        : (p.sample_files || []).map((s) => {
            const parts = s.split('/');
            return {
              filename: parts[parts.length - 1] || s,
              folder_name: parts.length > 1 ? parts[parts.length - 2]! : '(根目录)',
              rel_path: s,
              size_bytes: 0,
              size_formatted: '-',
              ext: s.includes('.') ? `.${s.split('.').pop()}` : '-',
            };
          });

      fileList.forEach((f, idx) => {
        detailSheet.addRow([
          p.prefix,
          idx + 1,
          f.folder_name,
          f.filename,
          f.rel_path,
          f.size_formatted,
          f.ext,
        ]);
      });
    }

    detailSheet.columns.forEach((col) => {
      col.width = 24;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prefix_grouped_stats_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isAllExpanded = expandedPrefixes.size === prefixStats.length && prefixStats.length > 0;

  return (
    <div className="glass-panel overflow-hidden space-y-0">
      {/* Header & Controls Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-cyan-accent" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
              <span>按前缀归并统计</span>
              <span className="text-xs font-normal text-[var(--text-secondary)]">
                ({filtered.length} 个前缀组)
              </span>
            </h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              相同前缀的文件严格汇聚在一起，清晰显示文件归属的文件夹与完整路径
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索前缀 / 文件夹 / 文件名..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 pr-3 rounded-lg text-xs bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:border-indigo-500 outline-none w-56 sm:w-64"
            />
          </div>

          {/* Toggle All Expand/Collapse */}
          <button
            type="button"
            onClick={handleToggleAll}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] transition-colors"
          >
            <ChevronsUpDown className="w-3.5 h-3.5" />
            <span>{isAllExpanded ? '全部收起' : '全部展开'}</span>
          </button>

          {/* Export Grouped Excel */}
          <button
            type="button"
            onClick={exportGroupedExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>导出前缀分组 Excel</span>
          </button>
        </div>
      </div>

      {/* Table & Grouped Files View */}
      <div className="overflow-x-auto">
        <table className="min-w-[920px] w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold">
              <th className="py-3 px-3 w-10 text-center whitespace-nowrap">#</th>
              <th className="py-3 px-4 min-w-[180px] whitespace-nowrap">前缀名称 / 分组标签</th>
              <th className="py-3 px-4 min-w-[180px] whitespace-nowrap">涉及文件夹</th>
              <th className="py-3 px-4 text-right w-28 whitespace-nowrap">归类文件数</th>
              <th className="py-3 px-4 w-36 whitespace-nowrap">文件数占比</th>
              <th className="py-3 px-4 text-right w-24 whitespace-nowrap">总占用空间</th>
              <th className="py-3 px-4 min-w-[160px] whitespace-nowrap">主要格式</th>
              <th className="py-3 px-3 w-14 text-center whitespace-nowrap">明细</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-[var(--text-muted)]">
                  暂无匹配的前缀统计数据
                </td>
              </tr>
            ) : (
              filtered.map((item, idx) => {
                const isExpanded = expandedPrefixes.has(item.prefix);
                const isUnassigned =
                  item.prefix.includes('[无固定前缀]') ||
                  item.prefix.includes('[其他/未匹配]');

                const fileList: PrefixFileItem[] =
                  item.files && item.files.length > 0
                    ? item.files
                    : (item.sample_files || []).map((s) => {
                        const parts = s.split('/');
                        return {
                          filename: parts[parts.length - 1] || s,
                          folder_name: parts.length > 1 ? parts[parts.length - 2]! : '(根目录)',
                          rel_path: s,
                          size_bytes: 0,
                          size_formatted: '-',
                          ext: s.includes('.') ? `.${s.split('.').pop()}` : '-',
                        };
                      });

                const foldersList = item.folders || Array.from(new Set(fileList.map((f) => f.folder_name)));

                return (
                  <React.Fragment key={`${item.prefix}-${idx}`}>
                    {/* Prefix Summary Row */}
                    <tr
                      onClick={() => toggleExpand(item.prefix)}
                      className={`hover:bg-[var(--bg-surface-hover)]/70 cursor-pointer transition-colors ${
                        isExpanded ? 'bg-indigo-950/20' : ''
                      }`}
                    >
                      <td className="py-3 px-3 text-center font-mono text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono font-bold px-2.5 py-0.5 rounded-lg text-xs border whitespace-nowrap inline-flex items-center gap-1.5 shrink-0 ${
                              isUnassigned
                                ? 'bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border-[var(--border-subtle)]'
                                : 'tag-badge shadow-sm'
                            }`}
                          >
                            <Sparkles className="w-3 h-3 text-indigo-400" />
                            <span>{item.prefix}</span>
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1">
                          {foldersList.slice(0, 3).map((folderName, fIdx) => (
                            <span
                              key={fIdx}
                              className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 whitespace-nowrap inline-flex items-center gap-1"
                            >
                              <Folder className="w-2.5 h-2.5 text-indigo-400 shrink-0" />
                              <span className="truncate max-w-[120px]">{folderName}</span>
                            </span>
                          ))}
                          {foldersList.length > 3 && (
                            <span className="text-[10px] text-[var(--text-muted)] font-mono whitespace-nowrap">
                              +{foldersList.length - 3} 个文件夹
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-[var(--text-primary)] whitespace-nowrap">
                        {item.match_count.toLocaleString()} 个
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-[var(--bg-input)] overflow-hidden border border-[var(--border-subtle)] min-w-[50px]">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all duration-300"
                              style={{ width: `${Math.min(item.percentage, 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] text-[var(--text-secondary)] w-11 text-right shrink-0">
                            {item.percentage}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[var(--text-secondary)] whitespace-nowrap font-semibold">
                        {item.size_formatted}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1">
                          {Object.entries(item.extensions)
                            .slice(0, 3)
                            .map(([ext, count]) => (
                              <span
                                key={ext}
                                className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-subtle)] whitespace-nowrap"
                              >
                                {ext} ({count})
                              </span>
                            ))}
                          {Object.keys(item.extensions).length > 3 && (
                            <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">
                              +{Object.keys(item.extensions).length - 3} 种
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center text-[var(--text-muted)] whitespace-nowrap">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 mx-auto text-brand-accent transition-transform" />
                        ) : (
                          <ChevronRight className="w-4 h-4 mx-auto transition-transform" />
                        )}
                      </td>
                    </tr>

                    {/* Grouped Files Accordion Sub-Table */}
                    {isExpanded && (
                      <tr className="bg-[var(--bg-input)]/90 border-b border-[var(--border-subtle)] animate-in fade-in duration-150">
                        <td colSpan={8} className="p-3 sm:p-4 pl-8 sm:pl-12">
                          <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3.5 space-y-2.5 shadow-inner">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
                              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                                <FileText className="w-3.5 h-3.5 text-cyan-accent" />
                                <span>
                                  「{item.prefix}」前缀下的全部归类文件 ({fileList.length} 个):
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[11px] font-mono text-[var(--text-muted)]">
                                <span>跨 {foldersList.length} 个文件夹</span>
                                <span>总空间: {item.size_formatted}</span>
                              </div>
                            </div>

                            {/* Files Sub-table */}
                            <div className="max-h-[360px] overflow-y-auto rounded-lg border border-[var(--border-subtle)]">
                              <table className="w-full text-left text-[11px] border-collapse">
                                <thead>
                                  <tr className="bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold sticky top-0 z-10">
                                    <th className="py-2 px-2.5 w-10 text-center">#</th>
                                    <th className="py-2 px-3 font-mono min-w-[140px]">对应文件夹</th>
                                    <th className="py-2 px-3 font-mono min-w-[180px]">文件名</th>
                                    <th className="py-2 px-3 font-mono min-w-[200px]">所在相对路径</th>
                                    <th className="py-2 px-3 text-right w-24">文件大小</th>
                                    <th className="py-2 px-3 w-16 text-center">格式</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-subtle)]">
                                  {fileList.map((file, fileIdx) => (
                                    <tr
                                      key={fileIdx}
                                      className="hover:bg-[var(--bg-surface-hover)]/70 transition-colors font-mono"
                                    >
                                      <td className="py-1.5 px-2.5 text-center text-[var(--text-muted)]">
                                        {fileIdx + 1}
                                      </td>
                                      <td className="py-1.5 px-3 text-indigo-300 whitespace-nowrap">
                                        <span className="inline-flex items-center gap-1 font-semibold">
                                          <Folder className="w-3 h-3 text-indigo-400 shrink-0" />
                                          <span>{file.folder_name}</span>
                                        </span>
                                      </td>
                                      <td className="py-1.5 px-3 font-bold text-cyan-accent break-all">
                                        {file.filename}
                                      </td>
                                      <td className="py-1.5 px-3 text-[var(--text-secondary)] break-all">
                                        {file.rel_path}
                                      </td>
                                      <td className="py-1.5 px-3 text-right text-[var(--text-muted)] whitespace-nowrap">
                                        {file.size_formatted}
                                      </td>
                                      <td className="py-1.5 px-3 text-center whitespace-nowrap">
                                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                                          {file.ext}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
