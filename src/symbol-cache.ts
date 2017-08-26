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
    };
    fullCache.set(workspace, cache);
  }
  return cache;
}

export function clear() {
  // TODO: Clear for just a workspace/file?
  fullCache = new Map();
}

export function setForCurrentWorkspace(symbols: ZoneSymbol[]) {
  let cache = getCacheForWorkspace();
  cache.all = symbols;
  cache.isComplete = true;
}

export function setForDocument(key: CacheKey, symbols: ZoneSymbol[]) {
  getCacheForWorkspace().byFile.set(makeKey(key), {
    isDirty: false,
    symbols
  });
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
