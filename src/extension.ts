'use strict';

import * as vscode from 'vscode';
import * as symbols from './symbols';
import { ZoneSymbol, ZoneSymbolTextSpan } from './zone-symbol';

const ZONEINFO_MODE = 'zoneinfo';

export function activate(context: vscode.ExtensionContext) {
  console.log('\n==activate==', context);
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(ZONEINFO_MODE, new ZoneinfoDocumentSymbolProvider()),
    vscode.languages.registerWorkspaceSymbolProvider(new ZoneinfoWorkspaceSymbolProvider()),
    vscode.languages.registerDefinitionProvider(ZONEINFO_MODE, new ZoneinfoDefinitionProvider()),
    vscode.languages.registerReferenceProvider(ZONEINFO_MODE, new ZoneinfoReferenceProvider()),
    vscode.workspace.onDidChangeTextDocument(documentChanged),
    vscode.workspace.onDidSaveTextDocument(documentSaved),
  );
  process.nextTick(symbols.cacheCurrentWorkspace);
}

export function deactivate() {
  console.log('\n==deactivate==');
  symbols.clearCache();
}

function documentChanged(e: vscode.TextDocumentChangeEvent) {
  console.log('\n==onDidChangeTextDocument==');
  console.log(e.document, e.contentChanges);
  const { document, contentChanges } = e;
  if (document.languageId === 'zoneinfo' && contentChanges.length === 0) {
    console.log(`  (setting document dirty state)`);
    symbols.markDocumentDirty(document);
  }
}

function documentSaved(document: vscode.TextDocument) {
  console.log('\n==onDidSaveTextDocument==');
  console.log(document);
  symbols.cacheDocument(document);
}

class ZoneinfoDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

  public toSymbolInformation(allSymbols: ZoneSymbol[]): vscode.ProviderResult<vscode.SymbolInformation[]> {
    return allSymbols.map(s => s.toSymbolInformation());
  }

  public uniqueSymbols(allSymbols: ZoneSymbol[]): vscode.ProviderResult<vscode.SymbolInformation[]> {
    return this.toSymbolInformation(symbols.unique(allSymbols));
  }

  public provideDocumentSymbols(
    document: vscode.TextDocument, token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.SymbolInformation[]> {

    console.log('\n==provideDocumentSymbols==');
    return symbols.getForDocument(document).then(s => this.uniqueSymbols(s));
  }

}

class ZoneinfoWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {

  private symbolProvider: ZoneinfoDocumentSymbolProvider;

  public constructor() {
    this.symbolProvider = new ZoneinfoDocumentSymbolProvider();
  }

  public filteredSymbols(allSymbols: ZoneSymbol[], query: string): vscode.ProviderResult<vscode.SymbolInformation[]> {
    const uniqueSymbols = symbols.unique(allSymbols);
    if (!query.length) {
      return this.symbolProvider.toSymbolInformation(uniqueSymbols);
    }
    // Just match that the query chars appear somewhere in the name in the right order.
    // Let VS Code handle the sorting by relevance.
    const queryLower = query.toLocaleLowerCase();
    const queryChars = [...queryLower];
    // TODO: Memo-ise this output?
    const doesMatch = (name: string) => {
      let search = name.toLocaleLowerCase();
      if (queryLower.includes(search)) {
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

  // TODO: Test this with single files rather than the tz folder
  public provideWorkspaceSymbols(
    query: string, token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.SymbolInformation[]> {
    
    console.log('\n==provideWorkspaceSymbols==');
    return symbols.getForCurrentWorkspace().then(s => this.filteredSymbols(s, query));
  }

}

class ZoneinfoDefinitionProvider implements vscode.DefinitionProvider {

  public provideDefinition(
    document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition> {

    console.log('\n==provideDefinition==');
    console.log(document.fileName, JSON.stringify(position));
    return symbols.getSpanForDocumentPosition(document, position).then((span: ZoneSymbolTextSpan) => {
      if (span === null) {
        return null;
      }
      return symbols.getForName(span.text).then(allSymbols => allSymbols.map(s => s.name.location));
    });
  }

}

class ZoneinfoReferenceProvider implements vscode.ReferenceProvider {

  public provideReferences(
    document: vscode.TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Location[]> {

    console.log('\n==provideReferences==');
    console.log(document.fileName, JSON.stringify(position), context.includeDeclaration);
    return symbols.getSpanForDocumentPosition(document, position).then((span: ZoneSymbolTextSpan): Thenable<vscode.Location[]> => {
      if (span === null) {
        return null;
      }
      return symbols.getSpanLinksToName(span.text).then((spans) => {
        if (!context.includeDeclaration) {
          spans = spans.filter(s => s !== span);
        }
        return spans.map(s => s.location);
      });
    });
  }

}
