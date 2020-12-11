import * as vscode from 'vscode';
import { ZoneSymbol } from './zone-symbol';

type CacheKey = vscode.Uri | vscode.TextDocument;
type FolderKey = string | vscode.WorkspaceFolder;

interface CachedDocument {
  hash: string;
  symbols: ZoneSymbol[];
}

interface CachedGroup {
  symbols: ZoneSymbol[];
}

let documentCache: Map<string, CachedDocument> = new Map();
let groupCache: Map<string, CachedGroup> = new Map();
let folderDocs: Map<string, string[]> = new Map();


/**************************************\
|           INTERNAL HELPERS           |
\**************************************/

function getUri(file: CacheKey): vscode.Uri {
  return ('uri' in file) ? file.uri : file;
}

function makeKey(file: CacheKey): string {
  return getUri(file).toString();
}

function folderPath(folder: string | vscode.WorkspaceFolder): string {
  return (typeof folder === 'string') ? folder : folder.uri.toString();
}

function notEmpty<T>(value: T | undefined): value is Exclude<T, null> {
  return value != null;
}

/**
 * Reset a folder's cache by combining all document symbols within that folder.
 */
function syncDocumentsToFolder(folder: FolderKey): boolean {
  const docKeys = folderDocs.get(folderPath(folder));
  // Skip if the folder hasn't been fully parsed yet
  if (!getForFolder(folder) || !docKeys) {
    return false;
  }

  const allSymbols = docKeys.flatMap((key) => documentCache.get(key)?.symbols).filter(notEmpty);
  setForFolder(folder, allSymbols);
  return true;
}

/**
 * Reset workspace cache by combining all folder symbols.
 */
function syncFoldersToWorkspace(): boolean {
  // Skip if the workspace hasn't been fully parsed yet
  if (!getForWorkspace()) {
    return false;
  }

  const allSymbols = Array.from(groupCache.entries())
    .filter(([key]) => key !== '[WORKSPACE]')
    .flatMap(([, folder]) => folder.symbols);
  setForWorkspace(allSymbols);
  return true;
}


/**************************************\
|              PUBLIC API              |
\**************************************/

export function getForDocument(document: vscode.TextDocument): CachedDocument | undefined {
  return documentCache.get(makeKey(document));
}

export function setForDocument(document: vscode.TextDocument, hash: string, symbols: ZoneSymbol[]): void {
  documentCache.set(makeKey(document), { hash, symbols });
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (folder) {
    syncDocumentsToFolder(folder);
  }
}

export function getForFolder(folder: FolderKey): CachedGroup | undefined {
  const path = folderPath(folder);
  return groupCache.get(path);
}

export function setForFolder(folder: FolderKey, symbols: ZoneSymbol[]): void {
  const path = folderPath(folder);
  groupCache.set(path, { symbols });
  syncFoldersToWorkspace();
}

export function removeForFolder(folder: FolderKey): void {
  const path = folderPath(folder);
  groupCache.delete(path);
  // Clear out any cached documents for that folder too
  let documents = folderDocs.get(path);
  if (documents) {
    documents.forEach((doc) => documentCache.delete(doc));
  }
  syncFoldersToWorkspace();
}

export function getForWorkspace(): CachedGroup | undefined {
  return groupCache.get('[WORKSPACE]');
}

export function setForWorkspace(symbols: ZoneSymbol[]): void {
  groupCache.set('[WORKSPACE]', { symbols });
}

/**
 * Associate documents with a folder, to help with synchronishing the cached folder symbols.
 */
export function setDocumentsForFolder(folder: FolderKey, documents: CacheKey[]): void {
  folderDocs.set(folderPath(folder), documents.map(makeKey));
}
