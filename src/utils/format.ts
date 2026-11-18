export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function getExtensionLabel(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) return 'FILE';
  return filename.slice(dot + 1).toUpperCase();
}

export function getExtensionGroup(filename: string): 'all' | 'documents' | 'data' | 'images' {
  const ext = getExtensionLabel(filename).toLowerCase();
  if (['pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'md'].includes(ext)) return 'documents';
  if (['csv', 'json', 'xml', 'xls', 'xlsx'].includes(ext)) return 'data';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'images';
  return 'all';
}
