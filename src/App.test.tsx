import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a private Interview Prep Notebook with seeded Sections", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Interview Prep Notebook" })
    ).toBeInTheDocument();
    expect(screen.getByText("Private Notebook")).toBeInTheDocument();
    expect(screen.getByDisplayValue("DSA")).toBeInTheDocument();
    expect(screen.getByDisplayValue("System Design")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Research")).toBeInTheDocument();
  });

  it("renames, adds, and removes Sections", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(screen.getByDisplayValue("DSA"));
    await user.type(screen.getByLabelText("Rename DSA"), "Algorithms");
    await user.type(screen.getByLabelText("Add a Section"), "Behavioral");
    await user.click(screen.getByRole("button", { name: "Add Section" }));
    const researchRow = screen.getByDisplayValue("Research").closest("li");

    if (researchRow === null) {
      throw new Error("Expected Research Section row.");
    }

    await user.click(within(researchRow).getByRole("button", { name: "Remove" }));

    expect(screen.getByDisplayValue("Algorithms")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Behavioral")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Research")).not.toBeInTheDocument();
  });

  it("makes no default runtime fetch calls", () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network is disabled by default."));

    render(<App />);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
