import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/Toast';

export const metadata: Metadata = {
  title: 'FileScope - 轻量化文件名比对与统计工具',
  description: '高效轻量级单目录深度分析、公共前缀归纳、叶子目录汇总与双目录差异比对系统',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" data-theme="dark" suppressHydrationWarning>
      <body className="antialiased selection:bg-indigo-500/30 selection:text-white">
        <ToastProvider>
          <div className="bg-mesh" />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
