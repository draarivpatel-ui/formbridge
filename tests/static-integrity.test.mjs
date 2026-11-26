import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

test('profile JSON textarea has a programmatic label', () => {
  const app = readFileSync(path.join(root, 'src/app.js'), 'utf8');
  assert.match(app, /id="profile-json-title"/, 'profile JSON heading has a stable label id');
  assert.match(app, /aria-labelledby="profile-json-title"/, 'profile JSON textarea is programmatically labelled');
});
