'use client';

import React, { useState } from 'react';
import { Header } from '@/components/Header';
import { StatsView } from '@/components/StatsView';
import { DiffView } from '@/components/DiffView';
import { FilenameSplitView } from '@/components/FilenameSplitView';
import { useToast } from '@/components/Toast';

export default function HomePage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'stats' | 'diff' | 'split'>('stats');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const [statsPresetPath, setStatsPresetPath] = useState('');
  const [diffPresetDirA, setDiffPresetDirA] = useState('');
  const [diffPresetDirB, setDiffPresetDirB] = useState('');
  const [splitPresetPath, setSplitPresetPath] = useState('');

  const handleLoadMockPresets = () => {
    const mockA = 'test_mock_env/folder_a';
    const mockB = 'test_mock_env/folder_b';

    setStatsPresetPath(mockA);
    setDiffPresetDirA(mockA);
    setDiffPresetDirB(mockB);
    setSplitPresetPath(mockA);

    showToast('已载入测试示例路径', 'success');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLoadMockPresets={handleLoadMockPresets}
        theme={theme}
        setTheme={setTheme}
      />

      <main className="flex-1 max-w-[1680px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-6">
        {activeTab === 'stats' ? (
          <StatsView initialPath={statsPresetPath} />
        ) : activeTab === 'diff' ? (
          <DiffView initialDirA={diffPresetDirA} initialDirB={diffPresetDirB} />
        ) : (
          <FilenameSplitView initialPath={splitPresetPath} />
        )}
      </main>

      <footer className="py-6 border-t border-[var(--border-subtle)] text-center text-xs text-[var(--text-muted)]">
        FileScope Monorepo v2.0 · Next.js 15 & NestJS 10 Architecture · MIT License
      </footer>
    </div>
  );
}
