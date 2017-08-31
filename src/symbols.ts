'use strict';

import * as vscode from 'vscode';
import * as cache from './symbol-cache';
import * as parser from './symbol-parser';
import { ZoneSymbol, ZoneSymbolTextSpan } from './zone-symbol';

export async function cacheCurrentWorkspace(): Promise<ZoneSymbol[]> {
  const fileSymbols = await parser.parseCurrentWorkspace();
  let allSymbols = [];
  fileSymbols.forEach(({ file, symbols }) => {
    cache.setForDocument(file, symbols);
    allSymbols = allSymbols.concat(symbols);
  })
  cache.setForCurrentWorkspace(allSymbols);
  return allSymbols;
}

export function clearCache() {
  cache.clear();
}

export async function getForCurrentWorkspace(): Promise<ZoneSymbol[]> {
  let symbols = cache.getForCurrentWorkspace();
  console.log(`  (cache has ${symbols ? symbols.length : 'nothing'})`);
  if (symbols === null) {
    return cacheCurrentWorkspace();
  }
  return Promise.resolve(symbols);
}

export async function getForDocument(document: vscode.TextDocument): Promise<ZoneSymbol[]> {
  let fileCache = cache.getForDocument(document);
  console.log(`--getForDocument: ${document.fileName}--`);
  let shouldParse = !fileCache || fileCache.isDirty;
  if (fileCache) {
    console.log(`  (cache has ${fileCache.symbols.length})`);
    if (fileCache.isDirty) {
      console.log(`  (...but file is dirty)`);
    }
  } else {
    console.log(`  (cache has nothing)`);
  }
  if (shouldParse) {
    return cacheDocument(document);
  }
  return Promise.resolve(fileCache.symbols);
}

export async function cacheDocument(document: vscode.TextDocument): Promise<ZoneSymbol[]> {
  console.log(`--cacheDocument: ${document.fileName}--`);
  const symbols = parser.parseDocument(document);
  console.log(`  (found ${symbols.length} symbols)`);
  cache.setForDocument(document, symbols);
  return Promise.resolve(symbols);
}

export async function getForName(name: string): Promise<ZoneSymbol[]> {
  const allSymbols = await getForCurrentWorkspace();
  return allSymbols.filter(s => s.name.text === name);
}

export async function getSpanLinksToName(name: string): Promise<ZoneSymbolTextSpan[]> {
  const allSymbols = await getForCurrentWorkspace();
  let _start = Date.now();
  let res = allSymbols.map((symbol) => {
    if (symbol.name.text === name) {
      return [symbol.name];
    }
    return symbol.references.filter(ref => ref.text === name);
  }).reduce((all, spans) => all.concat(spans), [])
  return res;
}

export async function getSpanForDocumentPosition(document: vscode.TextDocument, position: vscode.Position): Promise<ZoneSymbolTextSpan> {
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

export function markDocumentDirty(document: vscode.TextDocument) {
  cache.setDocumentDirtyState(document, true);
}

export function unique(symbols: ZoneSymbol[]): ZoneSymbol[] {
  let used = new Set();
  return symbols.filter(symbol => {
    let key = [symbol.type, symbol.name.text].join(':');
    if (used.has(key)) {
      return false;
    }
    used.add(key);
    return true;
  });
}
