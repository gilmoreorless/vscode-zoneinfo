import * as vscode from 'vscode';

import { log, timer } from './debug';
import * as symbols from './symbols';
import { ZoneSymbol } from './zone-symbol';

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
    vscode.workspace.onDidChangeTextDocument(documentChanged),
  );
}

async function workspaceFoldersChanged(e: vscode.WorkspaceFoldersChangeEvent) {
  // Clear any cached folder/document symbols for removed folders
  e.removed.forEach(symbols.removeForFolder);
  // Parse and cache new folders, but only if the whole workspace has been previously cached.
  // Otherwise, rely on the usual lazy-loading behaviour within a folder.
  if (symbols.hasCachedWorkspace()) {
    e.added.forEach(symbols.getForFolder);
  }
}

/**
 * Update the cache for a relevant document when it changes, but only when it's not actively
 * being edited by the user. (Otherwise this would re-parse a document on every keystroke!)
 * This handles open (but not active) documents being altered by another process (e.g. git).
 */
function documentChanged(e: vscode.TextDocumentChangeEvent) {
  const { document } = e;
  const activeDocument = vscode.window.activeTextEditor?.document;
  if (
    document.languageId === 'zoneinfo' &&
    document !== activeDocument &&
    symbols.hasCachedDocument(document)
  ) {
    // `getForDocument()` will force a re-parsing of the document
    symbols.getForDocument(document);
  }
}

class ZoneinfoDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  toSymbolInformation(allSymbols: ZoneSymbol[]): vscode.SymbolInformation[] {
    return allSymbols.map((s) => s.toSymbolInformation());
  }

  toDocumentSymbols(allSymbols: ZoneSymbol[]): vscode.DocumentSymbol[] {
    return allSymbols.map((s) => s.toDocumentSymbol());
  }

  uniqueSymbols(allSymbols: ZoneSymbol[]): vscode.DocumentSymbol[] {
    return this.toDocumentSymbols(symbols.unique(allSymbols));
  }

  async provideDocumentSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
    log('[provideDocumentSymbols]', document);
    const logTime = timer();
    const docSymbols = symbols.getForDocument(document);
    let ret = this.uniqueSymbols(docSymbols);
    logTime('provideDocumentSymbols');
    return ret;
  }
}

class ZoneinfoWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  private symbolProvider: ZoneinfoDocumentSymbolProvider;

  constructor() {
    this.symbolProvider = new ZoneinfoDocumentSymbolProvider();
  }

  filteredSymbols(allSymbols: ZoneSymbol[], query: string): vscode.SymbolInformation[] {
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

  async provideWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
    log('[provideWorkspaceSymbols]', query);
    const logTime = timer();
    const allSymbols = await symbols.getForWorkspace();
    logTime('provideWorkspaceSymbols: get');
    let ret = this.filteredSymbols(allSymbols, query);
    logTime('provideWorkspaceSymbols: filter');
    return ret;
  }
}

class ZoneinfoDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Definition | null> {
    log('[provideDefinition]', document, position);
    const logTime = timer();
    const span = symbols.getSpanForDocumentPosition(document, position);
    logTime('provideDefinition: getSpan');
    if (span === null) {
      log('  (no matching span)');
      return null;
    }
    const nameSymbols = await symbols.getForSpan(span);
    logTime('provideDefinition: getSymbols');
    return nameSymbols.map((s) => s.name.location);
  }
}

class ZoneinfoReferenceProvider implements vscode.ReferenceProvider {
  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
  ): Promise<vscode.Location[] | null> {
    log('[provideReferences]', document, position);
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
