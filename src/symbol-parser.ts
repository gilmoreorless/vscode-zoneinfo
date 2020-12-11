'use strict';

import * as vscode from 'vscode';

import { log, timer } from './debug';
import { ZoneSymbol, ZoneSymbolLineRef, ZoneSymbolType } from './zone-symbol';

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

type NameLinkRefs = {
  name?: ZoneSymbolLineRef;
  link?: ZoneSymbolLineRef;
};

function tokensToReferences(tokens: string[], nameField: number, linkField?: number): NameLinkRefs {
  let fieldIndex = -1;
  let charIndex = 0;
  let name: ZoneSymbolLineRef | undefined;
  let link: ZoneSymbolLineRef | undefined;
  tokens.forEach((token) => {
    if (!rWhitespaceOnly.test(token)) {
      fieldIndex++;
      if (nameField > -1 && fieldIndex === nameField) {
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

function parseLine(document: vscode.TextDocument, lineNumber: number): ZoneSymbol | null {
  const line = document.lineAt(lineNumber);
  const text = line.text;
  // Skip non-definition lines
  if (line.isEmptyOrWhitespace || text.indexOf('#') === 0 || !rValidLine.test(text)) {
    return null;
  }

  const tokens = text.split(rWhitespaceCapture);
  const type = <ZoneSymbolType>tokens[0];
  let refs: NameLinkRefs | undefined;
  switch (type) {
    case 'Zone':
      refs = tokensToReferences(tokens, 1, 3);
      break;
    case 'Rule':
      refs = tokensToReferences(tokens, 1);
      break;
    case 'Link':
      refs = tokensToReferences(tokens, 2, 1);
      break;
  }
  if (refs?.name) {
    let symbol = new ZoneSymbol(
      type,
      ZoneSymbol.textSpanFromLineReference(document, lineNumber, refs.name),
      ZoneSymbol.textSpanFromLineReference(document, lineNumber, refs.link),
    );
    if (type === 'Link') {
      symbol.parentText = `Link(${tokens[2]})`;
    }
    return symbol;
  }
  return null;
}

function parseExtraZoneLines(
  document: vscode.TextDocument,
  lineNumber: number,
  symbol: ZoneSymbol,
): number {
  let count = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const text = document.lineAt(lineNumber).text;
    if (!rStartTabs.test(text)) {
      return count;
    }
    const tokens = text.split(rWhitespaceCapture);
    const refs = tokensToReferences(tokens, -1, 2);
    if (refs?.link) {
      symbol.references.push(ZoneSymbol.textSpanFromLineReference(document, lineNumber, refs.link));
    }
    lineNumber++;
    count++;
  }
}

export function parseDocument(document: vscode.TextDocument): ZoneSymbol[] {
  const logTime = timer();
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
  logTime(`[parseDocument ${document.fileName.split('/').pop()}]`);
  return symbols;
}

type DocumentSymbols = { file: vscode.Uri; symbols: ZoneSymbol[] };
type FolderSymbols = { path: string; documents: DocumentSymbols[] };

export async function parseCurrentWorkspace(): Promise<FolderSymbols[]> {
  const folders = vscode.workspace.workspaceFolders;
  if (folders === undefined || !folders.length) {
    return [];
  }
  let ret = [];
  for (let folder of folders) {
    ret.push(await parseWorkspaceFolder(folder));
  }
  return ret;
}

export async function parseWorkspaceFolder(folder: vscode.WorkspaceFolder): Promise<FolderSymbols> {
  log(`[parseWorkspaceFolder ${folder.name}]`);
  const logTime = timer();
  const filenames = `{${PARSEABLE_FILENAMES.join(',')}}`;
  const findArg = new vscode.RelativePattern(folder, filenames);
  const files: vscode.Uri[] = await vscode.workspace.findFiles(findArg);
  logTime(`[parseWorkspaceFolder ${folder.name}]: findFiles`);
  let docSymbols: DocumentSymbols[] = []
  for (let file of files) {
    docSymbols.push(await (async function () {
      const filename = file.toString().split('/').pop();
      const logFileTime = timer();
      const doc = await vscode.workspace.openTextDocument(file);
      logFileTime(`${filename}: open`);
      const symbols = parseDocument(doc);
      logFileTime(`${filename}: parse`);
      return { file, symbols };
    })());
  }
  logTime(`[parseWorkspaceFolder ${folder.name}]: TOTAL`);
  return {
    path: folder.uri.toString(),
    documents: docSymbols,
  };
}
