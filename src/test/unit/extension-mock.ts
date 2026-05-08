// Stub of the `../extension` module for unit tests. The real module pulls in
// the entire VS Code extension activation graph; views only need a few exports
// for module evaluation to succeed.

export const magitConfig: {
  displayBufferSameColumn?: boolean;
  forgeEnabled?: boolean;
  hiddenStatusSections: Set<string>;
  quickSwitchEnabled?: boolean;
  winGitPath?: string;
} = {
  hiddenStatusSections: new Set<string>(),
};

export const views = new Map<string, unknown>();
export const magitRepositories = new Map<string, unknown>();
export const processLog: unknown[] = [];
export const gitApi: unknown = undefined;
export const logPath: string = '';
