'use strict';

import * as vscode from 'vscode';
import * as cache from './symbol-cache';
import * as parser from './symbol-parser';
import { ZoneSymbol, ZoneSymbolTextSpan } from './zone-symbol';

export async function cacheCurrentWorkspace(): Promise<ZoneSymbol[]> {
  const start = Date.now();
  const folders = await parser.parseCurrentWorkspace();
  folders.forEach(({ path, documents }) => {
    let folderSymbols: ZoneSymbol[] = [];
    documents.forEach(({ file, symbols }) => {
      cache.setForDocument(file, symbols);
      folderSymbols = folderSymbols.concat(symbols);
    });
    cache.setForWorkspaceFolder(path, folderSymbols);
  });
  let res = cache.updateAllForCurrentWorkspace();
  const end = Date.now();
  console.log(`CACHING TOOK ${end - start}`);
  return res;
}

export async function cacheWorkspaceFolder(folder: vscode.WorkspaceFolder): Promise<ZoneSymbol[]> {
  const parsed = await parser.parseWorkspaceFolder(folder);
  let folderSymbols: ZoneSymbol[] = [];
  parsed.documents.forEach(({ file, symbols }) => {
    cache.setForDocument(file, symbols);
    folderSymbols = folderSymbols.concat(symbols);
  });
  cache.setForWorkspaceFolder(parsed.path, folderSymbols);
  return folderSymbols;
}

export function syncWorkspaceCache(): void {
  cache.updateAllForCurrentWorkspace();
}

export function clearCache(): void {
  cache.clear();
}

export function clearWorkspaceFolderCache(folder: vscode.WorkspaceFolder): void {
  cache.clearForWorkspaceFolder(folder);
}

export async function getForCurrentWorkspace(): Promise<ZoneSymbol[]> {
  console.log('[getForCurrentWorkspace: known documents]', vscode.workspace.textDocuments);
  const symbols = cache.getForCurrentWorkspace();
  if (symbols === null) {
    return cacheCurrentWorkspace();
  }
  return Promise.resolve(symbols);
}

export async function getForDocument(document: vscode.TextDocument): Promise<ZoneSymbol[]> {
  const fileCache = cache.getForDocument(document);
  const shouldParse = !fileCache || fileCache.isDirty;
  if (shouldParse) {
    return cacheDocument(document);
  }
  return Promise.resolve(fileCache.symbols);
}

export async function cacheDocument(document: vscode.TextDocument): Promise<ZoneSymbol[]> {
  const symbols = parser.parseDocument(document);
  cache.setForDocument(document, symbols);
  return Promise.resolve(symbols);
}

export async function getForSpan(span: ZoneSymbolTextSpan): Promise<ZoneSymbol[]> {
  const folder = cache.getWorkspaceFolderForDocument(span.location.uri);
  const allSymbols = await cache.getForWorkspaceFolder(folder);
  return allSymbols.filter((s) => s.name.text === span.text);
}

export async function getSpanLinksToName(span: ZoneSymbolTextSpan): Promise<ZoneSymbolTextSpan[]> {
  const folder = cache.getWorkspaceFolderForDocument(span.location.uri);
  const allSymbols = await cache.getForWorkspaceFolder(folder);
  return allSymbols
    .map((symbol) => {
      if (symbol.name.text === span.text) {
        return [symbol.name];
      }
      return symbol.references.filter((ref) => ref.text === span.text);
    })
    .reduce((all, spans) => all.concat(spans), []);
}

export async function getSpanForDocumentPosition(
  document: vscode.TextDocument,
  position: vscode.Position,
): Promise<ZoneSymbolTextSpan> {
  const docSymbols = await getForDocument(document);
  for (let symbol of docSymbols) {
    if (symbol.name.location.range.contains(position)) {
      return symbol.name;
    }
    for (let ref of symbol.references) {
      if (ref.location.range.contains(position)) {
        return ref;
      }
    }
  }
  return null;
}

export function markDocumentDirty(document: vscode.TextDocument): void {
  cache.setDocumentDirtyState(document, true);
}

export function unique(symbols: ZoneSymbol[]): ZoneSymbol[] {
  let used = new Set();
  return symbols.filter((symbol) => {
    const key = [symbol.type, symbol.name.text, symbol.name.location.uri.toString()].join(':');
    if (used.has(key)) {
      return false;
    }
    used.add(key);
    return true;
  });
}
