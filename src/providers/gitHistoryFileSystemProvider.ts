import * as vscode from 'vscode';
import * as path from 'path';
import { promisify } from 'util';
import { gitRunInUri, LogLevel } from '../utils/gitRawRunner';


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
        const fileUri = uri.with({ scheme: 'file', authority: '' });
        const fileDir = vscode.Uri.file(path.dirname(fileUri.fsPath));

        // Resolve the repo via `git rev-parse --show-toplevel` from the file's
        // directory so worktrees pick the right root — VS Code's workspace
        // folder may be the main repo while the file lives inside a worktree
        // checkout, in which case `asRelativePath` would yield a path that
        // doesn't exist at the commit being shown. gitRunInUri rejects on
        // non-zero exit, so failures surface here as FileNotFound.
        try {
            const top = await gitRunInUri(fileDir, ['rev-parse', '--show-toplevel'], {}, LogLevel.Error);
            const repoRoot = vscode.Uri.file(top.stdout.trimEnd());

            const commit = uri.authority;
            const relativePath = path.relative(repoRoot.fsPath, fileUri.fsPath);
            const result = await gitRunInUri(repoRoot, ['show', `${commit}:${relativePath}`], {}, LogLevel.Error);
            return Buffer.from(result.stdout, 'utf8');
        } catch (e: any) {
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

    private parseUri(uri: vscode.Uri): { commit: string; filePath: string } {
        const commit = uri.authority;
        const filePath = uri.path.slice(1); // Remove leading slash
        return { commit, filePath };
    }
}