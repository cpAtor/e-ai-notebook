const STARTER_SECTIONS = [
  ['section-dsa', 'DSA'],
  ['section-system-design', 'System Design'],
  ['section-research', 'Research'],
];

export function createInitialNotebook(now = new Date().toISOString()) {
  return {
    id: 'interview-prep-notebook',
    title: 'Interview Prep Notebook',
    visibility: 'private',
    createdAt: now,
    updatedAt: now,
    sections: STARTER_SECTIONS.map(([id, title]) => ({
      id,
      title,
      pages: [],
    })),
  };
}

export function createBlankPage(notebook, sectionId, now = new Date().toISOString()) {
  const page = {
    id: createId('page'),
    title: 'Untitled Page',
    pageType: null,
    createdAt: now,
    updatedAt: now,
    canvas: {
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
    },
  };

  let foundSection = false;
  const updatedNotebook = {
    ...notebook,
    updatedAt: now,
    sections: notebook.sections.map((section) => {
      if (section.id !== sectionId) {
        return section;
      }

      foundSection = true;
      return {
        ...section,
        pages: [...section.pages, page],
      };
    }),
  };

  if (!foundSection) {
    throw new Error(`Section not found: ${sectionId}`);
  }

  return { notebook: updatedNotebook, page };
}

export function updatePageCanvas(notebook, pageId, canvas, now = new Date().toISOString()) {
  return {
    ...notebook,
    updatedAt: now,
    sections: notebook.sections.map((section) => ({
      ...section,
      pages: section.pages.map((page) => (
        page.id === pageId
          ? { ...page, canvas, updatedAt: now }
          : page
      )),
    })),
  };
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
