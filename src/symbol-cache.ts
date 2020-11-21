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


/**************************************\
|              PUBLIC API              |
\**************************************/

export function getForDocument(document: vscode.TextDocument): CachedDocument | undefined {
  return documentCache.get(makeKey(document));
}

export function setForDocument(document: vscode.TextDocument, hash: string, symbols: ZoneSymbol[]): void {
  documentCache.set(makeKey(document), { hash, symbols });
}

export function getForFolder(folder: FolderKey): CachedGroup | undefined {
  const path = folderPath(folder);
  return groupCache.get(path);
}

export function setForFolder(folder: FolderKey, symbols: ZoneSymbol[]): void {
  const path = folderPath(folder);
  groupCache.set(path, { symbols });
}

export function getForWorkspace(): CachedGroup | undefined {
  return groupCache.get('[WORKSPACE]');
}

export function setForWorkspace(symbols: ZoneSymbol[]): void {
  groupCache.set('[WORKSPACE]', { symbols });
}
