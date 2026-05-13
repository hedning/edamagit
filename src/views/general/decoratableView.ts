import { Range } from 'vscode';

export type DecorationKind = 'added' | 'removed';

export interface DecorationRange {
  kind: DecorationKind;
  range: Range;
}

export interface DecoratableView {
  getDecorations(): DecorationRange[];
}

export function isDecoratableView(v: unknown): v is DecoratableView {
  return typeof (v as DecoratableView)?.getDecorations === 'function';
}
