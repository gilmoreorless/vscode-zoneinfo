import { createHash } from 'crypto';
import { TextDocument } from 'vscode';

/**
 * Generate a sha256 hash of a string
 */
export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Generate a sha256 hash of a document's contents.
 */
export function documentHash(document: TextDocument): string {
  return contentHash(document.getText());
}
