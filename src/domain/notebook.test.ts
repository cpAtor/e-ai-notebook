import { describe, expect, it } from "vitest";
import {
  addSection,
  createStarterNotebook,
  removeSection,
  renameSection
} from "./notebook";

describe("Notebook Sections", () => {
  it("opens a private Interview Prep Notebook with editable starter Sections", () => {
    const notebook = createStarterNotebook();

    expect(notebook.title).toBe("Interview Prep Notebook");
    expect(notebook.privacyMode).toBe("private-by-default");
    expect(notebook.sections.map((section) => section.title)).toEqual([
      "DSA",
      "System Design",
      "Research"
    ]);
  });

  it("renames, adds, and removes Sections without preserving a fixed taxonomy", () => {
    const starterNotebook = createStarterNotebook();
    const dsa = starterNotebook.sections[0];

    if (dsa === undefined) {
      throw new Error("Expected seeded DSA Section.");
    }

    const customizedNotebook = removeSection(
      addSection(
        renameSection(starterNotebook, dsa.id, "Algorithms"),
        "section_behavioral",
        "Behavioral"
      ),
      "section_research"
    );

    expect(customizedNotebook.sections.map((section) => section.title)).toEqual([
      "Algorithms",
      "System Design",
      "Behavioral"
    ]);
  });
});
