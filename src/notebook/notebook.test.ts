import { describe, expect, it } from 'vitest'
import { createInterviewPrepNotebook } from './notebook'

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
