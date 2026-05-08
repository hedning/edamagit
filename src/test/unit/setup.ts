// Mocha setup that intercepts `require('vscode')` and `require('../extension')`
// calls so unit tests can run under plain Node without the Extension
// Development Host. The vscode and extension stubs live alongside this file.

import * as Module from 'module';
import * as path from 'path';

const vscodeMockPath = path.resolve(__dirname, './vscode-mock.js');
const extensionMockPath = path.resolve(__dirname, './extension-mock.js');
const realExtensionPath = path.resolve(__dirname, '../../extension.js');

const moduleAny = Module as unknown as {
  _resolveFilename: (request: string, parent: NodeJS.Module, ...rest: unknown[]) => string;
};
const originalResolve = moduleAny._resolveFilename;
moduleAny._resolveFilename = function (request, parent, ...rest) {
  if (request === 'vscode') {
    return vscodeMockPath;
  }
  const resolved = originalResolve.call(this, request, parent, ...rest);
  if (resolved === realExtensionPath) {
    return extensionMockPath;
  }
  return resolved;
};
