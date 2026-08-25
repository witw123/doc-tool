import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import {
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
    rawPattern: string,
    rawColumns: string[]
  ): { targetPath: string; pattern: string; columns: string[]; regex: RegExp } {
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

    const pattern = (rawPattern || '').trim();
    if (!pattern) {
      throw new BadRequestException('拆分正则表达式规则不能为空');
    }

    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch (err: any) {
      throw new BadRequestException(`正则表达式格式错误: ${err.message}`);
    }

    const columns = Array.isArray(rawColumns) && rawColumns.length > 0
      ? rawColumns
      : ['提取列1'];

    return { targetPath, pattern, columns, regex };
  }

  private collectLeafRows(
    targetPath: string,
    regex: RegExp,
    columns: string[]
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
          const lastDotIdx = filename.lastIndexOf('.');
          const stem = lastDotIdx > 0 ? filename.substring(0, lastDotIdx) : filename;

          const match = stem.match(regex);
          if (match) {
            const outputValues: string[] = [];
            for (let i = 0; i < columns.length; i++) {
              const val = match[i + 1] !== undefined ? match[i + 1] : '';
              outputValues.push(val);
            }
            rows.push([folderName, filename, ...outputValues]);
          } else {
            unmatchedCount += 1;
            const outputValues = [stem, ...Array(Math.max(0, columns.length - 1)).fill('')];
            rows.push([folderName, filename, ...outputValues]);
          }
          fileCount += 1;
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
    const { targetPath, columns, regex } = this.validateRequest(
      request.path,
      request.pattern,
      request.columns
    );

    const { grouped, fileCount, unmatchedCount } = this.collectLeafRows(targetPath, regex, columns);

    if (fileCount === 0) {
      throw new BadRequestException('未找到可预览的叶子文件夹文件');
    }

    const headers = ['文件夹名称', '原始文件名', ...columns];
    const rows: string[][] = [];

    const sortedKeys = Array.from(grouped.keys()).sort();
    for (const k of sortedKeys) {
      rows.push(...grouped.get(k)!);
    }

    return {
      success: true,
      message: '拆分预览生成成功',
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
    const { targetPath, columns, regex } = this.validateRequest(
      request.path,
      request.pattern,
      request.columns
    );

    const layout = request.layout || 'grouped_sheets';
    const { grouped, fileCount } = this.collectLeafRows(targetPath, regex, columns);

    if (fileCount === 0) {
      throw new BadRequestException('未找到可导出的叶子文件夹文件');
    }

    const headers = ['文件夹名称', '原始文件名', ...columns];
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
