'use client';

import React, { useState, useMemo } from 'react';
import { DiffItem, DiffStatus, CompareSummary } from '@doc-tool/shared';
import {
  GitCompare,
  Download,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  FolderOpen,
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface DiffTableProps {
  diffItems: DiffItem[];
  summary: CompareSummary;
}

const STATUS_FILTERS: { key: DiffStatus | 'ALL'; label: string; countKey?: keyof CompareSummary }[] = [
  { key: 'ALL', label: '全部项目' },
  { key: 'EXACT_MATCH', label: '完全匹配', countKey: 'count_exact_match' },
  { key: 'ONLY_IN_A', label: '仅在 A 目录', countKey: 'count_only_in_a' },
  { key: 'ONLY_IN_B', label: '仅在 B 目录', countKey: 'count_only_in_b' },
  { key: 'DIFFERENT_ATTR', label: '属性差异', countKey: 'count_different_attr' },
  { key: 'MOVED_PATH', label: '位置变动', countKey: 'count_moved' },
];

export function DiffTable({ diffItems, summary }: DiffTableProps) {
  const [selectedFilter, setSelectedFilter] = useState<DiffStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  // Filter items
  const filteredItems = useMemo(() => {
    return diffItems.filter((item) => {
      if (selectedFilter !== 'ALL' && item.status !== selectedFilter) {
        return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const matchName = item.filename.toLowerCase().includes(q);
        const matchA = item.rel_path_a?.toLowerCase().includes(q) || false;
        const matchB = item.rel_path_b?.toLowerCase().includes(q) || false;
        const matchReason = item.diff_reason?.toLowerCase().includes(q) || false;
        return matchName || matchA || matchB || matchReason;
      }
      return true;
    });
  }, [diffItems, selectedFilter, search]);

  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  const exportCSV = () => {
    const headers = [
      '文件名',
      '比对状态',
      '状态标签',
      '目录A相对路径',
      '目录B相对路径',
      '目录A大小',
      '目录B大小',
      '扩展名',
      '差异详情与判定原因',
    ];

    const rows = filteredItems.map((it) => [
      `"${it.filename}"`,
      `"${it.status}"`,
      `"${it.status_label}"`,
      `"${it.rel_path_a || ''}"`,
      `"${it.rel_path_b || ''}"`,
      `"${it.size_a_formatted || ''}"`,
      `"${it.size_b_formatted || ''}"`,
      `"${it.ext || ''}"`,
      `"${(it.diff_reason || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `directory_diff_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: DiffStatus, label: string) => {
    switch (status) {
      case 'EXACT_MATCH':
        return (
          <span className="status-badge badge-exact">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>{label}</span>
          </span>
        );
      case 'ONLY_IN_A':
        return (
          <span className="status-badge badge-only-a">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>{label}</span>
          </span>
        );
      case 'ONLY_IN_B':
        return (
          <span className="status-badge badge-only-b">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            <span>{label}</span>
          </span>
        );
      case 'DIFFERENT_ATTR':
        return (
          <span className="status-badge badge-diff">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span>{label}</span>
          </span>
        );
      case 'MOVED_PATH':
        return (
          <span className="status-badge bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <ArrowRightLeft className="w-3 h-3" />
            <span>{label}</span>
          </span>
        );
      default:
        return <span>{label}</span>;
    }
  };

  return (
    <div className="glass-panel overflow-hidden">
      {/* Top Filter Bar */}
      <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] space-y-4 bg-[var(--bg-surface-elevated)]/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <GitCompare className="w-4 h-4 text-brand-accent" />
            <h3 className="font-bold text-sm text-[var(--text-primary)]">
              双目录差异明细列表 ({filteredItems.length} / {diffItems.length} 项)
            </h3>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="搜索文件名、路径或原因..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full h-8 pl-8 pr-3 rounded-lg text-xs bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:border-indigo-500 outline-none"
              />
            </div>

            <button
              type="button"
              onClick={exportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] transition-colors shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>导出 CSV</span>
            </button>
          </div>
        </div>

        {/* Status Filter Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {STATUS_FILTERS.map((f) => {
            const isSelected = selectedFilter === f.key;
            let count = diffItems.length;
            if (f.countKey) {
              count = (summary[f.countKey] as number) || 0;
            }

            return (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setSelectedFilter(f.key);
                  setCurrentPage(1);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                    : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)]'
                }`}
              >
                <span>{f.label}</span>
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full ${
                    isSelected ? 'bg-indigo-800 text-indigo-100' : 'bg-[var(--bg-surface-elevated)] text-[var(--text-muted)]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
        <table className="min-w-[960px] w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold shadow-sm">
            <tr className="border-b border-[var(--border-subtle)]">
              <th className="py-3 px-3 w-12 text-center whitespace-nowrap">#</th>
              <th className="py-3 px-4 min-w-[160px] whitespace-nowrap">文件名</th>
              <th className="py-3 px-4 w-36 whitespace-nowrap">比对状态</th>
              <th className="py-3 px-4 min-w-[180px] whitespace-nowrap">目录 A 相对路径</th>
              <th className="py-3 px-4 min-w-[180px] whitespace-nowrap">目录 B 相对路径</th>
              <th className="py-3 px-4 text-right w-24 whitespace-nowrap">A 大小</th>
              <th className="py-3 px-4 text-right w-24 whitespace-nowrap">B 大小</th>
              <th className="py-3 px-4 min-w-[180px] whitespace-nowrap">差异判定原因</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {paginatedItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-14 text-center text-[var(--text-muted)]">
                  暂无匹配的比对差异项
                </td>
              </tr>
            ) : (
              paginatedItems.map((item, idx) => (
                <tr
                  key={`${item.id}-${idx}`}
                  className="hover:bg-[var(--bg-surface-hover)]/60 transition-colors"
                >
                  <td className="py-3 px-3 text-center font-mono text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                    {(currentPage - 1) * pageSize + idx + 1}
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-[var(--text-primary)] whitespace-nowrap">
                    {item.filename}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    {getStatusBadge(item.status, item.status_label)}
                  </td>
                  <td className="py-3 px-4">
                    {item.rel_path_a ? (
                      <span className="font-mono text-cyan-accent break-all">
                        {item.rel_path_a}
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {item.rel_path_b ? (
                      <span className="font-mono text-cyan-accent break-all">
                        {item.rel_path_b}
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-[var(--text-secondary)] whitespace-nowrap">
                    {item.size_a_formatted || '-'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-[var(--text-secondary)] whitespace-nowrap">
                    {item.size_b_formatted || '-'}
                  </td>
                  <td className="py-3 px-4 text-[var(--text-secondary)]">
                    {item.diff_reason}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination & Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/40 text-xs text-[var(--text-secondary)]">
        <div className="flex items-center gap-2">
          <span>每页显示:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="h-7 px-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-subtle)] outline-none"
          >
            {[25, 50, 100, 200].map((s) => (
              <option key={s} value={s}>
                {s} 条
              </option>
            ))}
          </select>
          <span className="text-[var(--text-muted)] font-mono ml-2">
            共 {filteredItems.length} 项
          </span>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="p-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono text-xs text-[var(--text-primary)] px-2">
            第 {currentPage} / {totalPages} 页
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="p-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-40 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
