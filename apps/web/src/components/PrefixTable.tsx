'use client';

import React, { useState } from 'react';
import { PrefixStatItem, formatBytes } from '@doc-tool/shared';
import { Sparkles, Download, ChevronRight, ChevronDown, Search } from 'lucide-react';

interface PrefixTableProps {
  prefixStats: PrefixStatItem[];
}

export function PrefixTable({ prefixStats }: PrefixTableProps) {
  const [expandedPrefix, setExpandedPrefix] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = prefixStats.filter((p) =>
    search ? p.prefix.toLowerCase().includes(search.toLowerCase()) : true
  );

  const toggleExpand = (pfx: string) => {
    setExpandedPrefix(expandedPrefix === pfx ? null : pfx);
  };

  const exportCSV = () => {
    const headers = ['前缀', '匹配文件数', '占比(%)', '总大小(字节)', '大小(格式化)', '文件格式分布'];
    const rows = prefixStats.map((p) => [
      `"${p.prefix}"`,
      p.match_count,
      p.percentage,
      p.total_size_bytes,
      `"${p.size_formatted}"`,
      `"${Object.entries(p.extensions)
        .map(([k, v]) => `${k}:${v}`)
        .join('; ')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prefix_statistics_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass-panel overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/40">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-cyan-accent" />
          <h3 className="font-bold text-sm text-[var(--text-primary)]">
            文件前缀统计清单 ({filtered.length} / {prefixStats.length})
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索前缀..."
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
        <table className="min-w-[800px] w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold">
              <th className="py-3 px-3 w-12 text-center whitespace-nowrap">#</th>
              <th className="py-3 px-4 min-w-[180px] whitespace-nowrap">前缀名称 / 标签</th>
              <th className="py-3 px-4 text-right w-28 whitespace-nowrap">匹配文件数</th>
              <th className="py-3 px-4 w-44 whitespace-nowrap">文件数占比</th>
              <th className="py-3 px-4 text-right w-28 whitespace-nowrap">总空间占用</th>
              <th className="py-3 px-4 min-w-[160px] whitespace-nowrap">主要格式分布</th>
              <th className="py-3 px-3 w-14 text-center whitespace-nowrap">样本</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-[var(--text-muted)]">
                  暂无匹配的前缀统计数据
                </td>
              </tr>
            ) : (
              filtered.map((item, idx) => {
                const isExpanded = expandedPrefix === item.prefix;
                const isUnassigned = item.prefix.includes('[无固定前缀]') || item.prefix.includes('[其他');

                return (
                  <React.Fragment key={`${item.prefix}-${idx}`}>
                    <tr
                      onClick={() => toggleExpand(item.prefix)}
                      className="hover:bg-[var(--bg-surface-hover)]/60 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-3 text-center font-mono text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`font-mono font-bold px-2.5 py-0.5 rounded-md text-xs border whitespace-nowrap inline-flex items-center shrink-0 ${
                            isUnassigned
                              ? 'bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border-[var(--border-subtle)]'
                              : 'tag-badge'
                          }`}
                        >
                          {item.prefix}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-[var(--text-primary)] whitespace-nowrap">
                        {item.match_count.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-[var(--bg-input)] overflow-hidden border border-[var(--border-subtle)] min-w-[60px]">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all duration-300"
                              style={{ width: `${Math.min(item.percentage, 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] text-[var(--text-secondary)] w-12 text-right shrink-0">
                            {item.percentage}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[var(--text-secondary)] whitespace-nowrap">
                        {item.size_formatted}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1">
                          {Object.entries(item.extensions).slice(0, 4).map(([ext, count]) => (
                            <span
                              key={ext}
                              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-subtle)] whitespace-nowrap"
                            >
                              {ext} ({count})
                            </span>
                          ))}
                          {Object.keys(item.extensions).length > 4 && (
                            <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">
                              +{Object.keys(item.extensions).length - 4} 种
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center text-[var(--text-muted)] whitespace-nowrap">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 mx-auto text-brand-accent" />
                        ) : (
                          <ChevronRight className="w-4 h-4 mx-auto" />
                        )}
                      </td>
                    </tr>

                    {isExpanded && item.sample_files && item.sample_files.length > 0 && (
                      <tr className="bg-[var(--bg-input)]/80 border-b border-[var(--border-subtle)]">
                        <td colSpan={7} className="p-4 pl-12">
                          <div className="space-y-1.5">
                            <div className="text-[11px] font-bold text-[var(--text-secondary)]">
                              匹配样本文件 (前 {item.sample_files.length} 项):
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 font-mono text-xs text-cyan-accent">
                              {item.sample_files.map((sample, sIdx) => (
                                <div
                                  key={sIdx}
                                  className="truncate p-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                                >
                                  {sample}
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
