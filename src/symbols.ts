'use strict';

import * as vscode from 'vscode';
import * as cache from './symbol-cache';
import * as parser from './symbol-parser';
import { ZoneSymbol, ZoneSymbolTextSpan } from './zone-symbol';

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

export function getForName(name: string): Thenable<ZoneSymbol[]> {
  // TODO: Maybe cache this
  return getForCurrentWorkspace().then((allSymbols) => {
    return allSymbols.filter(s => s.name.text === name);
  });
}

export function getSpanLinksToName(name: string): Thenable<ZoneSymbolTextSpan[]> {
  return getForCurrentWorkspace().then((allSymbols: ZoneSymbol[]) => {
    let _start = Date.now();
    let res = allSymbols.map((symbol) => {
      if (symbol.name.text === name) {
        return [symbol.name];
      }
      return symbol.references.filter(ref => ref.text === name);
    }).reduce((all, spans) => all.concat(spans), [])
    return res;
  });
}

export function getSpanForDocumentPosition(document: vscode.TextDocument, position: vscode.Position): Thenable<ZoneSymbolTextSpan> {
  return getForDocument(document).then((symbols) => {
    for (let symbol of symbols) {
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
  });
}
