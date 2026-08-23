import ExcelJS from 'exceljs';

const INVALID_SHEET_CHARS = /[\\/*?:\[\]]/g;
const MAX_SHEET_NAME_LENGTH = 31;

function safeSheetName(rawName: string, usedNames: Set<string>): string {
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

export async function exportLocalSplitExcel(
  headers: string[],
  rows: string[][],
  layout: 'grouped_sheets' | 'single_sheet' = 'grouped_sheets'
): Promise<{ blob: Blob; filename: string }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FileScope Web';
  workbook.created = new Date();

  const usedNames = new Set<string>();

  const applySheetStyle = (sheet: ExcelJS.Worksheet, sheetRows: string[][]) => {
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
    for (const r of sheetRows) {
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
      to: { row: sheetRows.length + 1, column: headers.length },
    };
  };

  if (layout === 'single_sheet') {
    const sheet = workbook.addWorksheet(safeSheetName('文件明细', usedNames));
    applySheetStyle(sheet, rows);
  } else {
    // Group rows by relative directory (column 0)
    const grouped = new Map<string, string[][]>();
    for (const row of rows) {
      const relDir = row[0] || '根目录';
      if (!grouped.has(relDir)) grouped.set(relDir, []);
      grouped.get(relDir)!.push(row);
    }

    for (const [relDir, dirRows] of grouped.entries()) {
      const parts = relDir.split('/');
      const sheetName = parts[parts.length - 1] || '根目录';
      const sheet = workbook.addWorksheet(safeSheetName(sheetName, usedNames));
      applySheetStyle(sheet, dirRows);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const filename = `filename_split_export_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return { blob, filename };
}
