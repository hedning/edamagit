import * as fs from 'fs';
import * as path from 'path';

export function findProjectRoot(start: string = __dirname): string {
  // tsconfig.json is unique to the source tree; package.json also exists
  // under out/ after tsc, so we don't use it as a marker.
  let dir = start;
  while (true) {
    if (fs.existsSync(path.join(dir, 'tsconfig.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('tsconfig.json not found walking up from ' + start);
    dir = parent;
  }
}

export const FIXTURES_SRC_DIR = path.join(findProjectRoot(), 'src', 'test', 'unit', 'fixtures');
