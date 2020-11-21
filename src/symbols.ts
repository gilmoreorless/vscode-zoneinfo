import * as vscode from 'vscode';

import { documentHash } from './hash';
import * as cache from './symbol-cache';
import * as parser from './symbol-parser';
import { ZoneSymbol, ZoneSymbolTextSpan } from './zone-symbol';
import { timer } from './debug';

/**
 * Get all symbols for a document and sync them with the cache.
 * This will only parse the document for symbols when the document's content hash doesn't match
 * the cached value.
 */
function updateDocument(document: vscode.TextDocument): {
  symbols: ZoneSymbol[],
  didUpdate: boolean,
} {
  let filename = document.fileName.split('/').pop();
  console.log(`[updateDocument ${filename}]`);
  let logTime = timer();
  let shouldUpdate = false;
  let symbols: ZoneSymbol[] = [];
  const hash = documentHash(document);
  const cachedDocument = cache.getForDocument(document);
  logTime(`[updateDocument ${filename}]: hash and get`);
  if (!cachedDocument) {
    console.log(`[updateDocument ${filename}]: not in cache`);
    shouldUpdate = true;
  } else {
    console.log(`[updateDocument ${filename}]: already cached`);
    symbols = cachedDocument.symbols;
    if (cachedDocument.hash !== hash) {
      console.log(`[updateDocument ${filename}]: cached hash didn't match`);
      shouldUpdate = true;
    }
  }

  if (shouldUpdate) {
    console.log(`[updateDocument ${filename}]: parsing`);
    symbols = parser.parseDocument(document);
    cache.setForDocument(document, hash, symbols);
  }
  logTime(`[updateDocument ${filename}]: total`);
  return { symbols, didUpdate: shouldUpdate };
}

// TODO: Copied from symbol-parser, clean this up
type DocumentSymbols = { file: vscode.Uri; symbols: ZoneSymbol[] };
type FolderSymbols = { path: string; documents: DocumentSymbols[] };

/**
 * Get all symbols for documents within a folder, parsing only the ones that haven't been cached.
 */
async function updateFolder(folder: vscode.WorkspaceFolder): Promise<{
  path: string,
  documents: DocumentSymbols[],
}> {
  console.log(`[updateFolder] ${folder.name}`);
  let logTime = timer();
  const filenames = `{${parser.PARSEABLE_FILENAMES.join(',')}}`;
  const findArg = new vscode.RelativePattern(folder, filenames);
  const files: vscode.Uri[] = await vscode.workspace.findFiles(findArg);
  logTime(`[updateFolder: ${folder.name}]: findFiles`);
  
  let docSymbols: DocumentSymbols[] = [];
  let openDocuments = vscode.workspace.textDocuments;
  console.log('  [openDocuments]', openDocuments.map(doc => doc.fileName));
  for (let file of files) {
    docSymbols.push(await (async () => {
      let filename = file.toString().split('/').pop();
      let logFileTime = timer();

      const doc = await vscode.workspace.openTextDocument(file);
      logFileTime(`${filename}: open`);
      const { symbols } = updateDocument(doc);
      logFileTime(`${filename}: parse/cache`);

      return { file, symbols };
    })());
  }
  const path = folder.uri.toString();
  logTime(`[updateFolder: ${folder.name}]: TOTAL`);

  // TODO: Do I actually need to return DocumentSymbols here?
  return {
    path,
    documents: docSymbols,
  }
}

/**
 * Get all symbols for relevant documents within the current workspace.
 */
async function updateWorkspace(): Promise<{
  folders: FolderSymbols[],
}> {
  const start = Date.now();
  let folders = vscode.workspace.workspaceFolders;
  if (folders === undefined || !folders.length) {
    return {
      folders: [],
    };
  }

  let ret: FolderSymbols[] = [];
  for (let folder of folders) {
    ret.push(await (async () => {
      // TODO: Only parse folders that aren't already cached
      const { path, documents } = await updateFolder(folder);

      return { path, documents };
    })());
  }
  const end = Date.now();
  console.log(`[updateWorkspace] TOOK ${end - start}`);
  
  return { folders: ret };
}

/**
 * Get all symbols for a document.
 */
export function getForDocument(document: vscode.TextDocument): ZoneSymbol[] {
  const updateResult = updateDocument(document);
  return updateResult.symbols;
}

/**
 * Get all symbols for relevant documents within a folder.
 * Uses a cached list if the folder has previously been parsed.
 */
export async function getForFolder(folder: vscode.WorkspaceFolder): Promise<ZoneSymbol[]> {
  console.log(`[getForFolder] ${folder.name}`);
  const cached = cache.getForFolder(folder);
  if (cached) {
    return cached.symbols;
  }
  console.log('  (not cached, parsing...)');
  const parsed = await updateFolder(folder);
  // TODO: Move everything below into updateFolder() ?
  let allSymbols = parsed.documents.flatMap(doc => doc.symbols);
  cache.setForFolder(folder, allSymbols);
  return allSymbols;
}

/**
 * Get all symbols for relevant documents within the current workspace.
 * Uses a cached list if all folders in the workspace have previously been parsed.
 */
export async function getForWorkspace(): Promise<ZoneSymbol[]> {
  console.log('[getForWorkspace]');
  const cached = cache.getForWorkspace();
  if (cached) {
    return cached.symbols;
  }
  console.log('  (not cached, parsing...)');
  const parsed = await updateWorkspace();
  // TODO: Move everything below into updateWorkspace() ?
  let allSymbols = parsed.folders.flatMap(folder => {
    let folderSymbols = folder.documents.flatMap(doc => doc.symbols);
    cache.setForFolder(folder.path, folderSymbols);
    return folderSymbols;
  });
  cache.setForWorkspace(allSymbols);
  return allSymbols;
}

/**
 * Get all symbols with names that match a given text span.
 * Symbols are restricted to the same workspace folder as the text span.
 */
export async function getForSpan(span: ZoneSymbolTextSpan): Promise<ZoneSymbol[]> {
  const folder = vscode.workspace.getWorkspaceFolder(span.location.uri);
  const allSymbols = await getForFolder(folder);
  return allSymbols.filter((s) => s.name.text === span.text);
}

/**
 * Get all text spans for symbols that link to a given text span.
 * This is primarily used for finding references to a location.
 * Text spans are restricted to the same workspace folder as the text span.
 */
export async function getSpanLinksToName(span: ZoneSymbolTextSpan): Promise<ZoneSymbolTextSpan[]> {
  const folder = vscode.workspace.getWorkspaceFolder(span.location.uri);
  const allSymbols = await getForFolder(folder);
  return allSymbols
    .map((symbol) => {
      if (symbol.name.text === span.text) {
        return [symbol.name];
      }
      return symbol.references.filter((ref) => ref.text === span.text);
    })
    .reduce((all, spans) => all.concat(spans), []);
}

/**
 * Get a text span for a symbol that includes the given document position.
 * Returns null if there are no symbols matching the position.
 */
export function getSpanForDocumentPosition(
  document: vscode.TextDocument,
  position: vscode.Position,
): ZoneSymbolTextSpan {
  const docSymbols = getForDocument(document);
  for (let symbol of docSymbols) {
    if (symbol.name.location.range.contains(position)) {
      return symbol.name;
    }
    for (let ref of symbol.references) {
      if (ref.location.range.contains(position)) {
        return ref;
      }
    }
  }
  return null;
}

/**
 * De-duplicate a list of symbols.
 */
export function unique(symbols: ZoneSymbol[]): ZoneSymbol[] {
  let used = new Set();
  return symbols.filter((symbol) => {
    const key = [symbol.type, symbol.name.text, symbol.name.location.uri.toString()].join(':');
    if (used.has(key)) {
      return false;
    }
    used.add(key);
    return true;
  });
}
