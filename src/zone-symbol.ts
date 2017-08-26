'use strict';

import * as vscode from 'vscode';

export type ZoneSymbolType = 'Zone' | 'Rule' | 'Link';

export type ZoneSymbolTextSpan = {
  text: string;
  location: vscode.Location;
};

export class ZoneSymbol {
  type: ZoneSymbolType;
  name: ZoneSymbolTextSpan;
  parentText?: string;
  references: ZoneSymbolTextSpan[];

  public constructor(
    type: ZoneSymbolType, name: ZoneSymbolTextSpan, link?: ZoneSymbolTextSpan
  ) {
    this.type = type;
    this.name = name;
    this.references = [];
    if (link) {
      this.references.push(link);
    }
  }

  public toSymbolInformation(): vscode.SymbolInformation {
    return new vscode.SymbolInformation(
      this.name.text, vscode.SymbolKind.Field, this.parentText || this.type, this.name.location
    );
  }

  static textSpanFromLineReference(
    document: vscode.TextDocument, line: number, ref?: { text: string; char: number }
  ): ZoneSymbolTextSpan {
    if (!ref) {
      return null;
    }
    const range = new vscode.Range(
      line, ref.char,
      line, ref.char + ref.text.length
    );
    return {
      text: ref.text,
      location: new vscode.Location(document.uri, range),
    };
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


