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

function parseExtraZoneLines(
  document: vscode.TextDocument, lineNumber: number, symbol: ZoneSymbol
): number {
  let count = 0;
  while (true) {
    const text = document.lineAt(lineNumber).text;
    if (!rStartTabs.test(text)) {
      return count;
    }
    const tokens = text.split(rWhitespaceCapture);
    const refs = tokensToReferences(tokens, null, 2);
    if (refs.link) {
      symbol.references.push(
        ZoneSymbol.textSpanFromLineReference(document, lineNumber, refs.link)
      );
    }
    lineNumber++;
    count++;
  }
}

export function parseDocument(document: vscode.TextDocument): ZoneSymbol[] {
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
  return symbols;
}

type DocumentSymbols = { file: vscode.Uri, symbols: ZoneSymbol[] };
type FolderSymbols = { path: string, documents: DocumentSymbols[] };

export async function parseCurrentWorkspace(): Promise<FolderSymbols[]> {
  const folders = vscode.workspace.workspaceFolders;
  if (folders === undefined || !folders.length) {
    return [];
  }
  return await Promise.all(folders.map(await parseWorkspaceFolder));
}

export async function parseWorkspaceFolder(folder: vscode.WorkspaceFolder): Promise<FolderSymbols> {
  const filenames = `{${PARSEABLE_FILENAMES.join(',')}}`;
  const findArg = new vscode.RelativePattern(folder, filenames);
  const files: vscode.Uri[] = await vscode.workspace.findFiles(findArg);
  const docSymbols: DocumentSymbols[] = await Promise.all(files.map(async (file: vscode.Uri) => {
    const doc = await vscode.workspace.openTextDocument(file);
    const symbols = parseDocument(doc);
    return { file, symbols };
  }));
  return {
    path: folder.uri.toString(),
    documents: docSymbols,
  };
}
