import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import {
  SplitFieldItem,
  FilenamePreviewRequest,
  FilenamePreviewResponse,
  FilenameExportRequest,
} from '@doc-tool/shared';

const INVALID_SHEET_CHARS = /[\\/*?:\[\]]/g;
const MAX_SHEET_NAME_LENGTH = 31;

@Injectable()
export class SplitService {
  private resolvePath(rawPath: string): string {
    let target = path.resolve(rawPath);
    if (!fs.existsSync(target)) {
      const rootWorkspace = path.resolve(process.cwd(), '..', '..', rawPath);
      if (fs.existsSync(rootWorkspace)) {
        return rootWorkspace;
      }
    }
    return target;
  }

  private validateRequest(
    rawPath: string,
    rawFields: SplitFieldItem[],
    requestBody?: any
  ): { targetPath: string; validFields: SplitFieldItem[]; enabledFields: SplitFieldItem[] } {
    const trimmedPath = (rawPath || '').trim();
    if (!trimmedPath) {
      throw new BadRequestException('文件夹路径不能为空');
    }

    const targetPath = this.resolvePath(trimmedPath);
    if (!fs.existsSync(targetPath)) {
      throw new NotFoundException(`文件夹路径不存在: ${trimmedPath}`);
    }
    if (!fs.statSync(targetPath).isDirectory()) {
      throw new BadRequestException(`路径不是文件夹: ${trimmedPath}`);
    }

    let fields = rawFields;
    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      if (requestBody?.fields && Array.isArray(requestBody.fields)) {
        fields = requestBody.fields.map((f: any, idx: number) => ({
          id: f.id || `f_${idx}`,
          value: f.value || f.name || `字段${idx + 1}`,
          enabled: f.enabled !== false,
        }));
      } else {
        fields = [
          { id: 'f_1', value: '项目', enabled: true },
          { id: 'f_2', value: '_', enabled: false },
          { id: 'f_3', value: '年份', enabled: true },
          { id: 'f_4', value: '_', enabled: false },
          { id: 'f_5', value: '序号', enabled: true },
        ];
      }
    }

    const enabledFields = fields.filter((f) => f.enabled);
    if (enabledFields.length === 0) {
      throw new BadRequestException('请至少开启一个需要导出的字段');
    }

    return { targetPath, validFields: fields, enabledFields };
  }

  private splitFilename(
    filename: string,
    fields: SplitFieldItem[]
  ): { values: string[]; status: '匹配' | '不匹配' } {
    const lastDotIdx = filename.lastIndexOf('.');
    const stem = lastDotIdx > 0 ? filename.substring(0, lastDotIdx) : filename;

    let remaining = stem;
    let matched = true;
    const outputValues: string[] = [];

    let i = 0;
    while (i < fields.length) {
      const current = fields[i]!;

      // Find the next delimiter or terminating boundary
      let nextDelim: string | null = null;
      let nextDelimIdx = -1;

      for (let j = i + 1; j < fields.length; j++) {
        if (!fields[j]!.enabled || ['_', '-', '.', ' ', '/', '\\', '@', '#'].includes(fields[j]!.value)) {
          nextDelim = fields[j]!.value;
          nextDelimIdx = j;
          break;
        }
      }

      if (current.enabled) {
        if (nextDelim && remaining.includes(nextDelim)) {
          const splitIdx = remaining.indexOf(nextDelim);
          const val = remaining.substring(0, splitIdx);
          remaining = remaining.substring(splitIdx + nextDelim.length);
          outputValues.push(val);
          i = nextDelimIdx + 1;
        } else if (i === fields.length - 1 || !nextDelim) {
          outputValues.push(remaining);
          remaining = '';
          i += 1;
        } else {
          outputValues.push(remaining);
          remaining = '';
          matched = false;
          i += 1;
        }
      } else {
        // Disabled field acts as separator / skip token
        if (current.value && remaining.startsWith(current.value)) {
          remaining = remaining.substring(current.value.length);
        } else if (current.value && remaining.includes(current.value)) {
          const splitIdx = remaining.indexOf(current.value);
          remaining = remaining.substring(splitIdx + current.value.length);
        }
        i += 1;
      }
    }

    if (remaining.length > 0) {
      matched = false;
    }

    return { values: outputValues, status: matched ? '匹配' : '不匹配' };
  }

  private collectLeafRows(
    targetPath: string,
    fields: SplitFieldItem[]
  ): { grouped: Map<string, string[][]>; fileCount: number; unmatchedCount: number } {
    const grouped = new Map<string, string[][]>();
    let fileCount = 0;
    let unmatchedCount = 0;

    const queue: string[] = [targetPath];

    while (queue.length > 0) {
      const currentDir = queue.shift()!;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      const subDirs: string[] = [];
      const files: string[] = [];

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (entry.isDirectory()) {
          subDirs.push(entry.name);
          queue.push(path.join(currentDir, entry.name));
        } else if (entry.isFile()) {
          files.push(entry.name);
        }
      }

      const isLeaf = subDirs.length === 0;
      if (isLeaf && files.length > 0) {
        const relDir = path.relative(targetPath, currentDir).replace(/\\/g, '/') || '(根目录)';
        const folderName = path.basename(currentDir);

        files.sort();
        const rows: string[][] = [];

        for (const filename of files) {
          const { values, status } = this.splitFilename(filename, fields);
          rows.push([folderName, filename, ...values]);
          fileCount += 1;
          if (status === '不匹配') {
            unmatchedCount += 1;
          }
        }

        grouped.set(relDir, rows);
      }
    }

    return { grouped, fileCount, unmatchedCount };
  }

  private safeSheetName(rawName: string, usedNames: Set<string>): string {
    let name = rawName.replace(INVALID_SHEET_CHARS, '_').trim() || '文件夹';
    name = name.slice(0, MAX_SHEET_NAME_LENGTH);
    let candidate = name;
    let index = 2;

    while (Array.from(usedNames).some((n) => n.toLowerCase() === candidate.toLowerCase())) {
      const suffix = `_${index}`;
      candidate = `${name.slice(0, MAX_SHEET_NAME_LENGTH - suffix.length)}${suffix}`;
      index += 1;
    }

    usedNames.add(candidate);
    return candidate;
  }

  preview(request: FilenamePreviewRequest): FilenamePreviewResponse {
    const { targetPath, validFields, enabledFields } = this.validateRequest(
      request.path,
      request.fields,
      request
    );

    const { grouped, fileCount, unmatchedCount } = this.collectLeafRows(targetPath, validFields);

    if (fileCount === 0) {
      throw new BadRequestException('未找到可预览的叶子文件夹文件');
    }

    const enabledFieldNames = enabledFields.map((b) => b.value.trim() || '未命名');

    const headers = ['文件夹名称', '原始文件名', ...enabledFieldNames];
    const rows: string[][] = [];

    const sortedKeys = Array.from(grouped.keys()).sort();
    for (const k of sortedKeys) {
      rows.push(...grouped.get(k)!);
    }

    return {
      success: true,
      message: 'Filename split preview generated successfully',
      headers,
      rows,
      file_count: fileCount,
      leaf_count: grouped.size,
      unmatched_count: unmatchedCount,
    };
  }

  async exportXlsx(
    request: FilenameExportRequest
  ): Promise<{ buffer: Buffer; filename: string; file_count: number; leaf_count: number }> {
    const { targetPath, validFields, enabledFields } = this.validateRequest(
      request.path,
      request.fields,
      request
    );

    const layout = request.layout || 'grouped_sheets';
    const { grouped, fileCount } = this.collectLeafRows(targetPath, validFields);

    if (fileCount === 0) {
      throw new BadRequestException('未找到可导出的叶子文件夹文件');
    }

    const enabledFieldNames = enabledFields.map((b) => b.value.trim() || '未命名');

    const headers = ['文件夹名称', '原始文件名', ...enabledFieldNames];
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FileScope';
    workbook.created = new Date();

    const usedNames = new Set<string>();

    const applySheetStyle = (sheet: ExcelJS.Worksheet, rows: string[][]) => {
      sheet.views = [{ state: 'frozen', ySplit: 1 }];

      // Header Row
      const headerRow = sheet.addRow(headers);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E78' },
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

      // Data Rows
      for (const r of rows) {
        sheet.addRow(r);
      }

      // Column widths
      sheet.columns.forEach((column) => {
        let maxLen = 12;
        column.eachCell?.({ includeEmpty: true }, (cell) => {
          const val = cell.value ? String(cell.value) : '';
          maxLen = Math.max(maxLen, val.length + 3);
        });
        column.width = Math.min(maxLen, 45);
      });

      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: rows.length + 1, column: headers.length },
      };
    };

    if (layout === 'single_sheet') {
      const sheet = workbook.addWorksheet(this.safeSheetName('文件明细', usedNames));
      const allRows: string[][] = [];
      for (const k of Array.from(grouped.keys()).sort()) {
        allRows.push(...grouped.get(k)!);
      }
      applySheetStyle(sheet, allRows);
    } else {
      for (const k of Array.from(grouped.keys()).sort()) {
        const sheetName = path.basename(k) || '根目录';
        const sheet = workbook.addWorksheet(this.safeSheetName(sheetName, usedNames));
        applySheetStyle(sheet, grouped.get(k)!);
      }
    }

    const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    const downloadName = `filename_split_export_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return {
      buffer: Buffer.from(buffer),
      filename: downloadName,
      file_count: fileCount,
      leaf_count: grouped.size,
    };
  }
}
