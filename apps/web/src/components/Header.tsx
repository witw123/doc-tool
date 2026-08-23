'use client';

import React from 'react';
import {
  FileCode2,
  FolderTree,
  GitCompare,
  FileSpreadsheet,
  Moon,
  Sun,
  Laptop,
} from 'lucide-react';

interface HeaderProps {
  activeTab: 'stats' | 'diff' | 'split';
  setActiveTab: (tab: 'stats' | 'diff' | 'split') => void;
  onLoadMockPresets?: () => void;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
}

export function Header({
  activeTab,
  setActiveTab,
  onLoadMockPresets,
  theme,
  setTheme,
}: HeaderProps) {
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const navItems: Array<{ id: 'stats' | 'diff' | 'split'; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'stats', label: '单一目录深度统计', icon: FolderTree },
    { id: 'diff', label: '双目录差异比对', icon: GitCompare },
    { id: 'split', label: '文件名拆分导出', icon: FileSpreadsheet },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/80 backdrop-blur-xl transition-colors">
      <div className="max-w-[1680px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 h-16 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-[1px] shadow-lg shadow-indigo-500/20">
            <div className="w-full h-full rounded-xl bg-[var(--bg-surface)] flex items-center justify-center">
              <FileCode2 className="w-5 h-5 text-indigo-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight text-[var(--text-primary)]">
                FileScope
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] font-medium leading-none mt-0.5 hidden sm:block">
              文件清单深度分析与比对套件
            </p>
          </div>
        </div>

        {/* Central Segmented Tab Switcher */}
        <nav className="flex items-center p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? 'text-white bg-indigo-600 shadow-md shadow-indigo-600/25 font-bold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]/40'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[var(--text-muted)]'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Tools */}
        <div className="flex items-center gap-2">
          {onLoadMockPresets && (
            <button
              type="button"
              onClick={onLoadMockPresets}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] transition-colors"
              title="载入模拟测试文件夹路径"
            >
              <Laptop className="w-3.5 h-3.5 text-indigo-400" />
              <span>载入测试示例</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] transition-colors"
            title="切换暗色/亮色主题"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
          </button>
        </div>
      </div>
    </header>
  );
}
