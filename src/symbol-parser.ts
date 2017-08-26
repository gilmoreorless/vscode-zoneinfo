'use strict';

import * as vscode from 'vscode';
import { ZoneSymbol, ZoneSymbolType, ZoneSymbolTextSpan } from './zone-symbol';

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
const rWhitespaceOnly = /^\s+$/; // TODO: Use this when parsing line "tokens", some of which are whitespace-only

function sumLengths(arr: string[], beforeIndex: number): number {
  return arr.slice(0, beforeIndex).reduce((sum, str) => sum + str.length, 0);
}

function tokensToReferences(tokens: string[], nameField: number, linkField?: number) {
  let fieldIndex = -1;
  let charIndex = 0;
  let name, link;
  tokens.forEach((token) => {
    if (!rWhitespaceOnly.test(token)) {
      fieldIndex++;
      if (fieldIndex === nameField) {
        name = { text: token, char: charIndex };
      }
      if (linkField !== undefined && fieldIndex === linkField && token !== '-') {
        link = { text: token, char: charIndex };
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
  if (line.isEmptyOrWhitespace || line.text.indexOf('#') === 0 || !rValidLine.test(text)) {
    return null;
  }

  const tokens = text.split(rWhitespaceCapture);
  const type = tokens[0];
  let refs;
  switch (type) {
    case 'Zone': refs = tokensToReferences(tokens, 1, 3); break;
    case 'Rule': refs = tokensToReferences(tokens, 1); break;
    case 'Link': refs = tokensToReferences(tokens, 2, 1); break;
  }
  if (refs) {
    let symbol = new ZoneSymbol(
      <ZoneSymbolType>type,
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
