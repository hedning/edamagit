import * as vscode from 'vscode';

enum ParseState {
    COMMIT_MESSAGE,
    COMMENT,
    DIFF_HEADER,
    FILE_HEADER,
    HUNK_HEADER,
    HUNK_CONTENT
}

function parse(text: string) {
    const ranges: { r: vscode.FoldingRange, t: ParseState }[] = [];
    const lines = text.split('\n');

    let state = ParseState.COMMIT_MESSAGE;
    let fileStart = -1;
    let commentStart = -1;
    let hunkStart = -1;
    let currentLine = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        currentLine = i;

        switch (state) {
            case ParseState.COMMIT_MESSAGE: {
                if (line.startsWith('#')) {
                    state = ParseState.COMMENT;
                    commentStart = i;
                }
                break;
            }
            case ParseState.COMMENT: {
                if (line.startsWith('diff --git ')) {
                    ranges.push({ r: new vscode.FoldingRange(commentStart, i - 1), t: ParseState.COMMENT });
                    state = ParseState.DIFF_HEADER;
                    fileStart = i;
                }
                break;
            }
            case ParseState.DIFF_HEADER: {
                if (line.startsWith('index ')) {
                    // Continue in diff header
                } else if (line.startsWith('--- ') || line.startsWith('+++ ')) {
                    state = ParseState.FILE_HEADER;
                } else if (line.startsWith('@@ ')) {
                    // Direct jump to hunk (no file header)
                    state = ParseState.HUNK_HEADER;
                    hunkStart = i;
                }
                break;
            }

            case ParseState.FILE_HEADER: {
                if (line.startsWith('@@ ')) {
                    state = ParseState.HUNK_HEADER;
                    hunkStart = i;
                }
                break;
            }

            case ParseState.HUNK_HEADER: {
                if (line.startsWith('@@ ')) {
                    // End previous hunk, start new one
                    if (hunkStart !== -1 && i > hunkStart) {
                        ranges.push({ r: new vscode.FoldingRange(hunkStart, i - 1), t: ParseState.HUNK_HEADER });
                    }
                    hunkStart = i;
                } else if (line.startsWith('diff --git ')) {
                    // End current file and start new one
                    if (hunkStart !== -1 && i > hunkStart) {
                        ranges.push({ r: new vscode.FoldingRange(hunkStart, i - 1), t: ParseState.HUNK_HEADER });
                    }
                    if (fileStart !== -1 && i > fileStart) {
                        ranges.push({ r: new vscode.FoldingRange(fileStart, i - 1), t: ParseState.FILE_HEADER });
                    }
                    state = ParseState.DIFF_HEADER;
                    fileStart = i;
                    hunkStart = -1;
                } else {
                    // Hunk content
                    state = ParseState.HUNK_CONTENT;
                }
                break;
            }

            case ParseState.HUNK_CONTENT: {
                if (line.startsWith('@@ ')) {
                    // End previous hunk, start new one
                    if (hunkStart !== -1 && i > hunkStart) {
                        ranges.push({ r: new vscode.FoldingRange(hunkStart, i - 1), t: ParseState.HUNK_HEADER });
                    }
                    hunkStart = i;
                    state = ParseState.HUNK_HEADER;
                } else if (line.startsWith('diff --git ')) {
                    // End current file and start new one
                    if (hunkStart !== -1 && i > hunkStart) {
                        ranges.push({ r: new vscode.FoldingRange(hunkStart, i - 1), t: ParseState.HUNK_HEADER });
                    }
                    if (fileStart !== -1 && i > fileStart) {
                        ranges.push({ r: new vscode.FoldingRange(fileStart, i - 1), t: ParseState.FILE_HEADER });
                    }
                    state = ParseState.DIFF_HEADER;
                    fileStart = i;
                    hunkStart = -1;
                }
                break;
            }
        }
    }

    // Handle end of file
    // if (state === ParseState.HUNK_CONTENT || state === ParseState.HUNK_HEADER) {
    if (hunkStart !== -1 && currentLine > hunkStart) {
        ranges.push({ r: new vscode.FoldingRange(hunkStart, currentLine), t: ParseState.HUNK_HEADER });
    }
    // }
    if (fileStart !== -1 && currentLine > fileStart) {
        ranges.push({ r: new vscode.FoldingRange(fileStart, currentLine), t: ParseState.FILE_HEADER });
    }

    return ranges;
}

export class GitCommitFolding implements vscode.FoldingRangeProvider {
    onDidChangeFoldingRanges?: vscode.Event<void> | undefined;

    provideFoldingRanges(
        document: vscode.TextDocument,
        context: vscode.FoldingContext,
        token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.FoldingRange[]> {
        return parse(document.getText()).map(r => r.r)
    }
}

export class GitSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken) {
        return parse(document.getText()).map(r => {
            const start = document.lineAt(r.r.start)
            const end = document.lineAt(r.r.end)
            const k = r.t === ParseState.FILE_HEADER ? vscode.SymbolKind.File : vscode.SymbolKind.Object;
            return new vscode.DocumentSymbol(start.text, '', k, start.range.union(end.range), start.range)
        })
    }
}
