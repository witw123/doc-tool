'use client';

import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  FileSpreadsheet,
  Download,
  Eye,
  Plus,
  Bookmark,
  X,
  Edit2,
  Trash2,
  Search,
  Check,
  GripVertical,
  SlidersHorizontal,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  MoveHorizontal,
  Layers,
} from 'lucide-react';
import {
  FilenamePreviewResponse,
  FilenamePreviewRequest,
  FilenameExportRequest,
  processLocalFilenameSplit,
  LocalScannedFile,
  SplitFieldItem,
  UserTemplate,
} from '@doc-tool/shared';
import { apiPreviewFilenameSplit, apiExportFilenameSplitXlsx } from '@/lib/api';
import { pickLocalFolder } from '@/lib/local-folder-picker';
import { exportLocalSplitExcel } from '@/lib/excel-export';
import { useToast } from './Toast';

const STORAGE_KEY_TEMPLATES = 'filescope_user_custom_templates_v5';
const STORAGE_KEY_ACTIVE_TEMPLATE = 'filescope_active_template_id_v5';

const createDefaultFields = (): SplitFieldItem[] => [
  { id: 'f_1', value: '项目', enabled: true },
  { id: 'f_2', value: '_', enabled: false },
  { id: 'f_3', value: '年份', enabled: true },
  { id: 'f_4', value: '_', enabled: false },
  { id: 'f_5', value: '序号', enabled: true },
];

interface FilenameSplitViewProps {
  initialPath?: string;
}

export function FilenameSplitView({ initialPath = '' }: FilenameSplitViewProps) {
  const { showToast } = useToast();

  // Step 1: Directory Selection
  const [path, setPath] = useState(initialPath);
  const [folderDisplayName, setFolderDisplayName] = useState(initialPath || '');
  const [localFiles, setLocalFiles] = useState<LocalScannedFile[] | null>(null);

  // Step 2: Templates (Compact Unified Field Sequence)
  const [templates, setTemplates] = useState<UserTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  // Template Modal Editor State (Compact Drag & Drop Sequence)
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [modalName, setModalName] = useState('');
  const [modalFields, setModalFields] = useState<SplitFieldItem[]>(createDefaultFields());
  const [modalLayout, setModalLayout] = useState<'grouped_sheets' | 'single_sheet'>('grouped_sheets');

  // Drag and drop tracking
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Step 3: Preview & Export
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewResult, setPreviewResult] = useState<FilenamePreviewResponse | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Normalize template structure to guarantee resilience
  const normalizeTemplate = (t: any): UserTemplate => {
    let fields: SplitFieldItem[] = [];

    if (Array.isArray(t?.fields) && t.fields.length > 0) {
      fields = t.fields.map((f: any, idx: number) => ({
        id: f.id || `f_${idx}`,
        value: f.value || f.name || `字段${idx + 1}`,
        enabled: f.enabled !== false,
      }));
    } else if (Array.isArray(t?.items) && t.items.length > 0) {
      for (let i = 0; i < t.items.length; i++) {
        if (t.items[i].type === 'field') {
          fields.push({
            id: t.items[i].id || `f_${fields.length + 1}`,
            value: t.items[i].name || `字段${fields.length + 1}`,
            enabled: t.items[i].enabled !== false,
          });
        } else if (t.items[i].type === 'delimiter') {
          fields.push({
            id: t.items[i].id || `d_${fields.length + 1}`,
            value: t.items[i].value || '_',
            enabled: false,
          });
        }
      }
    }

    if (fields.length === 0) {
      fields = createDefaultFields();
    }

    return {
      id: t?.id || `tpl_${Date.now()}`,
      name: t?.name || '项目_年份_序号',
      fields,
      layout: t?.layout || 'grouped_sheets',
      createdAt: t?.createdAt || Date.now(),
    };
  };

  // Load user templates from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TEMPLATES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = parsed.map((t) => normalizeTemplate(t));
          setTemplates(normalized);
          const savedActive = localStorage.getItem(STORAGE_KEY_ACTIVE_TEMPLATE);
          if (savedActive && normalized.some((t) => t.id === savedActive)) {
            setActiveTemplateId(savedActive);
          } else {
            setActiveTemplateId(normalized[0].id);
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

      let tplToRun = templates.find((t) => t.id === activeTemplateId) || null;
      if (!tplToRun) {
        const defaultTpl = normalizeTemplate({
          id: 'tpl_preset_default',
          name: '项目_年份_序号',
          fields: createDefaultFields(),
          layout: 'grouped_sheets',
          createdAt: Date.now(),
        });
        setTemplates([defaultTpl]);
        setActiveTemplateId(defaultTpl.id);
        tplToRun = defaultTpl;
      }
      if (tplToRun) {
        runPreview(tplToRun);
      }
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

      showToast(`已载入「${result.folderName}」，共 ${result.files.length} 个文件`, 'success');

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

  // Step 2: Modal controls
  const openCreateTemplateModal = () => {
    setEditingTemplateId(null);
    setModalName(`规则 ${templates.length + 1}`);
    setModalFields(createDefaultFields());
    setModalLayout('grouped_sheets');
    setIsTemplateModalOpen(true);
  };

  const openEditTemplateModal = (tpl: UserTemplate, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingTemplateId(tpl.id);
    setModalName(tpl.name);
    setModalFields(
      tpl.fields && tpl.fields.length > 0
        ? JSON.parse(JSON.stringify(tpl.fields))
        : createDefaultFields()
    );
    setModalLayout(tpl.layout || 'grouped_sheets');
    setIsTemplateModalOpen(true);
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updated = [...modalFields];
    const [removed] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, removed!);

    setModalFields(updated);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Compact Field Operations
  const handleAddField = (defaultValue: string = '', isEnabled: boolean = true) => {
    const fieldCount = modalFields.filter((f) => f.enabled).length + 1;
    const newField: SplitFieldItem = {
      id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      value: defaultValue || `字段${fieldCount}`,
      enabled: isEnabled,
    };
    setModalFields((prev) => [...prev, newField]);
  };

  const handleToggleFieldEnable = (id: string) => {
    setModalFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f))
    );
  };

  const handleUpdateFieldValue = (id: string, value: string) => {
    setModalFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, value } : f))
    );
  };

  const handleDeleteField = (id: string) => {
    if (modalFields.length <= 1) {
      showToast('至少需保留一个字段', 'warning');
      return;
    }
    setModalFields((prev) => prev.filter((f) => f.id !== id));
  };

  const handleApplyPreset = (presetType: 'underscore' | 'hyphen' | 'dot' | 'mixed') => {
    if (presetType === 'underscore') {
      setModalFields([
        { id: `f_${Date.now()}_1`, value: '项目', enabled: true },
        { id: `f_${Date.now()}_2`, value: '_', enabled: false },
        { id: `f_${Date.now()}_3`, value: '年份', enabled: true },
        { id: `f_${Date.now()}_4`, value: '_', enabled: false },
        { id: `f_${Date.now()}_5`, value: '序号', enabled: true },
      ]);
    } else if (presetType === 'hyphen') {
      setModalFields([
        { id: `f_${Date.now()}_1`, value: '部门', enabled: true },
        { id: `f_${Date.now()}_2`, value: '-', enabled: false },
        { id: `f_${Date.now()}_3`, value: '年份', enabled: true },
        { id: `f_${Date.now()}_4`, value: '-', enabled: false },
        { id: `f_${Date.now()}_5`, value: '月份', enabled: true },
      ]);
    } else if (presetType === 'dot') {
      setModalFields([
        { id: `f_${Date.now()}_1`, value: '模块', enabled: true },
        { id: `f_${Date.now()}_2`, value: '.', enabled: false },
        { id: `f_${Date.now()}_3`, value: '版本', enabled: true },
        { id: `f_${Date.now()}_4`, value: '.', enabled: false },
        { id: `f_${Date.now()}_5`, value: '补丁', enabled: true },
      ]);
    } else {
      setModalFields([
        { id: `f_${Date.now()}_1`, value: '合同编号', enabled: true },
        { id: `f_${Date.now()}_2`, value: '_', enabled: false },
        { id: `f_${Date.now()}_3`, value: '甲方', enabled: true },
        { id: `f_${Date.now()}_4`, value: '-', enabled: false },
        { id: `f_${Date.now()}_5`, value: '版本', enabled: true },
      ]);
    }
  };

  const handleSaveTemplate = () => {
    const name = modalName.trim();
    if (!name) {
      showToast('请输入规则名称', 'warning');
      return;
    }
    if (modalFields.length === 0) {
      showToast('至少需要配置一个字段', 'warning');
      return;
    }

    const enabledFields = modalFields.filter((f) => f.enabled);
    if (enabledFields.length === 0) {
      showToast('请至少开启一个需要导出的字段', 'warning');
      return;
    }

    let updatedTemplates: UserTemplate[];
    let targetId: string;

    if (editingTemplateId) {
      targetId = editingTemplateId;
      updatedTemplates = templates.map((t) =>
        t.id === editingTemplateId
          ? {
              ...t,
              name,
              fields: JSON.parse(JSON.stringify(modalFields)),
              layout: modalLayout,
            }
          : t
      );
      showToast(`规则「${name}」已更新`, 'success');
    } else {
      targetId = `tpl_${Date.now()}`;
      const newTpl: UserTemplate = {
        id: targetId,
        name,
        fields: JSON.parse(JSON.stringify(modalFields)),
        layout: modalLayout,
        createdAt: Date.now(),
      };
      updatedTemplates = [...templates, newTpl];
      showToast(`规则「${name}」创建成功`, 'success');
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
    showToast('已删除规则', 'info');
  };

  // Step 3: Run preview
  const runPreview = async (templateToUse: UserTemplate) => {
    const safeTpl = normalizeTemplate(templateToUse);

    if (localFiles && localFiles.length > 0) {
      setLoading(true);
      try {
        const res = processLocalFilenameSplit(
          folderDisplayName || '选择的文件夹',
          localFiles,
          safeTpl.fields
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
          fields: safeTpl.fields,
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
      showToast('请先选择拆分规则', 'warning');
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
        showToast('请先选择文件夹', 'warning');
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
    <div className="space-y-6">
      {/* 3-Step Container Card */}
      <div className="glass-panel p-6 sm:p-7 space-y-6">
        {/* Header Title */}
        <div className="border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-brand-accent" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                文件名拆分导出
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                自由组合输入字段与符号，支持开关任意字段，生成清晰的多列表格并导出 Excel
              </p>
            </div>
          </div>
        </div>

        {/* STEP 1: Select Computer Folder */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                1
              </span>
              <span className="text-xs font-bold text-[var(--text-primary)]">
                选择文件夹
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
              <span>选择文件夹</span>
            </button>

            <input
              type="text"
              readOnly={Boolean(localFiles)}
              placeholder="点击左侧按钮选择文件夹..."
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

        {/* STEP 2: Templates */}
        <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                2
              </span>
              <span className="text-xs font-bold text-[var(--text-primary)]">
                拆分规则模板
              </span>
            </div>

            <button
              type="button"
              onClick={openCreateTemplateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-500/10 text-brand-accent hover:bg-indigo-500/20 border border-indigo-500/25 transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新建规则</span>
            </button>
          </div>

          {templates.length === 0 ? (
            <div className="p-6 rounded-xl bg-[var(--bg-input)] border border-dashed border-[var(--border-subtle)] flex flex-col items-center justify-center text-center gap-2">
              <Bookmark className="w-6 h-6 text-[var(--text-muted)]" />
              <p className="text-xs text-[var(--text-secondary)] font-medium">
                暂无拆分规则，点击右上方新建规则
              </p>
              <button
                type="button"
                onClick={openCreateTemplateModal}
                className="action-btn-primary px-4 py-2 text-xs inline-flex items-center gap-1.5 mt-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建规则</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {templates.map((tpl) => {
                const isSelected = activeTemplateId === tpl.id;
                const fieldsList = tpl.fields || [];
                const enabledCount = fieldsList.filter((f) => f.enabled).length;

                return (
                  <div
                    key={tpl.id}
                    onClick={() => {
                      setActiveTemplateId(tpl.id);
                      localStorage.setItem(STORAGE_KEY_ACTIVE_TEMPLATE, tpl.id);
                      showToast(`已选用: ${tpl.name}`, 'info');
                    }}
                    className={`group relative p-4 rounded-xl cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-indigo-600/10 border-indigo-500 shadow-md shadow-indigo-600/15'
                        : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-surface-hover)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-600 text-white'
                              : 'border-[var(--border-subtle)]'
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5" />}
                        </div>
                        <span className="font-bold text-xs text-[var(--text-primary)] truncate max-w-[160px]">
                          {tpl.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => openEditTemplateModal(tpl, e)}
                          className="p-1 rounded hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-brand-accent"
                          title="编辑规则"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteTemplate(tpl.id, e)}
                          className="p-1 rounded hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-rose-400"
                          title="删除规则"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Sequence Preview on Card */}
                    <div className="space-y-2 text-[11px] text-[var(--text-secondary)]">
                      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3 text-indigo-400" />
                          <span>{enabledCount}/{fieldsList.length} 字段启用</span>
                        </span>
                        <span className="px-1.5 py-0.2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                          {tpl.layout === 'grouped_sheets' ? '按目录拆Sheet' : '单Sheet汇总'}
                        </span>
                      </div>

                      {/* Visual Fields Chain */}
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        {fieldsList.map((f, i) => (
                          <span
                            key={f.id || i}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono whitespace-nowrap inline-flex items-center gap-1 ${
                              f.enabled
                                ? 'tag-badge font-semibold'
                                : 'bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)] opacity-70'
                            }`}
                          >
                            <span>{f.value}</span>
                            {!f.enabled && <span className="text-[9px] text-[var(--text-muted)]">(关)</span>}
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
              确认并导出
            </span>
            {activeTemplate && (
              <span className="text-xs text-[var(--text-secondary)] ml-2">
                当前规则: <strong className="text-brand-accent font-mono">{activeTemplate.name}</strong>
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
              <span>刷新预览</span>
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
              <span>导出 Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      {previewResult && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-panel p-4">
            <div className="text-xs text-[var(--text-secondary)] font-semibold mb-1">
              总文件数
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
              拆分字段列数
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-accent">
              {Math.max(0, previewResult.headers.length - 2)} 列
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1 font-mono">
              对应提取的命名数据列
            </div>
          </div>

          <div className="glass-panel p-4">
            <div className="text-xs text-[var(--text-secondary)] font-semibold mb-1">
              生成工作表数
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-cyan-accent">
              {previewResult.leaf_count.toLocaleString()}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1 font-mono">
              按叶子目录归类
            </div>
          </div>
        </div>
      )}

      {/* Online Preview Table */}
      {previewResult && (
        <div className="glass-panel overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-surface-elevated)]/30">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="w-4 h-4 text-brand-accent" />
              <h3 className="font-bold text-sm text-[var(--text-primary)]">
                拆分数据在线预览 ({filteredRows.length} / {previewResult.rows.length} 行)
              </h3>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="搜索任意拆分内容..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full h-8 pl-8 pr-3 rounded-lg text-xs bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
            <table className="min-w-[860px] w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold sticky top-0 z-10 shadow-sm">
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
                    return (
                      <tr
                        key={rowIdx}
                        className="hover:bg-[var(--bg-surface-hover)]/60 transition-colors"
                      >
                        <td className="py-3 px-3 text-center font-mono text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                          {rowIdx + 1}
                        </td>
                        {row.map((cell, cellIdx) => {
                          if (cellIdx === 0) {
                            return (
                              <td key={cellIdx} className="py-3 px-4 min-w-[140px]">
                                <span className="font-mono text-cyan-accent font-semibold">
                                  {cell}
                                </span>
                              </td>
                            );
                          }

                          if (cellIdx === 1) {
                            return (
                              <td key={cellIdx} className="py-3 px-4 font-mono font-bold text-[var(--text-primary)] whitespace-nowrap min-w-[200px]">
                                {cell}
                              </td>
                            );
                          }

                          return (
                            <td key={cellIdx} className="py-3 px-4 font-mono font-semibold text-brand-accent whitespace-nowrap">
                              {cell || <span className="text-[var(--text-muted)] font-normal">-</span>}
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

      {/* ========================================================================= */}
      {/* 🧩 COMPACT FIELD BUILDER MODAL */}
      {/* ========================================================================= */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-fade-in overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl p-6 space-y-5 my-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2.5 font-bold text-base text-[var(--text-primary)]">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-[1px] shadow-sm">
                  <div className="w-full h-full rounded-xl bg-[var(--bg-surface)] flex items-center justify-center">
                    <SlidersHorizontal className="w-4 h-4 text-brand-accent" />
                  </div>
                </div>
                <span>{editingTemplateId ? '编辑拆分规则' : '新建拆分规则'}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Template Name & Presets Toolbar */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              <div className="sm:col-span-6">
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">
                  规则名称
                </label>
                <input
                  type="text"
                  placeholder="输入规则名称..."
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl text-xs font-semibold interactive-input text-[var(--text-primary)]"
                />
              </div>

              <div className="sm:col-span-6">
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-accent" />
                  <span>快捷预设:</span>
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('underscore')}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--bg-input)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors"
                  >
                    项目_年份_序号
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('hyphen')}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--bg-input)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors"
                  >
                    部门-年份-月份
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('mixed')}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--bg-input)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors"
                  >
                    合同_甲方-版本
                  </button>
                </div>
              </div>
            </div>

            {/* ================================================================= */}
            {/* 🧩 COMPACT FIELD CHIPS TRACK (DRAG & DROP WORKSPACE) */}
            {/* ================================================================= */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
                  <label className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <span>字段序列</span>
                    <span className="text-[11px] font-normal text-[var(--text-muted)] flex items-center gap-1">
                      <MoveHorizontal className="w-3 h-3 text-indigo-400" />
                      <span>可拖拽排序 / 直接输入名称或符号</span>
                    </span>
                  </label>
                </div>

                {/* Add Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddField('', true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>添加字段</span>
                  </button>
                </div>
              </div>

              {/* Compact Drag and Drop Track Canvas */}
              <div className="p-3.5 rounded-2xl bg-[var(--bg-input)]/70 border-2 border-dashed border-[var(--border-subtle)] min-h-[120px] max-h-[300px] overflow-y-auto space-y-2">
                {modalFields.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                    请点击上方「+ 添加字段」开始配置
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {modalFields.map((field, idx) => {
                      const isDragged = draggedIndex === idx;
                      const isDropTarget = dragOverIndex === idx;

                      return (
                        <div
                          key={field.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, idx)}
                          onDragOver={(e) => handleDragOver(e, idx)}
                          onDrop={(e) => handleDrop(e, idx)}
                          onDragEnd={handleDragEnd}
                          className={`group relative rounded-xl px-2.5 py-1.5 border transition-all select-none flex items-center gap-2 ${
                            isDragged ? 'opacity-30 scale-95' : 'opacity-100'
                          } ${
                            isDropTarget
                              ? 'border-indigo-400 ring-2 ring-indigo-500/40 scale-105'
                              : ''
                          } ${
                            field.enabled
                              ? 'bg-gradient-to-r from-indigo-950/90 to-purple-950/80 border-indigo-500/40 shadow-sm'
                              : 'bg-[var(--bg-surface-elevated)] border-dashed border-[var(--border-subtle)] opacity-75'
                          }`}
                        >
                          {/* Grip Handle */}
                          <div className="cursor-grab active:cursor-grabbing text-indigo-400 hover:text-indigo-300">
                            <GripVertical className="w-3.5 h-3.5" />
                          </div>

                          {/* Direct Input on Field (No separate delimiter box!) */}
                          <input
                            type="text"
                            value={field.value}
                            onChange={(e) => handleUpdateFieldValue(field.id, e.target.value)}
                            placeholder="字段/符号..."
                            className={`h-7 w-20 sm:w-24 px-2 rounded-lg text-xs font-bold font-mono text-center interactive-input ${
                              !field.enabled ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'
                            }`}
                          />

                          {/* Direct Enable / Disable Toggle */}
                          <button
                            type="button"
                            onClick={() => handleToggleFieldEnable(field.id)}
                            className="p-1 rounded hover:bg-[var(--bg-surface-hover)] transition-colors"
                            title={field.enabled ? '已开启为导出列 (点击关闭)' : '已关闭/作为分隔跳过 (点击开启)'}
                          >
                            {field.enabled ? (
                              <ToggleRight className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <ToggleLeft className="w-4 h-4 text-[var(--text-muted)]" />
                            )}
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteField(field.id)}
                            className="p-1 rounded text-[var(--text-muted)] hover:text-rose-400 hover:bg-[var(--bg-surface)] transition-colors"
                            title="删除"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Real-time Simulation Preview */}
              <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-1.5">
                <div className="text-[11px] font-bold text-[var(--text-secondary)] flex items-center justify-between">
                  <span>拼接格式预览:</span>
                  <span className="text-[10px] text-emerald-accent font-semibold">
                    生成 {modalFields.filter((f) => f.enabled).length} 个导出列
                  </span>
                </div>

                {/* Pill String Visualizer */}
                <div className="flex flex-wrap items-center gap-1 font-mono text-xs text-[var(--text-primary)]">
                  {modalFields.map((f, i) => (
                    <span
                      key={f.id || i}
                      className={`px-2 py-0.5 rounded-md text-xs font-bold border transition-all ${
                        f.enabled
                          ? 'tag-badge'
                          : 'bg-[var(--bg-input)] text-[var(--text-muted)] border-[var(--border-subtle)] line-through'
                      }`}
                    >
                      {f.value || '空'}
                      {!f.enabled && <span className="text-[10px] no-underline ml-1">(关)</span>}
                    </span>
                  ))}
                  <span className="text-[var(--text-muted)] text-[11px] ml-1">.扩展名</span>
                </div>
              </div>
            </div>

            {/* Excel Layout Option */}
            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">
                Excel 工作表生成结构
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setModalLayout('grouped_sheets')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                    modalLayout === 'grouped_sheets'
                      ? 'bg-indigo-600 text-white shadow-sm font-bold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  按最深层目录拆分 Sheet (推荐)
                </button>
                <button
                  type="button"
                  onClick={() => setModalLayout('single_sheet')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                    modalLayout === 'single_sheet'
                      ? 'bg-indigo-600 text-white shadow-sm font-bold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  单 Sheet 全部汇总
                </button>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                className="action-btn-primary px-5 py-2 text-xs font-bold inline-flex items-center gap-1.5 shadow-md"
              >
                <Check className="w-3.5 h-3.5" />
                <span>保存规则</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
