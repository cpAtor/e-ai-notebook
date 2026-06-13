export type NotebookId = "notebook_private_interview_prep";
export type SectionId = `section_${string}`;

export interface Section {
  readonly id: SectionId;
  readonly title: string;
}

export interface Notebook {
  readonly id: NotebookId;
  readonly title: string;
  readonly privacyMode: "private-by-default";
  readonly sections: readonly Section[];
}

export const STARTER_SECTION_TITLES = [
  "DSA",
  "System Design",
  "Research"
] as const;

export const createStarterNotebook = (): Notebook => ({
  id: "notebook_private_interview_prep",
  title: "Interview Prep Notebook",
  privacyMode: "private-by-default",
  sections: STARTER_SECTION_TITLES.map((title) => ({
    id: sectionIdFromTitle(title),
    title
  }))
});

export const renameSection = (
  notebook: Notebook,
  sectionId: SectionId,
  nextTitle: string
): Notebook => {
  const title = normalizeSectionTitle(nextTitle);

  return {
    ...notebook,
    sections: notebook.sections.map((section) =>
      section.id === sectionId ? { ...section, title } : section
    )
  };
};

export const addSection = (
  notebook: Notebook,
  sectionId: SectionId,
  title: string
): Notebook => ({
  ...notebook,
  sections: [
    ...notebook.sections,
    {
      id: sectionId,
      title: normalizeSectionTitle(title)
    }
  ]
});

export const removeSection = (
  notebook: Notebook,
  sectionId: SectionId
): Notebook => ({
  ...notebook,
  sections: notebook.sections.filter((section) => section.id !== sectionId)
});

export const createSectionId = (): SectionId => {
  if (globalThis.crypto?.randomUUID !== undefined) {
    return `section_${globalThis.crypto.randomUUID()}`;
  }

  return `section_${Date.now().toString(36)}`;
};

const sectionIdFromTitle = (title: string): SectionId =>
  `section_${title.toLowerCase().replaceAll(" ", "_")}`;

const normalizeSectionTitle = (title: string): string => {
  const trimmedTitle = title.trim();

  if (trimmedTitle.length === 0) {
    throw new Error("Section title cannot be empty.");
  }

  return trimmedTitle;
};
