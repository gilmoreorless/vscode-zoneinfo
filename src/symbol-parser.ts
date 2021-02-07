import * as vscode from 'vscode';

import { log, timer } from './debug';
import {
  CommentBlock,
  ZoneSymbol,
  ZoneSymbolLineRef,
  ZoneSymbolType,
  textSpanFromLineReference,
} from './zone-symbol';

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

const rUsefulLine = /^#|Zone|Rule|Link|\t{2,}/;
const rWhitespaceCapture = /(\s+)/;
const rWhitespaceOnly = /^\s+$/;
const rStartTabs = /^\t{2,}/;

/**
 * Split a line of text into indexed fields, using any whitespace as a field separator.
 */
function lineFields(lineNumber: number, lineText: string): ZoneSymbolLineRef[] {
  // Capture whitespace while splitting because we need the total character count
  const tokens = lineText.split(rWhitespaceCapture);
  let fields: ZoneSymbolLineRef[] = [];
  let charIndex = 0;
  for (let token of tokens) {
    if (!rWhitespaceOnly.test(token)) {
      fields.push({ text: token, line: lineNumber, index: charIndex });
    }
    charIndex += token.length;
  }
  return fields;
}

type ParseResult = {
  symbols: ZoneSymbol[];
  comments: CommentBlock[];
};

type ParserState = {
  line: number;
  symbolStartLine?: number;
  symbolType?: ZoneSymbolType;
  symbolName?: ZoneSymbolLineRef;
  symbolStartYear?: ZoneSymbolLineRef;
  symbolEndYear?: ZoneSymbolLineRef;
  symbolReferences: ZoneSymbolLineRef[];
  symbolSummary?: string;
};

/**
 * Stateful parser for a single text document.
 */
class Parser {
  symbols: ZoneSymbol[] = [];
  comments: CommentBlock[] = [];

  private state: ParserState = {
    line: 0,
    symbolReferences: [],
  };

  constructor(private document: vscode.TextDocument) {}

  resetSymbolState() {
    this.state.symbolStartLine = undefined;
    this.state.symbolType = undefined;
    this.state.symbolName = undefined;
    this.state.symbolStartYear = undefined;
    this.state.symbolEndYear = undefined;
    this.state.symbolSummary = undefined;
    this.state.symbolReferences = [];
  }

  /**
   * Return a `Location` with a `Range` from the given start line to the parser's current line.
   * This will adjust the `Range` to include the lines of any `CommentBlock` immediately before
   * the start line.
   *
   * The resulting `Location` is used for the total range of a `DocumentSymbol`.
   */
  makeLocation(startLine: number): vscode.Location {
    let realStartLine = startLine;
    // Check for a preceeding comment block
    let comment = this.comments[this.comments.length - 1];
    if (comment && comment.endLine === startLine - 1) {
      realStartLine = comment.startLine;
    }

    let range = this.document
      .lineAt(this.state.line - 1)
      .rangeIncludingLineBreak.with(new vscode.Position(realStartLine, 0));
    return new vscode.Location(this.document.uri, range);
  }

  /**
   * Consume consecutive comment lines (starting with "#") and return a `CommentBlock`.
   * This updates the parser's state for the current line and adds the `CommentBlock` to `this.comments`.
   */
  commentBlock(): CommentBlock {
    const startLine = this.state.line;
    while (this.state.line < this.document.lineCount - 1) {
      const line = this.document.lineAt(this.state.line + 1);
      if (!line.text.startsWith('#')) {
        break;
      }
      this.state.line++;
    }

    const block = new CommentBlock(startLine, this.state.line);
    this.comments.push(block);
    return block;
  }

  /**
   * Finish off (finalise) the symbol that's currently being parsed.
   * 1. Create a new `ZoneSymbol` from the current state.
   * 2. Add the `ZoneSymbol` to `this.symbols`.
   * 3. Reset parser state.
   *
   * This should be called whenever a symbol is being parsed and a non-symbol line is found.
   */
  finishSymbol(): void {
    const { state } = this;
    if (!state.symbolType || !state.symbolName || state.symbolStartLine === undefined) {
      return;
    }
    let symbol = new ZoneSymbol(
      state.symbolType,
      textSpanFromLineReference(this.document, state.symbolStartLine, state.symbolName),
      this.makeLocation(state.symbolStartLine),
    );
    symbol.summary = state.symbolSummary;
    symbol.references = state.symbolReferences.map((ref) =>
      textSpanFromLineReference(this.document, ref.line, ref),
    );
    this.symbols.push(symbol);
    this.resetSymbolState();
  }

  /**
   * Parse the document and return lists of `ZoneSymbol`s and `CommentBlock`s.
   */
  parse(): ParseResult {
    const logTime = timer();
    const lineCount = this.document.lineCount;
    this.state = {
      line: 0,
      symbolReferences: [],
    };
    this.symbols = [];
    this.comments = [];
    let { state } = this;

    for (; state.line < lineCount; state.line++) {
      let line = this.document.lineAt(state.line);
      let match = rUsefulLine.exec(line.text)?.[0];
      if (!match) {
        this.finishSymbol();
        continue;
      }

      // Parse comment sections and keep a reference to the latest one
      if (match === '#') {
        this.commentBlock();
        continue;
      }

      // Parse Link, Rule, and Zone sections with reference to previous comments
      let fields = lineFields(state.line, line.text);

      // Check for Zone continuation lines first
      if (rStartTabs.test(line.text)) {
        if (state.symbolType !== 'Zone') {
          throw new Error(
            `Unexpected indented source line not in a Zone block.
  File: ${this.document.fileName}
  Line: ${this.state.line + 1}`,
          );
        }
        // 0        1       2      3       4
        // (empty)  STDOFF  RULES  FORMAT  [UNTIL]
        let rules = fields[2];
        if (rules.text !== '-') {
          state.symbolReferences.push(rules);
        }
        continue;
      }

      // Check for a previous symbol in progess
      let symbolType = match as ZoneSymbolType;
      if (state.symbolType && state.symbolType !== symbolType) {
        this.finishSymbol();
      }

      // Start a new symbol, or continue an existing one
      state.symbolType = symbolType;
      if (state.symbolStartLine === undefined) {
        state.symbolStartLine = state.line;
      }
      switch (symbolType) {
        // 0     1       2
        // Link  TARGET  LINK-NAME
        case 'Link': {
          let [, target, name] = fields;
          // If the in-progess Rule has a different name, end it and reset state
          if (state.symbolName && state.symbolName.text !== name.text) {
            this.finishSymbol();
            state.symbolType = symbolType;
            state.symbolStartLine = state.line;
          }
          state.symbolName = name;
          state.symbolReferences.push(target);
          state.symbolSummary = target.text;
          break;
        }

        // 0     1     2     3   4  5   6   7   8     9
        // Rule  NAME  FROM  TO  -  IN  ON  AT  SAVE  LETTER/S
        case 'Rule': {
          let [, name, startYear, endYear] = fields;
          // If the in-progess Rule has a different name, end it and reset state
          if (state.symbolName && state.symbolName.text !== name.text) {
            this.finishSymbol();
            state.symbolType = symbolType;
            state.symbolStartLine = state.line;
          }

          if (!state.symbolName) {
            state.symbolName = name;
          }
          if (!state.symbolStartYear) {
            state.symbolStartYear = startYear;
          }
          state.symbolEndYear = endYear.text === 'only' ? startYear : endYear;
          state.symbolSummary =
            state.symbolEndYear.text === 'max'
              ? `${state.symbolStartYear.text}+`
              : `${state.symbolStartYear.text}–${state.symbolEndYear.text}`;
          break;
        }

        // 0     1     2       3      4       5
        // Zone  NAME  STDOFF  RULES  FORMAT  [UNTIL]
        case 'Zone': {
          let [, name, , rules] = fields;
          // If the in-progess Zone has a different name, end it and reset state
          if (state.symbolName && state.symbolName.text !== name.text) {
            this.finishSymbol();
            state.symbolType = symbolType;
            state.symbolStartLine = state.line;
          }

          state.symbolName = name;
          if (rules.text !== '-') {
            state.symbolReferences.push(rules);
          }
          break;
        }
      }
    }
    this.finishSymbol();
    logTime(`[parseDocument ${this.document.fileName.split('/').pop()}]`);
    return { symbols: this.symbols, comments: this.comments };
  }
}

export function parseDocument(document: vscode.TextDocument): ParseResult {
  return new Parser(document).parse();
}

type DocumentSymbols = { file: vscode.Uri } & ParseResult;
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
  let docSymbols: DocumentSymbols[] = [];
  for (let file of files) {
    docSymbols.push(
      await (async function () {
        const filename = file.toString().split('/').pop();
        const logFileTime = timer();
        const doc = await vscode.workspace.openTextDocument(file);
        logFileTime(`${filename}: open`);
        const { symbols, comments } = parseDocument(doc);
        logFileTime(`${filename}: parse`);
        return { file, symbols, comments };
      })(),
    );
  }
  logTime(`[parseWorkspaceFolder ${folder.name}]: TOTAL`);
  return {
    path: folder.uri.toString(),
    documents: docSymbols,
  };
}
