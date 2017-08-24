'use strict';

import * as vscode from 'vscode';
import * as cache from './symbol-cache';
import * as parser from './symbol-parser';
import ZoneSymbol from './zone-symbol';

export function cacheCurrentWorkspace(): Thenable<ZoneSymbol[]> {
  return parser.parseCurrentWorkspace().then((fileSymbols) => {
    let allSymbols = [];
    fileSymbols.forEach(({ file, symbols }) => {
      cache.setForDocument(file, symbols);
      allSymbols = allSymbols.concat(symbols);
    })
    cache.setForCurrentWorkspace(allSymbols);
    return allSymbols;
  });
}

export function clearCache() {
  cache.clear();
}

export function getForCurrentWorkspace(): Thenable<ZoneSymbol[]> {
  let symbols = cache.getForCurrentWorkspace();
  console.log(`  (cache has ${symbols ? symbols.length : 'nothing'})`);
  return symbols !== null ?
    Promise.resolve(symbols) :
    cacheCurrentWorkspace();
}

export function getForDocument(document: vscode.TextDocument): Thenable<ZoneSymbol[]> {
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
  let symbols;
  if (shouldParse) {
    symbols = parser.parseDocument(document);
    cache.setForDocument(document, symbols);
  } else {
    symbols = fileCache.symbols;
  }
  return Promise.resolve(symbols);
}
