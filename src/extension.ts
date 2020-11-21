'use strict';

import * as vscode from 'vscode';
import * as symbols from './symbols';
import { ZoneSymbol } from './zone-symbol';
import { timer } from './debug';

const ZONEINFO_MODE: vscode.DocumentFilter = { scheme: 'file', language: 'zoneinfo' };

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      ZONEINFO_MODE,
      new ZoneinfoDocumentSymbolProvider(),
    ),
    vscode.languages.registerWorkspaceSymbolProvider(new ZoneinfoWorkspaceSymbolProvider()),
    vscode.languages.registerDefinitionProvider(ZONEINFO_MODE, new ZoneinfoDefinitionProvider()),
    vscode.languages.registerReferenceProvider(ZONEINFO_MODE, new ZoneinfoReferenceProvider()),
    vscode.workspace.onDidChangeWorkspaceFolders(workspaceFoldersChanged),
    // vscode.workspace.onDidChangeTextDocument(documentChanged),
    // vscode.workspace.onDidSaveTextDocument(documentSaved),
  );
  // process.nextTick(symbols.cacheCurrentWorkspace);
}

export function deactivate(): void {
  // symbols.clearCache();
}

async function workspaceFoldersChanged(e: vscode.WorkspaceFoldersChangeEvent) {
  // await Promise.all(
  //   e.added.map(async (folder) => {
  //     await symbols.cacheWorkspaceFolder(folder);
  //   }),
  // );
  // e.removed.forEach((folder) => {
  //   symbols.clearWorkspaceFolderCache(folder);
  // });
  // symbols.syncWorkspaceCache();
}

// function documentChanged(e: vscode.TextDocumentChangeEvent) {
//   const { document, contentChanges } = e;
//   console.log('[documentChanged]', document.fileName, contentChanges);
//   if (document.languageId === 'zoneinfo' && contentChanges.length === 0) {
//     symbols.markDocumentDirty(document);
//   }
// }

// function documentSaved(document: vscode.TextDocument) {
//   console.log('[documentSaved]', document.fileName);
//   symbols.cacheDocument(document);
// }

class ZoneinfoDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  public toSymbolInformation(allSymbols: ZoneSymbol[]): vscode.SymbolInformation[] {
    return allSymbols.map((s) => s.toSymbolInformation());
  }

  public uniqueSymbols(allSymbols: ZoneSymbol[]): vscode.SymbolInformation[] {
    return this.toSymbolInformation(symbols.unique(allSymbols));
  }

  public async provideDocumentSymbols(
    document: vscode.TextDocument,
  ): Promise<vscode.SymbolInformation[]> {
    console.log('[provideDocumentSymbols]', document);
    const logTime = timer();
    const docSymbols = symbols.getForDocument(document);
    let ret = this.uniqueSymbols(docSymbols);
    logTime('provideDocumentSymbols');
    return ret;
  }
}

class ZoneinfoWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  private symbolProvider: ZoneinfoDocumentSymbolProvider;

  public constructor() {
    this.symbolProvider = new ZoneinfoDocumentSymbolProvider();
  }

  public filteredSymbols(allSymbols: ZoneSymbol[], query: string): vscode.SymbolInformation[] {
    const uniqueSymbols = symbols.unique(allSymbols);
    if (!query.length) {
      return this.symbolProvider.toSymbolInformation(uniqueSymbols);
    }
    // Just match that the query chars appear somewhere in the name in the right order.
    // Let VS Code handle the sorting by relevance.
    const queryLower = query.toLocaleLowerCase();
    const queryChars = [...queryLower];
    const doesMatch = (name: string) => {
      let search = name.toLocaleLowerCase();
      if (search.includes(queryLower)) {
        return true;
      }
      for (let char of queryChars) {
        let index = search.indexOf(char);
        if (index === -1) {
          return false;
        }
        search = search.substr(index + 1);
      }
      return true;
    };

    const filtered = uniqueSymbols.filter((symbol: ZoneSymbol) => doesMatch(symbol.name.text));
    return this.symbolProvider.toSymbolInformation(filtered);
  }

  public async provideWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
    console.log('[provideWorkspaceSymbols]', query);
    const logTime = timer();
    const allSymbols = await symbols.getForWorkspace();
    logTime('provideWorkspaceSymbols: get');
    let ret = this.filteredSymbols(allSymbols, query);
    logTime('provideWorkspaceSymbols: filter');
    return ret;
  }
}

class ZoneinfoDefinitionProvider implements vscode.DefinitionProvider {
  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Definition> {
    console.log('[provideDefinition]', document, position);
    const logTime = timer();
    const span = symbols.getSpanForDocumentPosition(document, position);
    logTime('provideDefinition: getSpan');
    if (span === null) {
      console.log('  (no matching span)');
      return null;
    }
    const nameSymbols = await symbols.getForSpan(span);
    logTime('provideDefinition: getSymbols');
    return nameSymbols.map((s) => s.name.location);
  }
}

class ZoneinfoReferenceProvider implements vscode.ReferenceProvider {
  public async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
  ): Promise<vscode.Location[]> {
    console.log('[provideReferences]', document, position);
    const logTime = timer();
    const span = symbols.getSpanForDocumentPosition(document, position);
    logTime('provideReferences: getSpan');
    if (span === null) {
      return null;
    }
    let spans = await symbols.getSpanLinksToName(span);
    if (!context.includeDeclaration) {
      spans = spans.filter((s) => s !== span);
    }
    logTime('provideReferences: getSymbols');
    return spans.map((s) => s.location);
  }
}
