import * as vscode from 'vscode';

function parse(text: string) {
    const ranges: vscode.FoldingRange[] = [];
    const lines = text.split('\n');

    enum ParseState {
        COMMIT_MESSAGE,
        DIFF_HEADER,
        FILE_HEADER,
        HUNK_HEADER,
        HUNK_CONTENT
    }

    let state = ParseState.COMMIT_MESSAGE;
    let fileStart = -1;
    let hunkStart = -1;
    let currentLine = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        currentLine = i;

        switch (state) {
            case ParseState.COMMIT_MESSAGE: {
                if (line.startsWith('diff --git ')) {
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
                } else if (line.trim() === '') {
                    // End of diff section
                    if (fileStart >= 0 && i > fileStart) {
                        ranges.push(new vscode.FoldingRange(fileStart, i - 1));
                    }
                    state = ParseState.COMMIT_MESSAGE;
                    fileStart = -1;
                }
                break;
            }

            case ParseState.FILE_HEADER: {
                if (line.startsWith('@@ ')) {
                    state = ParseState.HUNK_HEADER;
                    hunkStart = i;
                } else if (line.trim() === '') {
                    // End of diff section
                    if (fileStart >= 0 && i > fileStart) {
                        ranges.push(new vscode.FoldingRange(fileStart, i - 1));
                    }
                    state = ParseState.COMMIT_MESSAGE;
                    fileStart = -1;
                }
                break;
            }

            case ParseState.HUNK_HEADER: {
                if (line.startsWith('@@ ')) {
                    // End previous hunk, start new one
                    if (hunkStart >= 0 && i > hunkStart) {
                        ranges.push(new vscode.FoldingRange(hunkStart, i - 1));
                    }
                    hunkStart = i;
                } else if (line.startsWith('diff --git ')) {
                    // End current file and start new one
                    if (hunkStart >= 0 && i > hunkStart) {
                        ranges.push(new vscode.FoldingRange(hunkStart, i - 1));
                    }
                    if (fileStart >= 0 && i > fileStart) {
                        ranges.push(new vscode.FoldingRange(fileStart, i - 1));
                    }
                    state = ParseState.DIFF_HEADER;
                    fileStart = i;
                    hunkStart = -1;
                } else if (line.trim() === '') {
                    // End of diff section
                    if (hunkStart >= 0 && i > hunkStart) {
                        ranges.push(new vscode.FoldingRange(hunkStart, i - 1));
                    }
                    if (fileStart >= 0 && i > fileStart) {
                        ranges.push(new vscode.FoldingRange(fileStart, i - 1));
                    }
                    state = ParseState.COMMIT_MESSAGE;
                    fileStart = -1;
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
                    if (hunkStart >= 0 && i > hunkStart) {
                        ranges.push(new vscode.FoldingRange(hunkStart, i - 1));
                    }
                    hunkStart = i;
                    state = ParseState.HUNK_HEADER;
                } else if (line.startsWith('diff --git ')) {
                    // End current file and start new one
                    if (hunkStart >= 0 && i > hunkStart) {
                        ranges.push(new vscode.FoldingRange(hunkStart, i - 1));
                    }
                    if (fileStart >= 0 && i > fileStart) {
                        ranges.push(new vscode.FoldingRange(fileStart, i - 1));
                    }
                    state = ParseState.DIFF_HEADER;
                    fileStart = i;
                    hunkStart = -1;
                } else if (line.trim() === '') {
                    // End of diff section
                    if (hunkStart >= 0 && i > hunkStart) {
                        ranges.push(new vscode.FoldingRange(hunkStart, i - 1));
                    }
                    if (fileStart >= 0 && i > fileStart) {
                        ranges.push(new vscode.FoldingRange(fileStart, i - 1));
                    }
                    state = ParseState.COMMIT_MESSAGE;
                    fileStart = -1;
                    hunkStart = -1;
                }
                break;
            }
        }
    }

    // Handle end of file
    if (state === ParseState.HUNK_CONTENT || state === ParseState.HUNK_HEADER) {
        if (hunkStart >= 0 && currentLine > hunkStart) {
            ranges.push(new vscode.FoldingRange(hunkStart, currentLine));
        }
    }
    if (fileStart >= 0 && currentLine > fileStart) {
        ranges.push(new vscode.FoldingRange(fileStart, currentLine));
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
        return parse(document.getText())
    }
}
