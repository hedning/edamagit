import { DocumentSelector } from 'vscode';

export const LineSplitterRegex: RegExp = /\r?\n/g;

export const FinalLineBreakRegex: RegExp = /\r?\n$/g;

export const StatusMessageDisplayTimeout: number = 10000;

export const MagitUriScheme: string = 'magit';
export const MagitHistoryUriScheme: string = 'magit-history';

export const MagitDocumentSelector: DocumentSelector = { scheme: MagitUriScheme, language: MagitUriScheme };

// Must match the semanticTokenTypes in package.json
export enum SemanticTokenTypes {
  RefName = 'magit-ref-name',
  RemoteRefName = 'magit-remote-ref-name',
  HeadName = 'magit-head-name',
  RemoteHeadName = 'magit-remote-head-name',
  TagName = 'magit-tag-name',
}
