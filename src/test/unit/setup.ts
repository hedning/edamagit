// Mocha setup that intercepts `require('vscode')` and routes it to a stub
// implementation so unit tests can run under plain Node without the
// Extension Development Host.

import * as Module from 'module';
import * as path from 'path';

const mockPath = path.resolve(__dirname, './vscode-mock.js');

// Patch Module._resolveFilename so any `require('vscode')` resolves to our mock.
const moduleAny = Module as unknown as {
  _resolveFilename: (request: string, parent: NodeJS.Module, ...rest: unknown[]) => string;
};
const originalResolve = moduleAny._resolveFilename;
moduleAny._resolveFilename = function (request, parent, ...rest) {
  if (request === 'vscode') {
    return mockPath;
  }
  return originalResolve.call(this, request, parent, ...rest);
};
