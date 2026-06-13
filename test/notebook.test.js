import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createBlankPage, createInitialNotebook } from '../src/notebook.js';
import { createMemoryPersistenceAdapter } from '../src/persistence.js';

test('creates the private Interview Prep Notebook with starter Sections', () => {
  const notebook = createInitialNotebook();

  assert.equal(notebook.title, 'Interview Prep Notebook');
  assert.equal(notebook.visibility, 'private');
  assert.deepEqual(
    notebook.sections.map((section) => section.title),
    ['DSA', 'System Design', 'Research'],
  );
});

test('creates a blank Page in a Section without required Page Type metadata', () => {
  const notebook = createInitialNotebook();
  const { notebook: updatedNotebook, page } = createBlankPage(notebook, notebook.sections[0].id);

  assert.equal(page.title, 'Untitled Page');
  assert.equal(page.pageType, null);
  assert.deepEqual(page.canvas.nodes, []);
  assert.equal(updatedNotebook.sections[0].pages[0].id, page.id);
});

test('persists notebook state through an app-facing adapter', async () => {
  const adapter = createMemoryPersistenceAdapter();
  const notebook = createInitialNotebook();
  const { notebook: updatedNotebook } = createBlankPage(notebook, notebook.sections[1].id);

  await adapter.saveNotebook(updatedNotebook);

  assert.deepEqual(await adapter.loadNotebook(), updatedNotebook);
});

test('application code uses the persistence adapter boundary instead of raw IndexedDB', async () => {
  const appSource = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');

  assert.match(appSource, /createIndexedDbPersistenceAdapter/);
  assert.doesNotMatch(appSource, /\bindexedDB\b/);
});
