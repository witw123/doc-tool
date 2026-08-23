'use client';

import React, { useState } from 'react';
import { LeafDirectoryItem } from '@doc-tool/shared';
import { FolderCheck, Download, Search, ChevronRight, ChevronDown, Layers } from 'lucide-react';

interface LeafDirectoryTableProps {
  leafDirectories: LeafDirectoryItem[];
  allDirectories?: LeafDirectoryItem[];
}

export function LeafDirectoryTable({
  leafDirectories,
  allDirectories = [],
}: LeafDirectoryTableProps) {
  const [viewMode, setViewMode] = useState<'leaf_only' | 'all'>('leaf_only');
  const [search, setSearch] = useState('');
  const [expandedDir, setExpandedDir] = useState<string | null>(null);

  const displayList = viewMode === 'leaf_only' ? leafDirectories : allDirectories;
  const filtered = displayList.filter((d) =>
    search ? d.rel_path.toLowerCase().includes(search.toLowerCase()) : true
  );

  const toggleExpand = (p: string) => {
    setExpandedDir(expandedDir === p ? null : p);
  };

  const exportCSV = () => {
    const headers = ['相对路径', '层级深度', '是否最深层目录', '文件数', '总空间(字节)', '总空间(格式化)', '文件格式分布'];
    const rows = displayList.map((d) => [
      `"${d.rel_path}"`,
      d.depth,
      d.is_leaf ? '是' : '否',
      d.file_count,
      d.total_size_bytes,
      `"${d.size_formatted}"`,
      `"${Object.entries(d.extensions)
        .map(([k, v]) => `${k}:${v}`)
        .join('; ')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leaf_directories_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass-panel overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/40">
        <div className="flex items-center gap-2.5">
          <FolderCheck className="w-4 h-4 text-emerald-accent" />
          <h3 className="font-bold text-sm text-[var(--text-primary)]">
            目录深度统计清单 ({filtered.length} / {displayList.length})
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Switcher */}
          <div className="flex items-center p-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setViewMode('leaf_only')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'leaf_only'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              仅最深层(叶子)目录 ({leafDirectories.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              全部目录 ({allDirectories.length})
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索目录路径..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 pr-3 rounded-lg text-xs bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:border-indigo-500 outline-none"
            />
          </div>

          <button
            type="button"
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>导出 CSV</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold">
              <th className="py-3 px-3 w-10 text-center">#</th>
              <th className="py-3 px-4">目录相对路径</th>
              <th className="py-3 px-4 text-center w-20">层级深度</th>
              <th className="py-3 px-4 text-center w-24">类型</th>
              <th className="py-3 px-4 text-right">文件数量</th>
              <th className="py-3 px-4 text-right">总空间占用</th>
              <th className="py-3 px-4">格式分布</th>
              <th className="py-3 px-3 w-12 text-center">明细</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-[var(--text-muted)]">
                  暂无匹配的目录数据
                </td>
              </tr>
            ) : (
              filtered.map((item, idx) => {
                const isExpanded = expandedDir === item.path;

                return (
                  <React.Fragment key={`${item.path}-${idx}`}>
                    <tr
                      onClick={() => toggleExpand(item.path)}
                      className="hover:bg-[var(--bg-surface-hover)]/60 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-3 text-center font-mono text-[11px] text-[var(--text-muted)]">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-cyan-accent break-all font-semibold">
                          {item.rel_path}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-[var(--text-secondary)]">
                        L{item.depth}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.is_leaf ? (
                          <span className="status-badge badge-exact text-[10px]">
                            叶子目录
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tag-badge">
                            中间分支
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-[var(--text-primary)]">
                        {item.file_count.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[var(--text-secondary)]">
                        {item.size_formatted}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1">
                          {Object.entries(item.extensions).slice(0, 3).map(([ext, count]) => (
                            <span
                              key={ext}
                              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
                            >
                              {ext} ({count})
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center text-[var(--text-muted)]">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 mx-auto text-brand-accent" />
                        ) : (
                          <ChevronRight className="w-4 h-4 mx-auto" />
                        )}
                      </td>
                    </tr>

                    {isExpanded && item.sample_files && item.sample_files.length > 0 && (
                      <tr className="bg-[var(--bg-input)]/80 border-b border-[var(--border-subtle)]">
                        <td colSpan={8} className="p-4 pl-12">
                          <div className="space-y-1.5">
                            <div className="text-[11px] font-bold text-[var(--text-secondary)]">
                              目录文件样本 (前 {item.sample_files.length} 项):
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 font-mono text-xs text-[var(--text-primary)]">
                              {item.sample_files.map((file, fIdx) => (
                                <div
                                  key={fIdx}
                                  className="truncate p-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                                >
                                  {file}
                                </div>
                              ))}
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
