import { type ChangeEvent, type FormEvent, useState } from 'react'
import './App.css'
import {
  addSection,
  createInterviewPrepNotebook,
  removeSection,
  renameSection,
} from './notebook/notebook'

function App() {
  const [notebook, setNotebook] = useState(createInterviewPrepNotebook)
  const [newSectionName, setNewSectionName] = useState('')

  function handleRenameSection(sectionId: string, nextName: string) {
    setNotebook((currentNotebook) =>
      renameSection(currentNotebook, sectionId, nextName),
    )
  }

  function handleAddSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = newSectionName.trim()

    if (trimmedName.length === 0) {
      return
    }

    setNotebook((currentNotebook) => addSection(currentNotebook, trimmedName))
    setNewSectionName('')
  }

  function handleNewSectionNameChange(event: ChangeEvent<HTMLInputElement>) {
    setNewSectionName(event.target.value)
  }

  return (
    <main className="app-shell">
      <section className="notebook-card" aria-labelledby="notebook-title">
        <p className="eyebrow">Private by default</p>
        <h1 id="notebook-title">{notebook.name}</h1>
        <p className="lede">
          A local Interview Prep Notebook for rough DSA, System Design, and
          Research work. Starter Sections are editable and removable.
        </p>

        <form className="add-section" onSubmit={handleAddSection}>
          <label htmlFor="new-section-name">New Section name</label>
          <div>
            <input
              id="new-section-name"
              type="text"
              value={newSectionName}
              onChange={handleNewSectionNameChange}
              placeholder="Behavioral"
            />
            <button type="submit">Add Section</button>
          </div>
        </form>

        <ul className="section-list" aria-label="Notebook Sections">
          {notebook.sections.map((section) => (
            <li key={section.id} aria-label={`${section.name} Section`}>
              <label htmlFor={`${section.id}-name`}>Section name</label>
              <input
                id={`${section.id}-name`}
                type="text"
                value={section.name}
                aria-label={`Rename ${section.name} Section`}
                onChange={(event) =>
                  handleRenameSection(section.id, event.target.value)
                }
              />
              <button
                type="button"
                onClick={() =>
                  setNotebook((currentNotebook) =>
                    removeSection(currentNotebook, section.id),
                  )
                }
              >
                Remove {section.name} Section
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

export default App
