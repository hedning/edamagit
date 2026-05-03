import { defineConfig } from '@vscode/test-cli';

// Allow pointing at a local VS Code install (skips download). Falls back to
// the system path used by the previous runner.
const fromPath = process.env.VSCODE_TEST_PATH ?? '/usr/share/code/code';

export default defineConfig({
  files: 'out/src/test/suite/**/*.test.js',
  useInstallation: { fromPath },
  // vscode.git is built into the VS Code install pointed at by `fromPath`,
  // so don't try to download a fresh VS Code just to install dependencies.
  skipExtensionDependencies: true,
  // Force X11 — under xvfb (CI/headless), VS Code would otherwise pick a
  // Wayland session that isn't actually accessible and crash on startup.
  launchArgs: ['--ozone-platform=x11'],
  mocha: {
    ui: 'tdd',
    timeout: 20000,
  },
});
