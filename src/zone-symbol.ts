'use strict';

import * as vscode from 'vscode';

export type ZoneSymbolType = 'Zone' | 'Rule' | 'Link';

export type ZoneSymbolLineRef = {
  text: string;
  index: number;
};

export type ZoneSymbolTextSpan = {
  text: string;
  location: vscode.Location;
};

export class ZoneSymbol {
  type: ZoneSymbolType;
  name: ZoneSymbolTextSpan;
  parentText?: string;
  references: ZoneSymbolTextSpan[];

  public constructor(type: ZoneSymbolType, name: ZoneSymbolTextSpan, link?: ZoneSymbolTextSpan) {
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
    document: vscode.TextDocument, line: number, ref?: ZoneSymbolLineRef
  ): ZoneSymbolTextSpan {
    if (!ref) {
      return null;
    }
    const range = new vscode.Range(
      line, ref.index,
      line, ref.index + ref.text.length
    );
    return {
      text: ref.text,
      location: new vscode.Location(document.uri, range),
    };
  }
}
