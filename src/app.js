import { createBlankPage, createInitialNotebook, updatePageCanvas } from './notebook.js';
import { createIndexedDbPersistenceAdapter } from './persistence.js';

const persistence = createIndexedDbPersistenceAdapter({ globalScope: window });
const elements = {
  notebookTitle: document.querySelector('[data-notebook-title]'),
  notebookVisibility: document.querySelector('[data-notebook-visibility]'),
  sections: document.querySelector('[data-sections]'),
  pageTitle: document.querySelector('[data-page-title]'),
  pageMeta: document.querySelector('[data-page-meta]'),
  canvas: document.querySelector('[data-canvas]'),
  canvasText: document.querySelector('[data-canvas-text]'),
  autosaveStatus: document.querySelector('[data-autosave-status]'),
};

let notebook = createInitialNotebook();
let selectedPageId = null;
let autosaveTimer = null;

init();

async function init() {
  const savedNotebook = await persistence.loadNotebook();
  notebook = savedNotebook ?? notebook;
  selectedPageId = findFirstPage(notebook)?.id ?? null;

  render();
  await saveNotebook('Autosaved');
}

function render() {
  const selectedPage = findSelectedPage();

  elements.notebookTitle.textContent = notebook.title;
  elements.notebookVisibility.textContent = `${notebook.visibility} by default`;
  elements.sections.replaceChildren(...notebook.sections.map(renderSection));

  elements.pageTitle.textContent = selectedPage?.title ?? 'Create a blank Page';
  elements.pageMeta.textContent = selectedPage
    ? `Page Type: ${selectedPage.pageType ?? 'none required'}`
    : 'Choose a Section to add your first blank Page.';
  elements.canvas.hidden = !selectedPage;
  elements.canvasText.value = selectedPage?.canvas.nodes[0]?.text ?? '';
}

function renderSection(section) {
  const sectionElement = document.createElement('section');
  sectionElement.className = 'section-card';

  const heading = document.createElement('h3');
  heading.textContent = section.title;

  const list = document.createElement('ul');
  list.className = 'page-list';
  list.append(...section.pages.map(renderPageButton));

  const createButton = document.createElement('button');
  createButton.type = 'button';
  createButton.textContent = 'Create blank Page';
  createButton.addEventListener('click', async () => {
    const result = createBlankPage(notebook, section.id);
    notebook = result.notebook;
    selectedPageId = result.page.id;
    render();
    await saveNotebook('Autosaved blank Page');
  });

  sectionElement.append(heading, list, createButton);
  return sectionElement;
}

function renderPageButton(page) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = page.title;
  button.className = page.id === selectedPageId ? 'page-button active' : 'page-button';
  button.addEventListener('click', () => {
    selectedPageId = page.id;
    render();
  });
  item.append(button);
  return item;
}

elements.canvasText.addEventListener('input', () => {
  const selectedPage = findSelectedPage();
  if (!selectedPage) {
    return;
  }

  const canvas = {
    ...selectedPage.canvas,
    nodes: elements.canvasText.value
      ? [{ id: 'node-notes', x: 0, y: 0, text: elements.canvasText.value }]
      : [],
  };
  notebook = updatePageCanvas(notebook, selectedPage.id, canvas);
  queueAutosave();
});

function queueAutosave() {
  elements.autosaveStatus.textContent = 'Autosaving…';
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    saveNotebook('Autosaved');
  }, 250);
}

async function saveNotebook(message) {
  await persistence.saveNotebook(notebook);
  elements.autosaveStatus.textContent = `${message} ${new Date().toLocaleTimeString()}`;
}

function findSelectedPage() {
  return notebook.sections.flatMap((section) => section.pages).find((page) => page.id === selectedPageId) ?? null;
}

function findFirstPage(sourceNotebook) {
  return sourceNotebook.sections.flatMap((section) => section.pages)[0] ?? null;
}
