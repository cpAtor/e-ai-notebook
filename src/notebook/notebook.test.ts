import { describe, expect, it } from 'vitest'
import { addSection, createInterviewPrepNotebook, removeSection, renameSection } from './notebook'

describe('Interview Prep Notebook', () => {
  it('starts as one private Notebook with editable starter Sections', () => {
    const notebook = createInterviewPrepNotebook()

    expect(notebook.name).toBe('Interview Prep Notebook')
    expect(notebook.privateByDefault).toBe(true)
    expect(notebook.sections.map((section) => section.name)).toEqual([
      'DSA',
      'System Design',
      'Research',
    ])
    expect(notebook.sections.every((section) => section.editable)).toBe(true)
  })
})

it('renames, adds, and removes Sections without protecting starter defaults', () => {
  const notebook = createInterviewPrepNotebook()
  const dsaSection = notebook.sections[0]

  expect(dsaSection).toBeDefined()
  if (!dsaSection) {
    throw new Error('Expected starter DSA Section')
  }

  const renamed = renameSection(notebook, dsaSection.id, 'Algorithms')
  const withNewSection = addSection(renamed, 'Behavioral')
  const withoutStarterSection = removeSection(withNewSection, dsaSection.id)

  expect(withoutStarterSection.sections.map((section) => section.name)).toEqual([
    'System Design',
    'Research',
    'Behavioral',
  ])
})
