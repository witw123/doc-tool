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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import ExcelJS from 'exceljs';

interface PrefixTableProps {
  prefixStats: PrefixStatItem[];
}

type SortField = 'count' | 'size' | 'prefix' | 'folders' | 'percentage';
type SortOrder = 'asc' | 'desc';

type SubSortField = 'index' | 'folder_name' | 'filename' | 'rel_path' | 'size_bytes' | 'ext';

export function PrefixTable({ prefixStats }: PrefixTableProps) {
  // Sorting state for main prefix groups
  const [sortField, setSortField] = useState<SortField>('count');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Sub-table sorting state
  const [subSortField, setSubSortField] = useState<SubSortField>('index');
  const [subSortOrder, setSubSortOrder] = useState<SortOrder>('asc');

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

  // Handle header click sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'prefix' ? 'asc' : 'desc');
    }
  };

  // Handle sub-table sort
  const handleSubSort = (field: SubSortField) => {
    if (subSortField === field) {
      setSubSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSubSortField(field);
      setSubSortOrder(field === 'size_bytes' ? 'desc' : 'asc');
    }
  };

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

  // Sorted list of prefix items
  const sortedItems = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'count':
          cmp = a.match_count - b.match_count;
          break;
        case 'size':
          cmp = a.total_size_bytes - b.total_size_bytes;
          break;
        case 'prefix':
          cmp = a.prefix.localeCompare(b.prefix, 'zh-CN');
          break;
        case 'folders': {
          const fA = a.folders?.length ?? (a.files ? new Set(a.files.map((f) => f.folder_name)).size : 0);
          const fB = b.folders?.length ?? (b.files ? new Set(b.files.map((f) => f.folder_name)).size : 0);
          cmp = fA - fB;
          break;
        }
        case 'percentage':
          cmp = a.percentage - b.percentage;
          break;
        default:
          cmp = a.match_count - b.match_count;
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });
    return list;
  }, [filtered, sortField, sortOrder]);

  // Compute total unique folders across all items
  const totalFoldersCount = useMemo(() => {
    const set = new Set<string>();
    for (const p of prefixStats) {
      (p.folders || []).forEach((f) => set.add(f));
      (p.files || []).forEach((f) => set.add(f.folder_name));
    }
    return set.size;
  }, [prefixStats]);

  // Export grouped Excel
  const exportGroupedExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FileScope';
    workbook.created = new Date();

    // Summary Sheet
    const summarySheet = workbook.addWorksheet('前缀统计汇总');
    summarySheet.views = [{ state: 'frozen', ySplit: 1 }];

    const summaryHeaders = ['前缀标签', '涉及文件夹数', '涉及文件夹列表', '文件数量', '数量占比(%)', '总大小(字节)', '格式化大小', '格式分布'];
    const headerRow = summarySheet.addRow(summaryHeaders);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    for (const p of sortedItems) {
      const folders = p.folders || [];
      summarySheet.addRow([
        p.prefix,
        folders.length,
        folders.join('; ') || '-',
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

    for (const p of sortedItems) {
      const fileList: PrefixFileItem[] = p.files && p.files.length > 0
        ? p.files
        : (p.sample_files || []).map((s) => {
            const parts = s.split('/');
            return {
              filename: parts[parts.length - 1] || s,
              folder_name: parts.length > 1 ? parts.slice(0, -1).join('/') : '(根目录)',
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

  const isAllExpanded = expandedPrefixes.size === sortedItems.length && sortedItems.length > 0;

  // Helper icon for main table sortable headers
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)] opacity-60 group-hover:opacity-100 transition-opacity" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-cyan-accent" />
    ) : (
      <ArrowDown className="w-3 h-3 text-cyan-accent" />
    );
  };

  // Helper icon for sub-table sortable headers
  const renderSubSortIcon = (field: SubSortField) => {
    if (subSortField !== field) {
      return <ArrowUpDown className="w-2.5 h-2.5 text-[var(--text-muted)] opacity-50 hover:opacity-100" />;
    }
    return subSortOrder === 'asc' ? (
      <ArrowUp className="w-2.5 h-2.5 text-cyan-accent" />
    ) : (
      <ArrowDown className="w-2.5 h-2.5 text-cyan-accent" />
    );
  };

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
                (涉及 {totalFoldersCount} 个文件夹 · {sortedItems.length} 个前缀组)
              </span>
            </h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              相同前缀的文件严格汇聚在一起，支持按文件数、空间占用、前缀名、文件夹数等多维排序
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Sort Selector */}
          <div className="flex items-center gap-1.5 bg-[var(--bg-input)] px-2.5 py-1 rounded-lg border border-[var(--border-subtle)]">
            <ArrowUpDown className="w-3.5 h-3.5 text-cyan-accent" />
            <span className="text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">排序:</span>
            <select
              value={`${sortField}-${sortOrder}`}
              onChange={(e) => {
                const [f, o] = e.target.value.split('-') as [SortField, SortOrder];
                setSortField(f);
                setSortOrder(o);
              }}
              className="h-6 pl-1 pr-2 rounded text-xs bg-transparent text-[var(--text-primary)] font-semibold outline-none cursor-pointer"
            >
              <option value="count-desc">文件数量 (从多到少)</option>
              <option value="count-asc">文件数量 (从少到多)</option>
              <option value="size-desc">占用空间 (从大到小)</option>
              <option value="size-asc">占用空间 (从小到大)</option>
              <option value="prefix-asc">前缀名称 (A → Z / 升序)</option>
              <option value="prefix-desc">前缀名称 (Z → A / 降序)</option>
              <option value="folders-desc">涉及文件夹数 (从多到少)</option>
              <option value="folders-asc">涉及文件夹数 (从少到多)</option>
              <option value="percentage-desc">文件数占比 (从高到低)</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索前缀 / 文件夹 / 文件名..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 pr-3 rounded-lg text-xs bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:border-indigo-500 outline-none w-52 sm:w-60"
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
        <table className="min-w-[940px] w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold select-none">
              <th className="py-3 px-3 w-10 text-center whitespace-nowrap">#</th>

              {/* Prefix Label Sortable */}
              <th
                onClick={() => handleSort('prefix')}
                className="py-3 px-4 min-w-[170px] whitespace-nowrap cursor-pointer hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]/60 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <span>前缀名称 / 分组标签</span>
                  {renderSortIcon('prefix')}
                </div>
              </th>

              {/* Folders Count Sortable */}
              <th
                onClick={() => handleSort('folders')}
                className="py-3 px-4 min-w-[220px] whitespace-nowrap cursor-pointer hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]/60 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <span>涉及文件夹及数目</span>
                  {renderSortIcon('folders')}
                </div>
              </th>

              {/* File Count Sortable */}
              <th
                onClick={() => handleSort('count')}
                className="py-3 px-4 text-right w-32 whitespace-nowrap cursor-pointer hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]/60 transition-colors group"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>归类文件数</span>
                  {renderSortIcon('count')}
                </div>
              </th>

              {/* Percentage Sortable */}
              <th
                onClick={() => handleSort('percentage')}
                className="py-3 px-4 w-36 whitespace-nowrap cursor-pointer hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]/60 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <span>文件数占比</span>
                  {renderSortIcon('percentage')}
                </div>
              </th>

              {/* Total Size Sortable */}
              <th
                onClick={() => handleSort('size')}
                className="py-3 px-4 text-right w-28 whitespace-nowrap cursor-pointer hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]/60 transition-colors group"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>总占用空间</span>
                  {renderSortIcon('size')}
                </div>
              </th>

              <th className="py-3 px-4 min-w-[160px] whitespace-nowrap">主要格式</th>
              <th className="py-3 px-3 w-14 text-center whitespace-nowrap">明细</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {sortedItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-[var(--text-muted)]">
                  暂无匹配的前缀统计数据
                </td>
              </tr>
            ) : (
              sortedItems.map((item, idx) => {
                const isExpanded = expandedPrefixes.has(item.prefix);
                const isUnassigned =
                  item.prefix.includes('[无固定前缀]') ||
                  item.prefix.includes('[其他/未匹配]');

                const rawFileList: PrefixFileItem[] =
                  item.files && item.files.length > 0
                    ? item.files
                    : (item.sample_files || []).map((s) => {
                        const parts = s.split('/');
                        return {
                          filename: parts[parts.length - 1] || s,
                          folder_name: parts.length > 1 ? parts.slice(0, -1).join('/') : '(根目录)',
                          rel_path: s,
                          size_bytes: 0,
                          size_formatted: '-',
                          ext: s.includes('.') ? `.${s.split('.').pop()}` : '-',
                        };
                      });

                // Apply sub-table sorting
                const fileList = [...rawFileList].sort((a, b) => {
                  let cmp = 0;
                  switch (subSortField) {
                    case 'filename':
                      cmp = a.filename.localeCompare(b.filename, 'zh-CN');
                      break;
                    case 'folder_name':
                      cmp = a.folder_name.localeCompare(b.folder_name, 'zh-CN');
                      break;
                    case 'rel_path':
                      cmp = a.rel_path.localeCompare(b.rel_path, 'zh-CN');
                      break;
                    case 'size_bytes':
                      cmp = a.size_bytes - b.size_bytes;
                      break;
                    case 'ext':
                      cmp = a.ext.localeCompare(b.ext);
                      break;
                    default:
                      cmp = 0;
                  }
                  return subSortOrder === 'desc' ? -cmp : cmp;
                });

                const foldersList = item.folders && item.folders.length > 0
                  ? item.folders
                  : Array.from(new Set(fileList.map((f) => f.folder_name)));

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
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 whitespace-nowrap">
                            共 {foldersList.length} 个文件夹
                          </span>
                          {foldersList.slice(0, 3).map((folderName, fIdx) => (
                            <span
                              key={fIdx}
                              className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border-subtle)] whitespace-nowrap inline-flex items-center gap-1"
                              title={folderName}
                            >
                              <Folder className="w-2.5 h-2.5 text-indigo-400 shrink-0" />
                              <span className="truncate max-w-[130px]">{folderName}</span>
                            </span>
                          ))}
                          {foldersList.length > 3 && (
                            <span className="text-[10px] text-[var(--text-muted)] font-mono whitespace-nowrap">
                              +{foldersList.length - 3} 个
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
                                  「{item.prefix}」前缀下的全部归类文件 ({fileList.length} 个文件 · 跨 {foldersList.length} 个文件夹):
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[11px] font-mono text-[var(--text-muted)]">
                                <span>点击子表表头可对文件进行排序</span>
                                <span>总空间: {item.size_formatted}</span>
                              </div>
                            </div>

                            {/* Files Sub-table */}
                            <div className="max-h-[360px] overflow-y-auto rounded-lg border border-[var(--border-subtle)]">
                              <table className="w-full text-left text-[11px] border-collapse">
                                <thead>
                                  <tr className="bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold sticky top-0 z-10 select-none">
                                    <th className="py-2 px-2.5 w-10 text-center">#</th>
                                    <th
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSubSort('folder_name');
                                      }}
                                      className="py-2 px-3 font-mono min-w-[140px] cursor-pointer hover:text-[var(--text-primary)]"
                                    >
                                      <div className="flex items-center gap-1">
                                        <span>对应文件夹</span>
                                        {renderSubSortIcon('folder_name')}
                                      </div>
                                    </th>
                                    <th
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSubSort('filename');
                                      }}
                                      className="py-2 px-3 font-mono min-w-[180px] cursor-pointer hover:text-[var(--text-primary)]"
                                    >
                                      <div className="flex items-center gap-1">
                                        <span>文件名</span>
                                        {renderSubSortIcon('filename')}
                                      </div>
                                    </th>
                                    <th
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSubSort('rel_path');
                                      }}
                                      className="py-2 px-3 font-mono min-w-[200px] cursor-pointer hover:text-[var(--text-primary)]"
                                    >
                                      <div className="flex items-center gap-1">
                                        <span>所在相对路径</span>
                                        {renderSubSortIcon('rel_path')}
                                      </div>
                                    </th>
                                    <th
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSubSort('size_bytes');
                                      }}
                                      className="py-2 px-3 text-right w-24 cursor-pointer hover:text-[var(--text-primary)]"
                                    >
                                      <div className="flex items-center justify-end gap-1">
                                        <span>文件大小</span>
                                        {renderSubSortIcon('size_bytes')}
                                      </div>
                                    </th>
                                    <th
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSubSort('ext');
                                      }}
                                      className="py-2 px-3 w-16 text-center cursor-pointer hover:text-[var(--text-primary)]"
                                    >
                                      <div className="flex items-center justify-center gap-1">
                                        <span>格式</span>
                                        {renderSubSortIcon('ext')}
                                      </div>
                                    </th>
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
