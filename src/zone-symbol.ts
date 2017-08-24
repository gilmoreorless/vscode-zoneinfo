'use strict';

import * as vscode from 'vscode';

type ZoneSymbolType = 'Zone' | 'Rule' | 'Link';
export default class ZoneSymbol {
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

/*
DEFINITIONS

<document symbols>

registerDocumentSymbolProvider() -> DocumentSymbolProvider.provideDocumentSymbols() ->
SymbolInformation[] = {
  name: string;
  containerName: string;
  location: Location;
  kind: enum;
}

<workspace symbols>

registerWorkspaceSymbolProvider() -> WorkspaceSymbolProvider.provideWorkspaceSymbols() ->
SymbolInformation[]

<definitions>

registerDefinitionProvider() -> DefinitionProvider.provideDefinition() ->
Definition = Location | Location[]

<references>

registerReferenceProvider() -> ReferenceProvider.provideReferences() ->
Location[]
*/


