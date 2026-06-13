export type Section = {
  readonly id: string
  readonly name: string
  readonly editable: true
}

export type Notebook = {
  readonly id: string
  readonly name: string
  readonly privateByDefault: true
  readonly sections: readonly Section[]
}

const starterSectionNames = ['DSA', 'System Design', 'Research'] as const

export function createInterviewPrepNotebook(): Notebook {
  return {
    id: 'notebook_interview_prep',
    name: 'Interview Prep Notebook',
    privateByDefault: true,
    sections: starterSectionNames.map((name, index) => ({
      id: `section_${index + 1}`,
      name,
      editable: true,
    })),
  }
}

export function renameSection(
  notebook: Notebook,
  sectionId: string,
  nextName: string,
): Notebook {
  return {
    ...notebook,
    sections: notebook.sections.map((section) =>
      section.id === sectionId ? { ...section, name: nextName } : section,
    ),
  }
}

export function addSection(notebook: Notebook, name: string): Notebook {
  return {
    ...notebook,
    sections: [
      ...notebook.sections,
      {
        id: `section_${nextSectionNumber(notebook.sections)}`,
        name,
        editable: true,
      },
    ],
  }
}

export function removeSection(notebook: Notebook, sectionId: string): Notebook {
  return {
    ...notebook,
    sections: notebook.sections.filter((section) => section.id !== sectionId),
  }
}

function nextSectionNumber(sections: readonly Section[]): number {
  return (
    sections.reduce((highest, section) => {
      const sectionNumber = Number(section.id.replace('section_', ''))
      return Number.isFinite(sectionNumber)
        ? Math.max(highest, sectionNumber)
        : highest
    }, 0) + 1
  )
}
