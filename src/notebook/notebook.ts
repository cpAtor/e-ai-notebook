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
