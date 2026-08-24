/**
 * Extract canonical primary prefix from a filename.
 * Guarantees that files sharing the same primary prefix are deterministically grouped together.
 * Examples:
 *   - 'DOC_2024_report.docx' -> 'DOC_'
 *   - 'DOC_2023_summary.docx' -> 'DOC_'
 *   - 'DOC_manual.pdf' -> 'DOC_'
 *   - '财务部-2024-05.xlsx' -> '财务部-'
 *   - '【财务】2024报表.xlsx' -> '【财务】'
 *   - 'IMG0001.jpg' -> 'IMG'
 *   - '图档_2024_001.pdf' -> '图档_'
 */
export function extractPrimaryPrefix(filename: string): string {
  const lastDotIdx = filename.lastIndexOf('.');
  const nameWithoutExt = lastDotIdx > 0 ? filename.substring(0, lastDotIdx) : filename;

  // 1. Chinese bracketed tags like 【财务】 or （报表） or [项目]
  const bracketMatch = nameWithoutExt.match(/^([\u3010\uff08\[\(].*?[\u3011\uff09\]\)])/);
  if (bracketMatch && bracketMatch[1]) {
    return bracketMatch[1];
  }

  // 2. Delimiter-based primary token: e.g. "DOC_", "财务部-", "2024.", "PROJECT "
  const delimiterMatch = nameWithoutExt.match(/^([^_\-\. \t\u3010\u3011\uff08\uff09\(\)\[\]]+[_\-\. ])/);
  if (delimiterMatch && delimiterMatch[1]) {
    return delimiterMatch[1];
  }

  // 3. Alpha letters followed by digits: e.g. "IMG001" -> "IMG", "DOC2024" -> "DOC"
  const alphaDigitMatch = nameWithoutExt.match(/^([a-zA-Z]{2,})(?=[0-9])/);
  if (alphaDigitMatch && alphaDigitMatch[1]) {
    return alphaDigitMatch[1];
  }

  // 4. Digits followed by letters or Chinese characters: e.g. "2024Q1" -> "2024"
  const digitAlphaMatch = nameWithoutExt.match(/^([0-9]{2,4})(?=[a-zA-Z\u4e00-\u9fa5])/);
  if (digitAlphaMatch && digitAlphaMatch[1]) {
    return digitAlphaMatch[1];
  }

  return '';
}

export interface FileEntryMeta {
  filename: string;
  folderName: string;
  relPath: string;
  size: number;
  ext: string;
}

/**
 * Cluster files by their common shared primary prefix.
 * Files with identical prefixes are strictly unified together in the same cluster.
 */
export function clusterCommonPrefixes(
  files: FileEntryMeta[]
): Record<string, FileEntryMeta[]> {
  const clusters: Record<string, FileEntryMeta[]> = {};
  const unassigned: FileEntryMeta[] = [];

  for (const file of files) {
    const prefix = extractPrimaryPrefix(file.filename);
    if (prefix) {
      if (!clusters[prefix]) {
        clusters[prefix] = [];
      }
      clusters[prefix]!.push(file);
    } else {
      unassigned.push(file);
    }
  }

  if (unassigned.length > 0) {
    clusters['[无固定前缀]'] = unassigned;
  }

  return clusters;
}
