import * as vscode from 'vscode';

import { log, timer } from './debug';
import { documentHash } from './hash';
import * as cache from './symbol-cache';
import * as parser from './symbol-parser';
import { CommentBlock, ZoneSymbol, ZoneSymbolTextSpan, ZoneSymbolType } from './zone-symbol';

type TextSpanWithSymbol = ZoneSymbolTextSpan & {
  symbol: ZoneSymbol;
};

/**
 * Get all symbols for a document and sync them with the cache.
 * This will only parse the document for symbols when the document's content hash doesn't match
 * the cached value.
 */
function updateDocument(
  document: vscode.TextDocument,
): {
  symbols: ZoneSymbol[];
  comments: CommentBlock[];
  didUpdate: boolean;
} {
  const filename = document.fileName.split('/').pop();
  log(`[updateDocument ${filename}]`);
  const logTime = timer();
  let shouldUpdate = false;
  let symbols: ZoneSymbol[] = [];
  let comments: CommentBlock[] = [];
  const hash = documentHash(document);
  const cachedDocument = cache.getForDocument(document);
  logTime(`[updateDocument ${filename}]: hash and get`);
  if (!cachedDocument) {
    log(`[updateDocument ${filename}]: not in cache`);
    shouldUpdate = true;
  } else {
    log(`[updateDocument ${filename}]: already cached`);
    if (cachedDocument.hash !== hash) {
      log(`[updateDocument ${filename}]: cached hash didn't match`);
      shouldUpdate = true;
    } else {
      symbols = cachedDocument.symbols;
      comments = cachedDocument.comments;
    }
  }

  if (shouldUpdate) {
    log(`[updateDocument ${filename}]: parsing`);
    const parseResult = parser.parseDocument(document);
    symbols = parseResult.symbols;
    comments = parseResult.comments;
    cache.setForDocument(document, hash, symbols, comments);
  }
  logTime(`[updateDocument ${filename}]: TOTAL`);
  return { symbols, comments, didUpdate: shouldUpdate };
}

/**
 * Get all symbols for documents within a folder, parsing only the ones that haven't been cached.
 */
async function updateFolder(folder: vscode.WorkspaceFolder): Promise<ZoneSymbol[]> {
  log(`[updateFolder ${folder.name}]`);
  const logTime = timer();
  const filenames = `{${parser.PARSEABLE_FILENAMES.join(',')}}`;
  const findArg = new vscode.RelativePattern(folder, filenames);
  const files: vscode.Uri[] = await vscode.workspace.findFiles(findArg);
  logTime(`[updateFolder ${folder.name}]: findFiles`);
  cache.setDocumentsForFolder(folder, files);

  let docSymbols: ZoneSymbol[][] = [];
  for (let file of files) {
    // Using async IIFE here to provide more accurate performance timing measurements
    docSymbols.push(
      await (async () => {
        let filename = file.toString().split('/').pop();
        let logFileTime = timer();

        const doc = await vscode.workspace.openTextDocument(file);
        logFileTime(`${filename}: open`);
        const { symbols } = updateDocument(doc);
        logFileTime(`${filename}: parse/cache`);

        return symbols;
      })(),
    );
  }
  logTime(`[updateFolder ${folder.name}]: TOTAL`);

  let allSymbols = docSymbols.flat();
  cache.setForFolder(folder, allSymbols);
  return allSymbols;
}

/**
 * Get all symbols for relevant documents within the current workspace.
 */
async function updateWorkspace(): Promise<ZoneSymbol[]> {
  let folders = vscode.workspace.workspaceFolders;
  if (folders === undefined || !folders.length) {
    return [];
  }

  const logTime = timer();
  let folderSymbols: ZoneSymbol[][] = [];
  for (let folder of folders) {
    // Use getForFolder() to avoid re-parsing folders that are already cached
    folderSymbols.push(await getForFolder(folder));
  }
  logTime('[updateWorkspace]: TOTAL');

  let allSymbols = folderSymbols.flat();
  cache.setForWorkspace(allSymbols);
  return allSymbols;
}

/**
 * Get all symbols for a document.
 */
export function getForDocument(document: vscode.TextDocument): ZoneSymbol[] {
  const updateResult = updateDocument(document);
  return updateResult.symbols;
}

/**
 * Return true if a document already been parsed and cached.
 */
export function hasCachedDocument(document: vscode.TextDocument): boolean {
  return Boolean(cache.getForDocument(document));
}

/**
 * Get all symbols for relevant documents within a folder.
 * Uses a cached list if the folder has previously been parsed.
 */
export async function getForFolder(folder: vscode.WorkspaceFolder): Promise<ZoneSymbol[]> {
  log(`[getForFolder ${folder.name}]`);
  const cached = cache.getForFolder(folder);
  if (cached) {
    return cached.symbols;
  }
  log('  (not cached, parsing...)');
  return await updateFolder(folder);
}

/**
 * Remove all cached symbols for specified folders and their documents.
 * This updates the cache after folders are removed from a workspace.
 */
export function removeForFolder(folder: vscode.WorkspaceFolder): void {
  log(`[removeForFolder ${folder.name}]`);
  cache.removeForFolder(folder);
}

/**
 * Get all symbols for relevant documents within the current workspace.
 * Uses a cached list if all folders in the workspace have previously been parsed.
 */
export async function getForWorkspace(): Promise<ZoneSymbol[]> {
  log('[getForWorkspace]');
  const cached = cache.getForWorkspace();
  if (cached) {
    return cached.symbols;
  }
  log('  (not cached, parsing...)');
  return await updateWorkspace();
}

/**
 * Return true if all relevant files in the workspace have already been parsed and cached.
 */
export function hasCachedWorkspace(): boolean {
  return Boolean(cache.getForWorkspace());
}

/**
 * Get all symbols with names that match a given text span.
 * Symbols are restricted to the same workspace folder as the text span, then filtered further
 * based on the span's parent symbol:
 * - If the parent symbol is a `Link`, only `Zone` symbols will be returned.
 * - If the parent symbol is a `Rule`, only `Rule` symbols will be returned.
 * - If the parent symbol is a `Zone`, the returned type depends on the context (either `Zone` or `Rule`).
 */
export async function getForSpan(span: TextSpanWithSymbol): Promise<ZoneSymbol[]> {
  const folder = vscode.workspace.getWorkspaceFolder(span.location.uri);
  if (!folder) {
    return [];
  }
  let expectedType: ZoneSymbolType;
  switch (span.symbol.type) {
    case 'Link':
      expectedType = 'Zone';
      break;
    case 'Rule':
      expectedType = 'Rule';
      break;
    case 'Zone':
      expectedType = span.text.includes('/') ? 'Zone' : 'Rule';
      break;
  }
  const allSymbols = await getForFolder(folder);
  return allSymbols.filter((symbol) => {
    if (expectedType && symbol.type !== expectedType) {
      return false;
    }
    return symbol.name.text === span.text;
  });
}

/**
 * Get all text spans for symbols that link to a given text span.
 * This is primarily used for finding references to a location.
 * Text spans are restricted to the same workspace folder as the text span.
 */
export async function getSpanLinksToName(span: ZoneSymbolTextSpan): Promise<ZoneSymbolTextSpan[]> {
  const folder = vscode.workspace.getWorkspaceFolder(span.location.uri);
  if (!folder) {
    return [];
  }
  const allSymbols = await getForFolder(folder);
  return allSymbols.flatMap((symbol) => {
    if (symbol.name.text === span.text) {
      return [symbol.name];
    }
    return symbol.references.filter((ref) => ref.text === span.text);
  });
}

/**
 * Get a text span for a symbol that includes the given document position.
 * Returns null if there are no symbols matching the position.
 */
export function getSpanForDocumentPosition(
  document: vscode.TextDocument,
  position: vscode.Position,
): TextSpanWithSymbol | null {
  const docSymbols = getForDocument(document);
  for (let symbol of docSymbols) {
    if (!symbol.totalRange.range.contains(position)) {
      continue;
    }
    if (symbol.name.location.range.contains(position)) {
      return {
        ...symbol.name,
        symbol,
      };
    }
    for (let ref of symbol.references) {
      if (ref.location.range.contains(position)) {
        return {
          ...ref,
          symbol,
        };
      }
    }
  }
  return null;
}
