import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const renderApp = () => {
  act(() => {
    root.render(<App />);
  });
};

const click = (element: HTMLElement) => {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const submit = (form: HTMLFormElement) => {
  act(() => {
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
  });
};

const setValue = (input: HTMLInputElement, value: string) => {
  input.value = value;
};

const getButton = (name: RegExp): HTMLButtonElement => {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => {
    const accessibleName = `${candidate.textContent ?? ''} ${
      candidate.getAttribute('aria-label') ?? ''
    }`;
    return name.test(accessibleName);
  });

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button ${name.toString()} was not found`);
  }

  return button;
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('Interview Prep Notebook', () => {
  it('starts as a private notebook with seeded editable Sections', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    renderApp();

    expect(container.textContent).toContain('Private Interview Prep Notebook');
    expect(container.textContent).toContain('DSA');
    expect(container.textContent).toContain('System Design');
    expect(container.textContent).toContain('Research');
    expect(getButton(/rename dsa section/i)).toBeTruthy();
    expect(getButton(/remove research section/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('lets the user rename, add, and remove starter Sections', () => {
    renderApp();

    click(getButton(/rename dsa section/i));
    const renameForm = container.querySelector('[aria-label="Rename Section form"]');
    if (!(renameForm instanceof HTMLFormElement)) {
      throw new Error('Rename form was not found');
    }
    const renameInput = renameForm.elements.namedItem('title');
    if (!(renameInput instanceof HTMLInputElement)) {
      throw new Error('Rename input was not found');
    }
    setValue(renameInput, 'Algorithms');
    submit(renameForm);

    expect(container.textContent).toContain('Algorithms');
    expect(container.textContent).not.toContain('DSA');

    const addForm = container.querySelector('[aria-label="Add Section form"]');
    if (!(addForm instanceof HTMLFormElement)) {
      throw new Error('Add form was not found');
    }
    const addInput = addForm.elements.namedItem('title');
    if (!(addInput instanceof HTMLInputElement)) {
      throw new Error('Add input was not found');
    }
    setValue(addInput, 'Behavioral');
    submit(addForm);

    expect(container.textContent).toContain('Behavioral');

    click(getButton(/remove research section/i));

    expect(container.textContent).not.toContain('Research');
    expect(container.textContent).toContain('Behavioral');
    expect(container.textContent).toContain('Algorithms');
  });
});
