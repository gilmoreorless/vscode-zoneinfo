'use strict';

import * as vscode from 'vscode';
import { ZoneSymbol, ZoneSymbolLineRef, ZoneSymbolTextSpan, ZoneSymbolType } from './zone-symbol';

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

const rValidLine = /^(Zone|Rule|Link)/;
const rWhitespaceCapture = /(\s+)/;
const rWhitespaceOnly = /^\s+$/;
const rStartTabs = /^\t{2,}/;

function sumLengths(arr: string[], beforeIndex: number): number {
  return arr.slice(0, beforeIndex).reduce((sum, str) => sum + str.length, 0);
}

type NameLinkRefs = {
  name: ZoneSymbolLineRef;
  link: ZoneSymbolLineRef;
};

function tokensToReferences(tokens: string[], nameField: number, linkField?: number): NameLinkRefs {
  let fieldIndex = -1;
  let charIndex = 0;
  let name: ZoneSymbolLineRef, link: ZoneSymbolLineRef;
  tokens.forEach((token) => {
    if (!rWhitespaceOnly.test(token)) {
      fieldIndex++;
      if (nameField !== null && fieldIndex === nameField) {
        name = { text: token, index: charIndex };
      }
      if (linkField !== undefined && fieldIndex === linkField && token !== '-') {
        link = { text: token, index: charIndex };
      }
    }
    charIndex += token.length;
  });
  return { name, link };
}

// TODO: Make this work for multi-line zones
function parseLine(document: vscode.TextDocument, lineNumber: number): ZoneSymbol {
  const line = document.lineAt(lineNumber);
  const text = line.text;
  // Skip non-definition lines
  if (line.isEmptyOrWhitespace || text.indexOf('#') === 0 || !rValidLine.test(text)) {
    return null;
  }

  const tokens = text.split(rWhitespaceCapture);
  const type = <ZoneSymbolType>tokens[0];
  let refs: NameLinkRefs;
  switch (type) {
    case 'Zone': refs = tokensToReferences(tokens, 1, 3); break;
    case 'Rule': refs = tokensToReferences(tokens, 1); break;
    case 'Link': refs = tokensToReferences(tokens, 2, 1); break;
  }
  if (refs) {
    let symbol = new ZoneSymbol(
      type,
      ZoneSymbol.textSpanFromLineReference(document, lineNumber, refs.name),
      ZoneSymbol.textSpanFromLineReference(document, lineNumber, refs.link)
    );
    if (type === 'Link') {
      symbol.parentText = `Link(${tokens[2]})`;
    }
    return symbol;
  }
  return null;
}

function parseExtraZoneLines(document: vscode.TextDocument, lineNumber: number, symbol: ZoneSymbol): number {
  let count = 0;
  while (true) {
    const text = document.lineAt(lineNumber).text;
    if (!rStartTabs.test(text)) {
      return count;
    }
    const tokens = text.split(rWhitespaceCapture);
    const refs = tokensToReferences(tokens, null, 2);
    if (refs.link) {
      symbol.references.push(ZoneSymbol.textSpanFromLineReference(document, lineNumber, refs.link));
    }
    lineNumber++;
    count++;
  }
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
      if (symbol.type === 'Zone') {
        i += parseExtraZoneLines(document, i + 1, symbol);
      }
    }
  }
  console.log(`  TOOK ${Date.now() - _start}ms`);
  return symbols;
}

type DocumentSymbols = { file: vscode.Uri, symbols: ZoneSymbol[] };

export function parseCurrentWorkspace(): Thenable<DocumentSymbols[]> {
  let filenames = `{${PARSEABLE_FILENAMES.join(',')}}`;
  console.log('--parseCurrentWorkspace: finding ' + filenames);
  let _start = Date.now();
  return vscode.workspace.findFiles(filenames).then((files: vscode.Uri[]) => {
    console.log(`  TOOK ${Date.now() - _start}ms`);
    return Promise.all(files.map((file: vscode.Uri) => {
      console.log(`  (going to parse ${file})`);
      return vscode.workspace.openTextDocument(file).then((doc: vscode.TextDocument): DocumentSymbols => {
        let symbols = parseDocument(doc);
        return { file, symbols };
      });
    }))
  }).then((results: DocumentSymbols[]): DocumentSymbols[] => {
    console.log('--DONE PARSING WORKSPACE--', results.length);
    console.log(`  TOOK ${Date.now() - _start}ms`);
    return results;
  });
}
