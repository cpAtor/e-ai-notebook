import { FormEvent, useRef, useState } from 'react';
import './App.css';

type Section = {
  id: string;
  title: string;
  prompt: string;
};

const starterSections: Section[] = [
  {
    id: 'dsa',
    title: 'DSA',
    prompt: 'Track patterns, complexity notes, and solved problem reflections.',
  },
  {
    id: 'system-design',
    title: 'System Design',
    prompt: 'Capture architecture tradeoffs, diagrams to revisit, and scaling notes.',
  },
  {
    id: 'research',
    title: 'Research',
    prompt: 'Save role-specific questions, company notes, and follow-up reading.',
  },
];

const readTitle = (form: HTMLFormElement): string => {
  const value = new FormData(form).get('title');
  return typeof value === 'string' ? value.trim() : '';
};

function App() {
  const [sections, setSections] = useState<Section[]>(starterSections);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const nextCustomSection = useRef(1);

  const addSection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const title = readTitle(event.currentTarget);
    if (title.length === 0) {
      return;
    }

    setSections((currentSections) => [
      ...currentSections,
      {
        id: `custom-${nextCustomSection.current++}`,
        title,
        prompt: 'Add notes, links, and practice items for this custom Section.',
      },
    ]);
    event.currentTarget.reset();
  };

  const renameSection = (sectionId: string, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const title = readTitle(event.currentTarget);
    if (title.length === 0) {
      return;
    }

    setSections((currentSections) =>
      currentSections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              title,
            }
          : section,
      ),
    );
    setEditingSectionId(null);
  };

  const removeSection = (sectionId: string) => {
    setSections((currentSections) => currentSections.filter((section) => section.id !== sectionId));
  };

  return (
    <main className="notebook-shell">
      <section className="hero" aria-labelledby="notebook-title">
        <p className="eyebrow">Private workspace</p>
        <h1 id="notebook-title">Private Interview Prep Notebook</h1>
        <p>
          A local-first notebook for shaping interview preparation into editable Sections without
          relying on a fixed taxonomy.
        </p>
      </section>

      <section className="section-panel" aria-labelledby="sections-heading">
        <div className="section-panel__heading">
          <div>
            <p className="eyebrow">Sections</p>
            <h2 id="sections-heading">Starter interview prep areas</h2>
          </div>
          <form aria-label="Add Section form" className="section-form" onSubmit={addSection}>
            <label htmlFor="new-section-title">New Section title</label>
            <input id="new-section-title" name="title" placeholder="Behavioral" />
            <button type="submit">Add Section</button>
          </form>
        </div>

        {sections.length > 0 ? (
          <ul className="section-list">
            {sections.map((section) => (
              <li className="section-card" key={section.id}>
                {editingSectionId === section.id ? (
                  <form
                    aria-label="Rename Section form"
                    className="section-form"
                    onSubmit={(event) => renameSection(section.id, event)}
                  >
                    <label htmlFor={`${section.id}-title`}>Section title</label>
                    <input
                      autoFocus
                      defaultValue={section.title}
                      id={`${section.id}-title`}
                      name="title"
                    />
                    <button type="submit">Save Section</button>
                  </form>
                ) : (
                  <>
                    <div>
                      <h3>{section.title}</h3>
                      <p>{section.prompt}</p>
                    </div>
                    <div className="section-actions">
                      <button
                        type="button"
                        aria-label={`Rename ${section.title} Section`}
                        onClick={() => setEditingSectionId(section.id)}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${section.title} Section`}
                        onClick={() => removeSection(section.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">Add a Section to start shaping your notebook.</p>
        )}
      </section>
    </main>
  );
}

export default App;
