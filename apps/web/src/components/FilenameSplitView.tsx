'use client';

import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  FileSpreadsheet,
  Download,
  Eye,
  Plus,
  Bookmark,
  CheckCircle2,
  X,
  Edit2,
  Trash2,
  Layers,
  Search,
  Check,
  ArrowRight,
  Folder,
} from 'lucide-react';
import {
  FilenamePreviewResponse,
  FilenamePreviewRequest,
  FilenameExportRequest,
  processLocalFilenameSplit,
  LocalScannedFile,
} from '@doc-tool/shared';
import { apiPreviewFilenameSplit, apiExportFilenameSplitXlsx } from '@/lib/api';
import { pickLocalFolder } from '@/lib/local-folder-picker';
import { exportLocalSplitExcel } from '@/lib/excel-export';
import { useToast } from './Toast';

const STORAGE_KEY_TEMPLATES = 'filescope_user_custom_templates';
const STORAGE_KEY_ACTIVE_TEMPLATE = 'filescope_active_template_id';

export interface UserTemplate {
  id: string;
  name: string;
  fields: string[];
  delimiter: string;
  layout: 'grouped_sheets' | 'single_sheet';
  createdAt: number;
}

interface FilenameSplitViewProps {
  initialPath?: string;
}

export function FilenameSplitView({ initialPath = '' }: FilenameSplitViewProps) {
  const { showToast } = useToast();

  // Step 1: Directory Selection
  const [path, setPath] = useState(initialPath);
  const [folderDisplayName, setFolderDisplayName] = useState(initialPath || '');
  const [localFiles, setLocalFiles] = useState<LocalScannedFile[] | null>(null);

  // Step 2: Templates (100% User Generated)
  const [templates, setTemplates] = useState<UserTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  // Template Modal Editor State
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [modalName, setModalName] = useState('');
  const [modalFields, setModalFields] = useState<string[]>(['字段1', '字段2', '字段3']);
  const [modalFieldInput, setModalFieldInput] = useState('');
  const [modalDelimiter, setModalDelimiter] = useState('_');
  const [modalLayout, setModalLayout] = useState<'grouped_sheets' | 'single_sheet'>('grouped_sheets');

  // Step 3: Preview & Export
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewResult, setPreviewResult] = useState<FilenamePreviewResponse | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Load user templates from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TEMPLATES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTemplates(parsed);
          const savedActive = localStorage.getItem(STORAGE_KEY_ACTIVE_TEMPLATE);
          if (savedActive && parsed.some((t: UserTemplate) => t.id === savedActive)) {
            setActiveTemplateId(savedActive);
          } else {
            setActiveTemplateId(parsed[0].id);
          }
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Sync initial path
  useEffect(() => {
    if (initialPath) {
      setPath(initialPath);
      setFolderDisplayName(initialPath);
      setLocalFiles(null);
    }
  }, [initialPath]);

  const activeTemplate = templates.find((t) => t.id === activeTemplateId) || null;

  // Auto-run preview when folder and template are both selected
  useEffect(() => {
    if ((localFiles && localFiles.length > 0) || path.trim()) {
      if (activeTemplate) {
        runPreview(activeTemplate);
      }
    }
  }, [localFiles, path, activeTemplateId]);

  // Step 1: Pick local folder
  const handlePickLocalFolder = async () => {
    try {
      setLoading(true);
      const result = await pickLocalFolder();
      setLocalFiles(result.files);
      setFolderDisplayName(result.folderName);
      setPath(result.folderName);

      showToast(
        `已成功载入电脑文件夹「${result.folderName}」，共 ${result.files.length} 个文件`,
        'success'
      );

      // If no templates yet, prompt user to create one
      if (templates.length === 0) {
        openCreateTemplateModal();
      }
    } catch (err: any) {
      if (err.message !== '用户取消了文件夹选择') {
        showToast(`选择文件夹失败: ${err.message}`, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Template modal controls
  const openCreateTemplateModal = () => {
    setEditingTemplateId(null);
    setModalName(`自定义模板 ${templates.length + 1}`);
    setModalFields(['项目', '年份', '序号']);
    setModalDelimiter('_');
    setModalLayout('grouped_sheets');
    setIsTemplateModalOpen(true);
  };

  const openEditTemplateModal = (tpl: UserTemplate, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingTemplateId(tpl.id);
    setModalName(tpl.name);
    setModalFields([...tpl.fields]);
    setModalDelimiter(tpl.delimiter);
    setModalLayout(tpl.layout);
    setIsTemplateModalOpen(true);
  };

  const handleSaveTemplate = () => {
    const name = modalName.trim();
    if (!name) {
      showToast('请输入模板名称', 'warning');
      return;
    }
    if (modalFields.length === 0) {
      showToast('模板至少需要包含一个字段', 'warning');
      return;
    }

    let updatedTemplates: UserTemplate[];
    let targetId: string;

    if (editingTemplateId) {
      // Edit existing
      targetId = editingTemplateId;
      updatedTemplates = templates.map((t) =>
        t.id === editingTemplateId
          ? {
              ...t,
              name,
              fields: [...modalFields],
              delimiter: modalDelimiter,
              layout: modalLayout,
            }
          : t
      );
      showToast(`模板「${name}」已更新`, 'success');
    } else {
      // Create new
      targetId = `tpl_${Date.now()}`;
      const newTpl: UserTemplate = {
        id: targetId,
        name,
        fields: [...modalFields],
        delimiter: modalDelimiter,
        layout: modalLayout,
        createdAt: Date.now(),
      };
      updatedTemplates = [...templates, newTpl];
      showToast(`模板「${name}」创建成功`, 'success');
    }

    setTemplates(updatedTemplates);
    localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(updatedTemplates));
    setActiveTemplateId(targetId);
    localStorage.setItem(STORAGE_KEY_ACTIVE_TEMPLATE, targetId);

    setIsTemplateModalOpen(false);
  };

  const handleDeleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = templates.filter((t) => t.id !== id);
    setTemplates(updated);
    localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(updated));

    if (activeTemplateId === id) {
      const nextActive = updated.length > 0 ? updated[0].id : null;
      setActiveTemplateId(nextActive);
      if (nextActive) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_TEMPLATE, nextActive);
      } else {
        localStorage.removeItem(STORAGE_KEY_ACTIVE_TEMPLATE);
        setPreviewResult(null);
      }
    }
    showToast('已删除模板', 'info');
  };

  const handleAddModalField = () => {
    const val = modalFieldInput.trim();
    if (val && !modalFields.includes(val)) {
      setModalFields((prev) => [...prev, val]);
      setModalFieldInput('');
    }
  };

  const handleRemoveModalField = (f: string) => {
    if (modalFields.length <= 1) {
      showToast('至少需保留一个拆分字段', 'warning');
      return;
    }
    setModalFields((prev) => prev.filter((item) => item !== f));
  };

  // Step 3: Run preview
  const runPreview = async (templateToUse: UserTemplate) => {
    if (localFiles && localFiles.length > 0) {
      setLoading(true);
      try {
        const res = processLocalFilenameSplit(
          folderDisplayName || '选择的文件夹',
          localFiles,
          templateToUse.fields,
          templateToUse.delimiter
        );
        setPreviewResult(res);
      } catch (err: any) {
        showToast(`生成预览失败: ${err.message}`, 'error');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (path.trim()) {
      setLoading(true);
      try {
        const req: FilenamePreviewRequest = {
          path: path.trim(),
          fields: templateToUse.fields,
          delimiter: templateToUse.delimiter,
        };
        const res = await apiPreviewFilenameSplit(req);
        setPreviewResult(res);
      } catch (err: any) {
        showToast(`生成预览失败: ${err.message}`, 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  // Step 3: Export Excel
  const handleExportXlsx = async () => {
    if (!activeTemplate) {
      showToast('请先选择或创建模板', 'warning');
      return;
    }

    setExporting(true);
    try {
      if (previewResult && previewResult.rows.length > 0) {
        const { blob, filename } = await exportLocalSplitExcel(
          previewResult.headers,
          previewResult.rows,
          activeTemplate.layout
        );

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast(`Excel 导出成功: ${filename}`, 'success');
      } else if (path.trim()) {
        const req: FilenameExportRequest = {
          path: path.trim(),
          fields: activeTemplate.fields,
          delimiter: activeTemplate.delimiter,
          layout: activeTemplate.layout,
        };
        const { blob, filename } = await apiExportFilenameSplitXlsx(req);

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast(`Excel 导出成功: ${filename}`, 'success');
      } else {
        showToast('请先选择电脑文件夹', 'warning');
      }
    } catch (err: any) {
      showToast(`导出 Excel 失败: ${err.message}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  // Filter preview rows
  const filteredRows = previewResult
    ? previewResult.rows.filter((r) =>
        searchFilter ? r.some((c) => c.toLowerCase().includes(searchFilter.toLowerCase())) : true
      )
    : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Step Flow Card */}
      <div className="glass-panel p-6 sm:p-7 space-y-7">
        {/* Title */}
        <div className="border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] tracking-tight">
              文件名拆分导出 Excel
            </h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1 ml-10">
            按 3 步规范操作：① 先选择电脑文件夹 ➔ ② 选定或创建拆分模板 ➔ ③ 在线预览并导出 Excel
          </p>
        </div>

        {/* STEP 1: Choose Folder */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                1
              </span>
              <span className="text-xs font-bold text-[var(--text-primary)]">
                选择电脑文件夹
              </span>
            </div>

            {localFiles && (
              <span className="text-xs font-semibold text-emerald-accent flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>已载入 {localFiles.length} 个文件</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePickLocalFolder}
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
              }}
              className="flex-1 h-11 px-4 rounded-xl text-xs font-mono interactive-input"
            />
          </div>
        </div>

        {/* STEP 2: Select or Create Template */}
        <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                2
              </span>
              <span className="text-xs font-bold text-[var(--text-primary)]">
                选择或创建自定义拆分模板
              </span>
            </div>

            <button
              type="button"
              onClick={openCreateTemplateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-500/10 text-brand-accent hover:bg-indigo-500/20 border border-indigo-500/25 transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>创建新模板</span>
            </button>
          </div>

          {templates.length === 0 ? (
            <div className="p-5 rounded-xl bg-[var(--bg-input)] border border-dashed border-[var(--border-subtle)] flex flex-col items-center justify-center text-center gap-2">
              <Bookmark className="w-6 h-6 text-[var(--text-muted)]" />
              <p className="text-xs text-[var(--text-secondary)] font-medium">
                暂无拆分模板，点击右上方「创建新模板」定义您的分隔符与拆分列名
              </p>
              <button
                type="button"
                onClick={openCreateTemplateModal}
                className="action-btn-primary px-4 py-1.5 text-xs inline-flex items-center gap-1.5 mt-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>立即创建首个模板</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {templates.map((tpl) => {
                const isSelected = activeTemplateId === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => {
                      setActiveTemplateId(tpl.id);
                      localStorage.setItem(STORAGE_KEY_ACTIVE_TEMPLATE, tpl.id);
                      showToast(`已选用模板: ${tpl.name}`, 'info');
                    }}
                    className={`group relative p-3.5 rounded-xl cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-indigo-600/10 border-indigo-500 shadow-md shadow-indigo-600/15'
                        : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-surface-hover)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-600 text-white'
                              : 'border-[var(--border-subtle)]'
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5" />}
                        </div>
                        <span className="font-bold text-xs text-[var(--text-primary)] truncate max-w-[150px]">
                          {tpl.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => openEditTemplateModal(tpl, e)}
                          className="p-1 rounded hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-brand-accent"
                          title="编辑此模板"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteTemplate(tpl.id, e)}
                          className="p-1 rounded hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-rose-400"
                          title="删除此模板"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-[11px] text-[var(--text-secondary)]">
                      <div className="flex items-center gap-1">
                        <span className="text-[var(--text-muted)]">分隔符:</span>
                        <span className="font-mono font-bold text-cyan-accent bg-[var(--bg-surface)] px-1.5 py-0.2 rounded border border-[var(--border-subtle)]">
                          {tpl.delimiter === ' ' ? '空格' : tpl.delimiter}
                        </span>
                        <span className="text-[var(--text-muted)] ml-2">结构:</span>
                        <span>{tpl.layout === 'grouped_sheets' ? '按目录拆Sheet' : '单Sheet汇总'}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1 pt-1">
                        {tpl.fields.map((f, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.2 rounded text-[10px] tag-badge font-mono"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* STEP 3: Preview & Export Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">
              3
            </span>
            <span className="text-xs font-bold text-[var(--text-primary)]">
              确认并导出 Excel
            </span>
            {activeTemplate && (
              <span className="text-xs text-[var(--text-secondary)] ml-2">
                当前模板: <strong className="text-brand-accent font-mono">{activeTemplate.name}</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={loading || !activeTemplate || (!localFiles && !path.trim())}
              onClick={() => activeTemplate && runPreview(activeTemplate)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] disabled:opacity-40 transition-all"
            >
              {loading ? (
                <span className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Eye className="w-4 h-4 text-brand-accent" />
              )}
              <span>刷新数据预览</span>
            </button>

            <button
              type="button"
              disabled={exporting || !activeTemplate || (!localFiles && !path.trim())}
              onClick={handleExportXlsx}
              className="action-btn-success inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm shadow-md disabled:opacity-40"
            >
              {exporting ? (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>导出 Excel (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      {previewResult && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-panel p-4">
            <div className="text-xs text-[var(--text-secondary)] font-semibold mb-1">
              总文件记录数
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
              {previewResult.file_count.toLocaleString()}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1 font-mono">
              包含全部扫描文件
            </div>
          </div>

          <div className="glass-panel p-4">
            <div className="text-xs text-[var(--text-secondary)] font-semibold mb-1">
              叶子文件夹组数
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-accent">
              {previewResult.leaf_count.toLocaleString()}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1 font-mono">
              多 Sheet 模式下将生成对应工作表
            </div>
          </div>

          <div className="glass-panel p-4">
            <div className="text-xs text-[var(--text-secondary)] font-semibold mb-1">
              未完全匹配项
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-amber-accent">
              {previewResult.unmatched_count.toLocaleString()}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1 font-mono">
              切分段数与模板字段数不一致
            </div>
          </div>
        </div>
      )}

      {/* Preview Table */}
      {previewResult && (
        <div className="glass-panel overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/40">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="w-4 h-4 text-indigo-400" />
              <h3 className="font-bold text-sm text-[var(--text-primary)]">
                拆分结果明细预览 (共 {filteredRows.length} / {previewResult.rows.length} 行)
              </h3>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="在预览结果中搜索..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full h-8 pl-8 pr-3 rounded-lg text-xs bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="min-w-[860px] w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold">
                  <th className="py-3 px-3 w-12 text-center whitespace-nowrap">#</th>
                  {previewResult.headers.map((h, i) => (
                    <th key={i} className="py-3 px-4 whitespace-nowrap">
                      {h}
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
                      暂无匹配数据
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, rowIdx) => {
                    const statusVal = row[row.length - 1];
                    const isMatched = statusVal === '匹配';

                    return (
                      <tr
                        key={rowIdx}
                        className="hover:bg-[var(--bg-surface-hover)]/60 transition-colors"
                      >
                        <td className="py-3 px-3 text-center font-mono text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                          {rowIdx + 1}
                        </td>
                        {row.map((cell, cellIdx) => {
                          // First column is relative path
                          if (cellIdx === 0) {
                            return (
                              <td key={cellIdx} className="py-3 px-4 min-w-[200px]">
                                <span className="font-mono text-cyan-accent break-all font-semibold">
                                  {cell}
                                </span>
                              </td>
                            );
                          }

                          // Last column is status
                          if (cellIdx === row.length - 1) {
                            return (
                              <td key={cellIdx} className="py-3 px-4 whitespace-nowrap">
                                <span
                                  className={`status-badge whitespace-nowrap shrink-0 ${
                                    isMatched ? 'badge-exact' : 'badge-only-a'
                                  }`}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                  <span>{cell}</span>
                                </span>
                              </td>
                            );
                          }

                          // Third column is raw filename
                          if (cellIdx === 2) {
                            return (
                              <td key={cellIdx} className="py-3 px-4 font-mono font-bold text-[var(--text-primary)] whitespace-nowrap">
                                {cell}
                              </td>
                            );
                          }

                          return (
                            <td key={cellIdx} className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                              {cell || <span className="text-[var(--text-muted)]">-</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Template Creator / Editor Modal */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl p-6 sm:p-7 space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2 font-bold text-sm text-[var(--text-primary)]">
                <Bookmark className="w-4 h-4 text-brand-accent" />
                <span>{editingTemplateId ? '编辑拆分模板' : '创建新拆分模板'}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Template Name */}
            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">
                模板名称
              </label>
              <input
                type="text"
                placeholder="例如: 财务报表规范 / 项目图档命名..."
                value={modalName}
                onChange={(e) => setModalName(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl text-xs font-semibold interactive-input text-[var(--text-primary)]"
              />
            </div>

            {/* Delimiter Selection */}
            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">
                文件名拆分分隔符
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="自定义"
                  value={modalDelimiter}
                  onChange={(e) => setModalDelimiter(e.target.value)}
                  className="h-10 w-16 text-center px-2 rounded-xl text-xs font-mono font-bold interactive-input text-cyan-accent shrink-0"
                />
                <div className="flex items-center gap-1.5 flex-1">
                  {[
                    { label: '_ 下划线', val: '_' },
                    { label: '- 中划线', val: '-' },
                    { label: '␣ 空格', val: ' ' },
                    { label: '. 点号', val: '.' },
                  ].map((item) => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => setModalDelimiter(item.val)}
                      className={`h-10 flex-1 rounded-xl text-xs font-semibold transition-all border ${
                        modalDelimiter === item.val
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm font-bold'
                          : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Dynamic Fields Tag Builder */}
            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">
                拆分字段顺序与列名 (按先后顺序映射切分段)
              </label>
              <div className="min-h-[48px] p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex flex-wrap items-center gap-2">
                {modalFields.map((f, idx) => (
                  <span
                    key={`${f}-${idx}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tag-badge shadow-sm"
                  >
                    <span className="font-mono text-[10px] opacity-80">#{idx + 1}</span>
                    <span>{f}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveModalField(f)}
                      className="hover:text-rose-400 text-xs ml-1 transition-colors"
                      title="删除字段"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                  <input
                    type="text"
                    placeholder="输入新列名字段按回车添加..."
                    value={modalFieldInput}
                    onChange={(e) => setModalFieldInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        handleAddModalField();
                      }
                    }}
                    className="flex-1 px-2 py-1 text-xs bg-transparent text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  />
                  <button
                    type="button"
                    onClick={handleAddModalField}
                    className="p-1.5 rounded-lg bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-hover)] text-brand-accent border border-[var(--border-subtle)] transition-colors"
                    title="添加字段"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Excel Layout Option */}
            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">
                Excel 导出结构
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setModalLayout('grouped_sheets')}
                  className={`py-2 rounded-lg text-xs font-semibold transition-all ${
                    modalLayout === 'grouped_sheets'
                      ? 'bg-indigo-600 text-white shadow-sm font-bold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  按叶子文件夹拆分 Sheet
                </button>
                <button
                  type="button"
                  onClick={() => setModalLayout('single_sheet')}
                  className={`py-2 rounded-lg text-xs font-semibold transition-all ${
                    modalLayout === 'single_sheet'
                      ? 'bg-indigo-600 text-white shadow-sm font-bold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  汇总到单 Sheet (文件明细)
                </button>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                className="action-btn-primary px-5 py-2 text-xs"
              >
                {editingTemplateId ? '保存修改' : '确认创建模板'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
