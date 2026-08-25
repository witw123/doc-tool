export interface InferredColumn {
  id: string;
  sampleValue: string;
  columnName: string;
  regexPart: string;
}

export interface InferredSplitResult {
  pattern: string;
  columns: string[];
  segments: InferredColumn[];
}

/**
 * Automatically infer split segments, column names, and regex pattern from a sample filename.
 */
export function inferSegmentsFromSample(sampleFilename: string): InferredSplitResult {
  const raw = (sampleFilename || '').trim();
  if (!raw) {
    return {
      pattern: '^(.+)$',
      columns: ['文件名'],
      segments: [{ id: 'c_1', sampleValue: '', columnName: '文件名', regexPart: '(.+)' }],
    };
  }

  // Strip file extension if present
  const lastDot = raw.lastIndexOf('.');
  const stem = lastDot > 0 ? raw.substring(0, lastDot) : raw;

  const segments: InferredColumn[] = [];

  // Special Industry Pattern 1: Power inspection naming with compound voltage & line & branch
  // e.g. 10kV范西292线宏伟支线_右横担_柱瓶-绝缘子破损
  const powerMatch = stem.match(/^(\d+kV)(.*?线)(.*?支线)_(.*?)_(.+)$/);
  if (powerMatch) {
    segments.push(
      { id: 'c_1', sampleValue: powerMatch[1]!, columnName: '电压等级', regexPart: '(\\d+kV)' },
      { id: 'c_2', sampleValue: powerMatch[2]!, columnName: '主线路名', regexPart: '(.*?线)' },
      { id: 'c_3', sampleValue: powerMatch[3]!, columnName: '支线名称', regexPart: '(.*?支线)' },
      { id: 'c_4', sampleValue: powerMatch[4]!, columnName: '部件位置', regexPart: '(.*?)' },
      { id: 'c_5', sampleValue: powerMatch[5]!, columnName: '缺陷现象', regexPart: '(.+)' }
    );
    return {
      pattern: '^(\\d+kV)(.*?线)(.*?支线)_(.*?)_(.+)$',
      columns: segments.map((s) => s.columnName),
      segments,
    };
  }

  // Power inspection without voltage prefix
  // e.g. 范西292线宏伟支线_右横担_柱瓶-绝缘子破损
  const powerMatch2 = stem.match(/^(.*?线)(.*?支线)_(.*?)_(.+)$/);
  if (powerMatch2) {
    segments.push(
      { id: 'c_1', sampleValue: powerMatch2[1]!, columnName: '主线路名', regexPart: '(.*?线)' },
      { id: 'c_2', sampleValue: powerMatch2[2]!, columnName: '支线名称', regexPart: '(.*?支线)' },
      { id: 'c_3', sampleValue: powerMatch2[3]!, columnName: '部件位置', regexPart: '(.*?)' },
      { id: 'c_4', sampleValue: powerMatch2[4]!, columnName: '缺陷现象', regexPart: '(.+)' }
    );
    return {
      pattern: '^(.*?线)(.*?支线)_(.*?)_(.+)$',
      columns: segments.map((s) => s.columnName),
      segments,
    };
  }

  // General Delimiter-based splitting (supports _ or -)
  const delimiter = stem.includes('_') ? '_' : stem.includes('-') ? '-' : ' ';
  const parts = stem.split(delimiter);

  if (parts.length > 1) {
    let patternParts: string[] = [];

    parts.forEach((p, idx) => {
      let colName = `字段${idx + 1}`;
      let regexP = '(.*?)';

      if (/^\d{4}[-_]?\d{2}[-_]?\d{2}$/.test(p)) {
        colName = '日期';
        regexP = '(\\d{4}[-_]?\\d{2}[-_]?\\d{2})';
      } else if (/^[A-Z0-9#]+$/.test(p) && idx === 0) {
        colName = '项目编号';
        regexP = '([A-Z0-9#]+)';
      } else if (/\d+#楼/.test(p)) {
        colName = '楼栋编号';
        regexP = '(\\d+#楼)';
      } else if (idx === 0) {
        colName = '项目/分类';
      } else if (idx === parts.length - 1) {
        colName = '名称/说明';
        regexP = '(.+)';
      }

      segments.push({
        id: `c_${idx + 1}`,
        sampleValue: p,
        columnName: colName,
        regexPart: regexP,
      });

      patternParts.push(regexP);
    });

    const escapedDelim = delimiter === '-' ? '\\-' : delimiter;
    const finalPattern = `^${patternParts.join(escapedDelim)}$`;

    return {
      pattern: finalPattern,
      columns: segments.map((s) => s.columnName),
      segments,
    };
  }

  // Fallback single column
  segments.push({
    id: 'c_1',
    sampleValue: stem,
    columnName: '文件名',
    regexPart: '(.+)',
  });

  return {
    pattern: '^(.+)$',
    columns: ['文件名'],
    segments,
  };
}
