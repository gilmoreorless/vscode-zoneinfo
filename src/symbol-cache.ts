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
  hasDirtyFiles: boolean;
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

function getWorkspaceFolderForDocument(document: CacheKey): string | vscode.WorkspaceFolder {
  // BackCompat(no-multi-root)
  if (vscode.workspace.getWorkspaceFolder === undefined) {
    return vscode.workspace.rootPath;
  }
  // END BackCompat
  return vscode.workspace.getWorkspaceFolder(getUri(document));
}

function getCacheForWorkspaceFolder(folder: string | vscode.WorkspaceFolder): FolderCache {
  const path = typeof folder === 'string' ? folder : folder.uri.toString();
  let cache: FolderCache = fullCache.get(path);
  if (cache === undefined) {
    cache = {
      byFile: new Map(),
      all: [],
      isComplete: false,
      hasDirtyFiles: true,
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
  fullCache.set('[ALL]', symbols);
}

function setCacheForDocument(key: CacheKey, isDirty: boolean, symbols: ZoneSymbol[]) {
  getFolderCacheForDocument(key).byFile.set(makeKey(key), { isDirty, symbols });
}


// ----- Public API -----

export function clear() {
  fullCache = new Map();
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
  const cache = getCacheForWorkspace();
  if (!cache.isComplete) {
    return null;
  }
  return cache.all;
}

export function getForDocument(key: CacheKey): DocumentCache {
  return getCacheForWorkspace().byFile.get(makeKey(key));
}
