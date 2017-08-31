'use strict';

import * as vscode from 'vscode';
import { ZoneSymbol } from './zone-symbol';

// TODO: Use workspaceContext.workspaceState() to properly store this
let fullCache = new Map();

type CacheKey = string | vscode.Uri | vscode.TextDocument;
export type DocumentCache = {
  isDirty: boolean;
  symbols: ZoneSymbol[];
};


// ----- Internal helpers -----

function makeKey(file: CacheKey): string {
  if (typeof file === 'string') {
    return file;
  }
  if ((<vscode.TextDocument>file).uri) {
    file = (<vscode.TextDocument>file).uri;
  }
  return file.toString();
}

function getCacheForWorkspace(workspace?: string) {
  if (workspace === undefined) {
    workspace = vscode.workspace.rootPath;
  }
  let cache = fullCache.get(workspace);
  if (cache === undefined) {
    cache = {
      byFile: new Map(),
      all: [],
      isComplete: false,
      hasDirtyFiles: true,
    };
    fullCache.set(workspace, cache);
  }
  return cache;
}

function updateAllForWorkspace() {
  let fullCache = getCacheForWorkspace();
  if (fullCache.isComplete) {
    console.log('--updateAllForWorkspace()--');
    console.log('  (updating all symbols from documents)');
    let allSymbols = [];
    for (let docCache of fullCache.byFile.values()) {
      allSymbols = allSymbols.concat(docCache.symbols);
    }
    fullCache.all = allSymbols;
  }
}

function setCacheForDocument(key: CacheKey, isDirty: boolean, symbols: ZoneSymbol[]) {
  getCacheForWorkspace().byFile.set(makeKey(key), { isDirty, symbols });
}


// ----- Public API -----

export function clear() {
  fullCache = new Map();
}

export function setForCurrentWorkspace(symbols: ZoneSymbol[]) {
  let cache = getCacheForWorkspace();
  cache.all = symbols;
  cache.isComplete = true;
}

export function setForDocument(key: CacheKey, symbols: ZoneSymbol[]) {
  setCacheForDocument(key, false, symbols);
  updateAllForWorkspace();
}

export function setDocumentDirtyState(key: CacheKey, isDirty: boolean) {
  let docCache = getForDocument(key);
  setCacheForDocument(key, isDirty, docCache && docCache.symbols);
}

export function getForCurrentWorkspace(): ZoneSymbol[] {
  let cache = getCacheForWorkspace();
  if (!cache.isComplete) {
    return null;
  }
  return cache.all;
}

export function getForDocument(key: CacheKey): DocumentCache {
  return getCacheForWorkspace().byFile.get(makeKey(key));
}
