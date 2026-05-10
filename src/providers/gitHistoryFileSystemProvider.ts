import * as vscode from 'vscode';
import * as path from 'path';
import { gitRunInUri, LogLevel } from '../utils/gitRawRunner';
import { parseHistoryUri } from '../common/historyUri';


export class GitHistoryFileSystemProvider implements vscode.FileSystemProvider {

    onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = new vscode.EventEmitter<vscode.FileChangeEvent[]>().event;

    watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        // Watching is not supported for git history
        return new vscode.Disposable(() => { });
    }

    stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
        return Promise.resolve({
            type: vscode.FileType.File,
            ctime: 0,
            mtime: 0,
            size: 0,
        });
    }

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
        throw vscode.FileSystemError.FileNotADirectory(uri);
    }

    createDirectory(uri: vscode.Uri): void | Thenable<void> {
        throw vscode.FileSystemError.NoPermissions(uri);
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        console.log('[magit:gitHistoryFs.readFile] uri=%s', uri.toString());
        const parts = parseHistoryUri(uri);
        if (!parts) throw vscode.FileSystemError.FileNotFound(uri);

        const repoUri = vscode.Uri.file(parts.repoFsPath);
        const relativePath = path.relative(parts.repoFsPath, parts.fileFsPath);
        console.log('[magit:gitHistoryFs.readFile] repoRoot=%s relativePath=%s commit=%s',
            parts.repoFsPath, relativePath, parts.commit);

        try {
            const result = await gitRunInUri(repoUri, ['show', `${parts.commit}:${relativePath}`], {}, LogLevel.Error);
            return Buffer.from(result.stdout, 'utf8');
        } catch (e: any) {
            // The file may not exist at <commit> because the commit *deleted*
            // it — in a commit detail view, the user expects to see the file's
            // content, which only exists at the parent. Fall back to <commit>~.
            // If that also fails, surface the original error.
            console.log('[magit:gitHistoryFs.readFile] git show failed: %o', e?.stderr ?? e?.message ?? e);
            if (typeof e?.stderr === 'string' && /does not exist in/.test(e.stderr)) {
                console.log('[magit:gitHistoryFs.readFile] retrying at %s~', parts.commit);
                try {
                    const fallback = await gitRunInUri(repoUri, ['show', `${parts.commit}~:${relativePath}`], {}, LogLevel.Error);
                    return Buffer.from(fallback.stdout, 'utf8');
                } catch (fallbackErr: any) {
                    throw vscode.FileSystemError.FileNotFound(fallbackErr?.stderr ?? fallbackErr?.message ?? String(fallbackErr));
                }
            }
            throw vscode.FileSystemError.FileNotFound(e?.stderr ?? e?.message ?? String(e));
        }
    }


    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): void | Thenable<void> {
        throw vscode.FileSystemError.NoPermissions(uri);
    }

    delete(uri: vscode.Uri, options: { recursive: boolean }): void | Thenable<void> {
        throw vscode.FileSystemError.NoPermissions(uri);
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void | Thenable<void> {
        throw vscode.FileSystemError.NoPermissions(oldUri);
    }
}
