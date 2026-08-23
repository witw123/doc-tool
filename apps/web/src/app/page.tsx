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
  const [mockTriggerKey, setMockTriggerKey] = useState(0);

  const handleLoadMockPresets = () => {
    const mockStats = 'test_mock_env/01_单一目录深度统计_样例';
    const mockDiffA = 'test_mock_env/02_双目录比对_目录A';
    const mockDiffB = 'test_mock_env/02_双目录比对_目录B';
    const mockSplit = 'test_mock_env/03_文件名拆分导出_样例';

    setStatsPresetPath(mockStats);
    setDiffPresetDirA(mockDiffA);
    setDiffPresetDirB(mockDiffB);
    setSplitPresetPath(mockSplit);
    setMockTriggerKey(Date.now());

    showToast('已一键载入测试示例并开始执行分析', 'success');
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
          <StatsView
            key={`stats_${mockTriggerKey}`}
            initialPath={statsPresetPath}
          />
        ) : activeTab === 'diff' ? (
          <DiffView
            key={`diff_${mockTriggerKey}`}
            initialDirA={diffPresetDirA}
            initialDirB={diffPresetDirB}
          />
        ) : (
          <FilenameSplitView
            key={`split_${mockTriggerKey}`}
            initialPath={splitPresetPath}
          />
        )}
      </main>

      <footer className="py-6 border-t border-[var(--border-subtle)] text-center text-xs text-[var(--text-muted)]">
        FileScope Monorepo v2.0 · Next.js 15 & NestJS 10 Architecture · MIT License
      </footer>
    </div>
  );
}
