type WebkitFileSystemEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
  createReader?: () => {
    readEntries: (
      success: (entries: WebkitFileSystemEntry[]) => void,
      error?: (error: DOMException) => void,
    ) => void;
  };
};

type WebkitDataTransferItem = DataTransferItem & {
  webkitGetAsEntry?: () => WebkitFileSystemEntry | null;
};

function withRelativePath(file: File, relativePath: string): File {
  const cleanPath = relativePath.replace(/\\/g, "/");
  try {
    Object.defineProperty(file, "webkitRelativePath", { value: cleanPath, configurable: true });
    return file;
  } catch {
    const next = new File([file], file.name, { type: file.type, lastModified: file.lastModified });
    Object.defineProperty(next, "webkitRelativePath", { value: cleanPath, configurable: true });
    return next;
  }
}

function readEntryFile(entry: WebkitFileSystemEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!entry.file) {
      reject(new Error("Dropped entry is not a file"));
      return;
    }
    entry.file(resolve, reject);
  });
}

async function readDirectoryEntries(entry: WebkitFileSystemEntry): Promise<WebkitFileSystemEntry[]> {
  const reader = entry.createReader?.();
  if (!reader) return [];
  const entries: WebkitFileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<WebkitFileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) break;
    entries.push(...batch);
  }
  return entries;
}

async function filesFromEntry(entry: WebkitFileSystemEntry, prefix = ""): Promise<File[]> {
  const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) return [withRelativePath(await readEntryFile(entry), relativePath)];
  if (!entry.isDirectory) return [];
  const children = await readDirectoryEntries(entry);
  return (await Promise.all(children.map((child) => filesFromEntry(child, relativePath)))).flat();
}

export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const entries = Array.from(dataTransfer.items)
    .map((item) => (
      ((item as WebkitDataTransferItem).webkitGetAsEntry?.() ?? null) as WebkitFileSystemEntry | null
    ))
    .filter((entry): entry is WebkitFileSystemEntry => Boolean(entry));
  if (entries.length > 0) {
    return (await Promise.all(entries.map((entry) => filesFromEntry(entry)))).flat();
  }
  return Array.from(dataTransfer.files);
}
