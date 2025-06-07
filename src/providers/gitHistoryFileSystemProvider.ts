import * as vscode from 'vscode';
import { promisify } from 'util';
import { gitRunInUri } from '../utils/gitRawRunner';


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
        // dummy uri that vscodes uri tools understands
        const dummy = uri.with({ scheme: 'file', authority: '' });
        const root = vscode.workspace.getWorkspaceFolder(dummy);
        if (!root) throw vscode.FileSystemError.FileNotFound('Could not find workspace root');

        const commit = uri.authority;
        // git expects a relative path
        const path = vscode.workspace.asRelativePath(dummy, false);
        const { stdout, exitCode, stderr } = await gitRunInUri(root.uri, ['show', `${commit}:${path}`], { log: true });
        if (exitCode !== 0) throw vscode.FileSystemError.FileNotFound(stderr);

        return Buffer.from(stdout, 'utf8');
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