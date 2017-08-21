'use strict';

import * as vscode from 'vscode';

const ZONEINFO_MODE: vscode.DocumentSelector = 'zoneinfo';

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.languages.registerDocumentSymbolProvider(
    ZONEINFO_MODE, new ZoneinfoDocumentSymbolProvider());

  context.subscriptions.push(disposable);
}

export function deactivate() {}


const rValidLine = /^(Zone|Rule|Link)/;
const rWhitespace = /(\s+)/;

function sumLengths(arr: string[], beforeIndex: number) {
  return arr.slice(0, beforeIndex).reduce((sum, str) => sum + str.length, 0);
}

type parsedSymbol = {
  type: string,
  name: string,
  parent?: string,
  index: number,
}

class ZoneinfoDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

  public parseLine(line: string): parsedSymbol {
    if (!rValidLine.test(line)) {
      return null;
    }
    const parts = line.split(rWhitespace);
    const type = parts[0];
    if (type === 'Zone' || type === 'Rule') {
      return {
        type,
        name: parts[2],
        index: sumLengths(parts, 2)
      };
    }
    if (type === 'Link') {
      return {
        type,
        name: parts[4],
        parent: `Link(${parts[2]})`,
        index: sumLengths(parts, 4)
      }
    }
    return null;
  }

  public provideDocumentSymbols(
    document: vscode.TextDocument, token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.SymbolInformation[]> {
    const lineCount = document.lineCount;
    let symbols = [];
    let used = new Set();
    for (let i = 0; i < lineCount; i++) {
      let line = document.lineAt(i);
      // Skip comments and empty lines
      if (line.isEmptyOrWhitespace || line.text.indexOf('#') === 0) {
        continue;
      }

      let match = this.parseLine(line.text);
      if (match) {
        // Don't add duplicate Rule definitions
        let key = [match.type, match.name].join(':');
        if (used.has(key)) {
          continue;
        }
        used.add(key);

        // Find the symbol's position
        let range = new vscode.Range(
          i, match.index,
          i, match.index + match.name.length
        );
        symbols.push(new vscode.SymbolInformation(
          match.name, vscode.SymbolKind.Field, match.parent || match.type,
          new vscode.Location(document.uri, range)
        ));
      }
    }

    return symbols;
  }
}
