'use strict';

import * as vscode from 'vscode';
import { ZoneSymbol } from './zone-symbol';

let fullCache = new Map();

type CacheKey = vscode.Uri | vscode.TextDocument;

export type DocumentCache = {
  isDirty: boolean;
  symbols: ZoneSymbol[];
};

export type FolderCache = {
  byFile: Map<string, DocumentCache>;
  all: ZoneSymbol[];
  isComplete: boolean;
};


// ----- Internal helpers -----

function getUri(file: CacheKey): vscode.Uri {
  if ((<vscode.TextDocument>file).uri) {
    file = (<vscode.TextDocument>file).uri;
  }
  return <vscode.Uri>file;
}

function makeKey(file: CacheKey): string {
  return getUri(file).toString();
}

function folderPath(folder: string | vscode.WorkspaceFolder): string {
  if (folder === undefined) {
    return '[NO FOLDER]';
  }
  if (typeof folder === 'string') {
    return folder;
  }
  return folder.uri.toString();
}

function getCacheForCurrentWorkspace(): FolderCache {
  return fullCache.get('[ALL]') || {};
}

function getCacheForWorkspaceFolder(folder: string | vscode.WorkspaceFolder): FolderCache {
  const path = folderPath(folder);
  let cache: FolderCache = fullCache.get(path);
  if (cache === undefined) {
    cache = {
      byFile: new Map(),
      all: [],
      isComplete: folder === undefined,
    };
    fullCache.set(path, cache);
  }
  return cache;
}

function getFolderCacheForDocument(key: CacheKey): FolderCache {
  // BackCompat(no-multi-root)
  if (vscode.workspace.getWorkspaceFolder === undefined) {
    return getCacheForWorkspaceFolder(vscode.workspace.rootPath);
  }
  // END BackCompat
  const folder = vscode.workspace.getWorkspaceFolder(getUri(key));
  return getCacheForWorkspaceFolder(folder);
}

function updateAllForWorkspaceFolder(folder: string | vscode.WorkspaceFolder): ZoneSymbol[] {
  let fullCache = getCacheForWorkspaceFolder(folder);
  if (fullCache.isComplete) {
    let allSymbols = [];
    for (let docCache of fullCache.byFile.values()) {
      allSymbols = allSymbols.concat(docCache.symbols);
    }
    fullCache.all = allSymbols;
  }
  return fullCache.all;
}

function setCacheForCurrentWorkspace(symbols: ZoneSymbol[]) {
  fullCache.set('[ALL]', {
    byFile: new Map(),
    all: symbols,
    isComplete: true,
  });
}

function setCacheForDocument(key: CacheKey, isDirty: boolean, symbols: ZoneSymbol[]) {
  getFolderCacheForDocument(key).byFile.set(makeKey(key), { isDirty, symbols });
}


// ----- Public API -----

export function clear() {
  fullCache.clear();
}

export function clearForWorkspaceFolder(folder: string | vscode.WorkspaceFolder) {
  fullCache.delete(folderPath(folder));
}

export function getWorkspaceFolderForDocument(document: CacheKey): string | vscode.WorkspaceFolder {
  // BackCompat(no-multi-root)
  if (vscode.workspace.getWorkspaceFolder === undefined) {
    return vscode.workspace.rootPath;
  }
  // END BackCompat
  return vscode.workspace.getWorkspaceFolder(getUri(document));
}

export function updateAllForCurrentWorkspace(): ZoneSymbol[] {
  let folders = vscode.workspace.workspaceFolders;
  let allSymbols: ZoneSymbol[] = [];
  // BackCompat(no-multi-root)
  if (folders === undefined) {
    allSymbols = [].concat(getCacheForWorkspaceFolder(vscode.workspace.rootPath).all);
  } else {
  // END BackCompat
    allSymbols = folders.reduce((all: ZoneSymbol[], folder) =>
      all.concat(getCacheForWorkspaceFolder(folder).all), []);
  }
  setCacheForCurrentWorkspace(allSymbols);
  return allSymbols;
}

export function setForWorkspaceFolder(folder: string, symbols: ZoneSymbol[]) {
  let cache = getCacheForWorkspaceFolder(folder);
  cache.all = symbols;
  cache.isComplete = true;
}

export function setForDocument(key: CacheKey, symbols: ZoneSymbol[]) {
  setCacheForDocument(key, false, symbols);
  updateAllForWorkspaceFolder(getWorkspaceFolderForDocument(key));
}

export function setDocumentDirtyState(key: CacheKey, isDirty: boolean) {
  const docCache = getForDocument(key);
  setCacheForDocument(key, isDirty, docCache && docCache.symbols);
}

export function getForCurrentWorkspace(): ZoneSymbol[] {
  const cache = getCacheForCurrentWorkspace();
  if (!cache.isComplete) {
    return null;
  }
  return cache.all;
}

export function getForWorkspaceFolder(folder: string | vscode.WorkspaceFolder): ZoneSymbol[] {
  const cache = getCacheForWorkspaceFolder(folder);
  if (!cache.isComplete) {
    return null;
  }
  return cache.all;
}

export function getForDocument(key: CacheKey): DocumentCache {
  return getFolderCacheForDocument(key).byFile.get(makeKey(key));
}
