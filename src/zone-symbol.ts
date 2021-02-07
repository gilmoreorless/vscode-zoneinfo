import * as vscode from 'vscode';

/**
 * A simple representation of a block of comment lines using start and end line numbers.
 */
export class CommentBlock {
  constructor(public startLine: number, public endLine: number) {}
}

/**
 * Available strings for ZoneSymbol's `type` field.
 * These correspond to the three primary entity types in tzdb files.
 */
export type ZoneSymbolType = 'Zone' | 'Rule' | 'Link';

export type ZoneSymbolLineRef = {
  text: string;
  line: number;
  index: number;
};

/**
 * A piece of text with file range details, for quickly building references between ZoneSymbols.
 * The fully-expanded structure looks something like this:
 * {
 *   text: 'name',
 *   location: Location {
 *     uri: Uri {
 *       scheme: 'file://',
 *       path: '/path/to/file',
 *       ...etc
 *     },
 *     range: Range {
 *       start: Position {
 *         line: 1,
 *         character: 23,
 *       },
 *       end: Position {
 *         line: 1,
 *         character: 45,
 *       },
 *     }
 *   }
 * }
 */
export type ZoneSymbolTextSpan = {
  text: string;
  location: vscode.Location;
};

/**
 * The primary representation of symbols within a tzdb file.
 * All symbols are stored in the cache as `ZoneSymbol`s, then converted to `SymbolInformation`
 * or `DocumentSymbol` instances as required by vscode APIs.
 */
export class ZoneSymbol {
  /**
   * The primary type of this symbol: Zone, Rule, or Link.
   */
  type: ZoneSymbolType;
  /**
   * Text and location of the symbol's distinctive name.
   * For Zone and Link symbols, this will be the `Region/City_Name` format.
   * For Rule symbols, this will be the rule name like `GB-Eire`.
   */
  name: ZoneSymbolTextSpan;
  /**
   * Full document range of the symbol's data, including preceeding comment lines.
   */
  totalRange: vscode.Location;
  /**
   * Optional summary description to use in VS Code UI. This text will be
   * displayed in parentheses after the symbol type.
   * e.g. A Link summary would be the Zone it points to, displayed in a list of
   * symbols as `Link(Europe/London)`.
   */
  summary?: string;
  /**
   * Locations of any references to other symbols.
   * A Link symbol will always point to a single Zone symbol.
   * A Zone symbol might point to many different Rule symbols.
   */
  references: ZoneSymbolTextSpan[];

  constructor(type: ZoneSymbolType, name: ZoneSymbolTextSpan, totalRange: vscode.Location) {
    this.type = type;
    this.name = name;
    this.totalRange = totalRange;
    this.references = [];
  }

  description(): string {
    return this.summary ? `${this.type} (${this.summary})` : this.type;
  }

  toSymbolInformation(): vscode.SymbolInformation {
    return new vscode.SymbolInformation(
      this.name.text,
      vscode.SymbolKind.Field,
      this.description(),
      this.name.location,
    );
  }

  toDocumentSymbol(): vscode.DocumentSymbol {
    return new vscode.DocumentSymbol(
      this.name.text,
      this.description(),
      vscode.SymbolKind.Field,
      this.totalRange.range,
      this.name.location.range,
    );
  }
}

export function textSpanFromLineReference(
  document: vscode.TextDocument,
  line: number,
  ref: ZoneSymbolLineRef,
): ZoneSymbolTextSpan {
  // prettier-ignore
  const range = new vscode.Range(
    line, ref.index,
    line, ref.index + ref.text.length
  );
  return {
    text: ref.text,
    location: new vscode.Location(document.uri, range),
  };
}
