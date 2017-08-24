'use strict';

import * as vscode from 'vscode';
import * as symbolCache from './symbol-cache';

export const PARSEABLE_FILENAMES = [
  'africa',
  'antarctica',
  'asia',
  'australasia',
  'backward',
  'backzone',
  'etcetera',
  'europe',
  'factory',
  'northamerica',
  'pacificnew',
  'southamerica',
  'systemv',
];

type ZoneSymbolType = 'Zone' | 'Rule' | 'Link';
export class ZoneSymbol {
  type: ZoneSymbolType;
  name: string;
  parent?: string;
  location: vscode.Location;

  public constructor(
    type: ZoneSymbolType, name: string, document: vscode.TextDocument, line: number, col: number
  ) {
    this.type = type;
    this.name = name;
    this.location = this.locationFromLineCol(name, document, line, col);
  }

  public toSymbolInformation(): vscode.SymbolInformation {
    return new vscode.SymbolInformation(
      this.name, vscode.SymbolKind.Field, this.parent || this.type, this.location
    );
  }

  private locationFromLineCol(
    name: string, document: vscode.TextDocument, line: number, col: number
  ): vscode.Location {
    let range = new vscode.Range(
      line, col,
      line, col + name.length
    );
    return new vscode.Location(document.uri, range);
  }
}

const rValidLine = /^(Zone|Rule|Link)/;
const rWhitespaceCapture = /(\s+)/;
const rWhitespaceOnly = /^\s+$/; // TODO: Use this when parsing line "tokens", some of which are whitespace-only

function sumLengths(arr: string[], beforeIndex: number) {
  return arr.slice(0, beforeIndex).reduce((sum, str) => sum + str.length, 0);
}

function parseLine(document: vscode.TextDocument, lineNumber: number): ZoneSymbol {
  let line = document.lineAt(lineNumber);
  let text = line.text;
  // Skip non-definition lines
  if (line.isEmptyOrWhitespace || line.text.indexOf('#') === 0 || !rValidLine.test(text)) {
    return null;
  }
  const parts = text.split(rWhitespaceCapture);
  const type = parts[0];
  if (type === 'Zone' || type === 'Rule') {
    return new ZoneSymbol(type, parts[2], document, lineNumber, sumLengths(parts, 2));
  }
  if (type === 'Link') {
    let symbol = new ZoneSymbol(type, parts[4], document, lineNumber, sumLengths(parts, 4));
    symbol.parent = `Link(${parts[2]})`;
    return symbol;
  }
  return null;
}

export function parseDocument(document: vscode.TextDocument): ZoneSymbol[] {
  console.log(`--parseDocument: ${document.fileName}--`);
  let _start = Date.now();
  const lineCount = document.lineCount;
  let symbols = [];
  for (let i = 0; i < lineCount; i++) {
    let symbol = parseLine(document, i);
    if (symbol) {
      symbols.push(symbol);
    }
  }
  console.log(`  TOOK ${Date.now() - _start}ms`);
  symbolCache.setForDocument(document, symbols);
  return symbols;
}

export function parseCurrentWorkspace(): Thenable<ZoneSymbol[]> {
  let filenames = `{${PARSEABLE_FILENAMES.join(',')}}`;
  console.log('--parseCurrentWorkspace: finding ' + filenames);
  let _start = Date.now();
  return vscode.workspace.findFiles(filenames).then((files: vscode.Uri[]) => {
    console.log(`  TOOK ${Date.now() - _start}ms`);
    return Promise.all(files.map((file: vscode.Uri) => {
      let existing = symbolCache.getForDocument(file);
      if (existing !== undefined) {
        console.log(`  (${file} from cache)`);
        return existing;
      }
      console.log(`  (going to parse ${file})`);
      return vscode.workspace.openTextDocument(file).then((doc: vscode.TextDocument) =>
        parseDocument(doc)
      )
    }))
  }).then((results: ZoneSymbol[][]): ZoneSymbol[] => {
    console.log('--DONE PARSING WORKSPACE--', results.length);
    console.log(`  TOOK ${Date.now() - _start}ms`);
    let combined = results.reduce((all, sub) => all.concat(sub), []);
    symbolCache.setForCurrentWorkspace(combined);
    return combined;
  });
}
