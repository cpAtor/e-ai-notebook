# Excalidraw search and Notebook Local Index

The Drawing Screen will keep Excalidraw native canvas search and Notebook Search as separate search experiences. Excalidraw native search is the right tool for finding visible scene text inside the currently open Page. Notebook Search remains the product search because it queries the Notebook Local Index across Pages, Canvas Items, tags, titles, and searchable metadata, then jumps back to app-owned Canvas Regions.

Excalidraw 0.18.1 includes a native "Find on canvas" sidebar opened by its `searchMenu` action and Ctrl/Cmd+F shortcut. The implementation scans non-deleted Excalidraw text elements, including bound labels because they are represented as text elements with `originalText`, and highlights matched text lines in the scene. It does not search freehand strokes, images, app-only Canvas Item metadata, or material that is not currently represented as Excalidraw text in the open scene.

The embedded package does not expose a supported public prop or imperative API for opening, pre-filling, or customizing native search. `actionToggleSearchMenu` and `SearchMenu` exist in the published internal bundle/types, but they are not exported from the package root. The supported public surface remains the Excalidraw component props, `renderTopRightUI`, `children`, `UIOptions`, root exports such as `getTextFromElements`, and `ExcalidrawImperativeAPI` methods such as `updateScene`. Notebook Canvas must not depend on unexported action-manager internals for search.

Notebook Search cannot be replaced by native canvas search. The Local Index covers cross-Page results and Searchable Material that Excalidraw does not own: Notebook path titles, Link Cards, Code Blocks, tags, Image captions and generated metadata, Diagram Item labels and tags, future generated summaries, and Notebook Management content. It also preserves the product promise that a Search Result cites and opens a highlighted Canvas Region, not just a text match in the active scene.

Shortcut ownership:

- Ctrl/Cmd+F should stay with Excalidraw native "Find on canvas" while focus is in the Drawing Screen canvas, because it preserves expected editor behavior and avoids app chrome intercepting text editing or selection.
- Notebook Search should remain reachable from Notebook action surfaces, the Command Palette, and a clearly labelled "Search Notebook" action. Slash may open the Command Palette or Notebook action search, but it must not silently replace Excalidraw's native find-in-canvas behavior.
- If a future supported Excalidraw API exposes programmatic native search control, Notebook Canvas may add an explicit "Find on canvas" action beside "Search Notebook"; until then, the integration should rely on Excalidraw's own menu/keyboard handling.

Search Result highlighting guidance:

- Native Excalidraw search highlights matched text lines inside the current Page only. Treat those highlights as transient editor state owned by Excalidraw.
- Notebook Search results must continue to navigate to the result Page and render the app-owned Canvas Region highlight for the cited Canvas Item.
- When both are visible, the UI should label them distinctly as "Find on canvas" and "Search Notebook"; clearing or closing native search must not clear Notebook Search results, and opening a Notebook Search Result must not require native search to be open.
- Canvas Region citations remain the acceptance standard for Notebook Local Index results, including text, Link Cards, Code Blocks, Image Items, Diagram Items, tags, and generated metadata.
