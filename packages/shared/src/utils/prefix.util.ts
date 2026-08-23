/**
 * Extract candidate prefix fields from a filename
 * Examples:
 *   - 'DOC_2024_report.docx' -> ['DOC_', 'DOC_2024_']
 *   - 'IMG_RAW_0001.jpg' -> ['IMG_', 'IMG_RAW_']
 *   - 'order-2024-01.pdf' -> ['order-']
 *   - 'REPORT 2024.pdf' -> ['REPORT ']
 *   - 'IMG0001.jpg' -> ['IMG']
 *   - '【财务】2024报表.xlsx' -> ['【财务】']
 *   - '2024_Q1.xlsx' -> ['2024_']
 */
export function extractCandidatePrefixes(filename: string): string[] {
  const lastDotIdx = filename.lastIndexOf('.');
  const nameWithoutExt = lastDotIdx > 0 ? filename.substring(0, lastDotIdx) : filename;
  const candidates: string[] = [];

  // 1. Delimiter-based tokens (_, -, ., space, brackets)
  const delimiters = /([_\-\. \u3010\u3011\uff08\uff09\(\)\[\]])/;
  const parts = nameWithoutExt.split(delimiters);

  if (parts.length >= 3) {
    const firstToken = parts[0] + parts[1];
    if (firstToken.length >= 2) {
      candidates.push(firstToken);
    }

    if (parts.length >= 5) {
      const secondToken = parts[0] + parts[1] + parts[2] + parts[3];
      if (secondToken.length >= 4 && !secondToken.endsWith('.')) {
        candidates.push(secondToken);
      }
    }
  }

  // 2. Chinese bracketed tags like 【财务】 or （报表）
  const chineseMatch = nameWithoutExt.match(/^([\u3010\uff08\[\(].*?[\u3011\uff09\]\)])/);
  if (chineseMatch && chineseMatch[1] && !candidates.includes(chineseMatch[1])) {
    candidates.push(chineseMatch[1]);
  }

  // 3. Alpha prefix followed by digits (e.g. 'IMG0001' -> 'IMG')
  const alphaDigit = nameWithoutExt.match(/^([a-zA-Z]{2,})(?=[0-9])/);
  if (alphaDigit && alphaDigit[1] && !candidates.includes(alphaDigit[1])) {
    candidates.push(alphaDigit[1]);
  }

  // 4. Year/Date prefix e.g. 2024_ or 2024-
  const yearPrefix = nameWithoutExt.match(/^([0-9]{4}[_\-\.])/);
  if (yearPrefix && yearPrefix[1] && !candidates.includes(yearPrefix[1])) {
    candidates.push(yearPrefix[1]);
  }

  return candidates;
}

export interface FileEntryMeta {
  filename: string;
  relPath: string;
  size: number;
  ext: string;
}

/**
 * Cluster files by their common shared prefix fields.
 */
export function clusterCommonPrefixes(
  files: FileEntryMeta[]
): Record<string, FileEntryMeta[]> {
  const prefixCandidatesCount: Record<string, number> = {};

  for (const file of files) {
    const cands = extractCandidatePrefixes(file.filename);
    for (const c of cands) {
      prefixCandidatesCount[c] = (prefixCandidatesCount[c] || 0) + 1;
    }
  }

  // Sort candidate prefixes by frequency and specificity (length)
  const validPrefixes = Object.keys(prefixCandidatesCount).sort((a, b) => {
    const countA = prefixCandidatesCount[a] ?? 0;
    const countB = prefixCandidatesCount[b] ?? 0;
    const multiA = countA > 1 ? 1 : 0;
    const multiB = countB > 1 ? 1 : 0;
    if (multiA !== multiB) return multiB - multiA;
    if (b.length !== a.length) return b.length - a.length;
    return countB - countA;
  });

  const clusters: Record<string, FileEntryMeta[]> = {};
  const unassigned: FileEntryMeta[] = [];

  for (const item of files) {
    let assigned = false;
    for (const p of validPrefixes) {
      if (item.filename.startsWith(p)) {
        if (!clusters[p]) clusters[p] = [];
        clusters[p]!.push(item);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      unassigned.push(item);
    }
  }

  if (unassigned.length > 0) {
    clusters['[无固定前缀]'] = unassigned;
  }

  return clusters;
}
