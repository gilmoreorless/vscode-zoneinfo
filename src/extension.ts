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
  );
  process.nextTick(symbols.cacheCurrentWorkspace);
}

export function deactivate() {
  console.log('\n==deactivate==');
  symbols.clearCache();
}

class ZoneinfoDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

  public uniqueSymbols(allSymbols: ZoneSymbol[]): vscode.ProviderResult<vscode.SymbolInformation[]> {
    let used = new Set();
    return allSymbols.filter(symbol => {
      let key = [symbol.type, symbol.name.text].join(':');
      if (used.has(key)) {
        return false;
      }
      used.add(key);
      return true;
    })
    .map(symbol => symbol.toSymbolInformation());
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

  public filteredSymbols(symbols: ZoneSymbol[], query: string): vscode.ProviderResult<vscode.SymbolInformation[]> {
    // let queryLetters = [...query].map(c => c.toLocaleLowerCase());
    // TODO: Less-naïve checking of string matches
    let search = query.toLocaleLowerCase();
    let filtered = symbols.filter((symbol: ZoneSymbol) =>
      symbol.name.text.toLocaleLowerCase().indexOf(search) !== -1);
    return this.symbolProvider.uniqueSymbols(filtered);
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
