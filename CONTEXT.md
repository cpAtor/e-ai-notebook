# AI-First Interview Prep Notebook

A private-by-default, offline-friendly thinking workspace for technical interview preparation, where rough work, notes, research, and visual material become searchable and revisitable.

## Language

**Interview Prep Notebook**:
The product: an AI-indexed notebook purpose-built for technical interview preparation, not a general-purpose canvas app.
_Avoid_: AI canvas, generic notebook, note-taking app

**Notebook**:
A top-level collection of interview preparation material, such as a user's main Interview Prep notebook.
_Avoid_: Workspace

**Notebook Export**:
A portable backup of a Notebook that can be imported later without requiring sync.
_Avoid_: Cloud sync

**Canvas Toast**:
A temporary corner message for background feedback such as saving, saved, export ready, import complete, or retryable failures.
_Avoid_: Status bar, persistent banner, section card

**Section**:
A named grouping inside a Notebook, such as DSA, System Design, or Research.
_Avoid_: Folder, workspace

**Page**:
An infinite-canvas document inside a Section, centered on a topic, problem, prompt, or captured research item.
_Avoid_: Document, note

**Default Page**:
The first blank Page created automatically so a new user can begin on the Drawing Screen without setup.
_Avoid_: Onboarding document, starter form

**Empty Canvas Prompts**:
Temporary choices shown on an unused Default Page to help the user start capturing material; they disappear once the user creates Canvas Items.
_Avoid_: Feature cards, onboarding wizard, dashboard

**Drawing Screen**:
The default product surface for both new and returning users: a Page opened directly as a full-screen infinite-canvas thinking space.
_Avoid_: Dashboard, landing page, workspace

**Canvas Visual Style**:
An Excalidraw-native visual feel for the Drawing Screen, preserving Excalidraw's editor affordances while prioritizing readable, spacious canvas typography over dashboard-style web UI.
_Avoid_: Web dashboard, form-heavy app shell

**Notebook Canvas**:
A deep Drawing Screen module that owns canvas-engine integration for a Page, including Canvas Item rendering, Canvas Region synchronization, native editor controls, theme defaults, and Notebook actions.
_Avoid_: Canvas wrapper, renderer, embedded editor

**Canvas Note Font**:
Nunito, used as the preferred readable font for normal note-taking on the canvas.
_Avoid_: Hand-drawn default, dashboard UI font

**Notebook Management Screen**:
A secondary surface for heavier organization and maintenance tasks across Sections, Pages, exports, imports, and recovery.
_Avoid_: Workspace, home page, primary screen

**Notebook Drawer**:
A hidden-by-default Drawing Screen drawer with a color-coded, icon-supported tree view for organizing Notebook material.
_Avoid_: Always-visible sidebar, page browser, dashboard

**Page Switcher**:
An unobtrusive Drawing Screen control for moving between Pages without leaving the canvas-first flow.
_Avoid_: Page browser, document list, sidebar

**Command Palette**:
A Drawing Screen overlay for invoking notebook actions such as search, page switching, shortcuts, settings, and management commands without adding persistent page chrome.
_Avoid_: Settings page, feature panel, toolbar overflow

**Canvas Modal**:
A temporary Drawing Screen dialog for focused secondary tasks such as shortcuts, settings, import, export, or confirmations.
_Avoid_: Settings route, management page, persistent panel

**Page Type**:
Optional or inferred metadata describing the kind of preparation material on a Page; it must not be required during capture.
_Avoid_: Required template, page subtype

**Page Starter**:
An optional prompt or layout that helps begin a Page without constraining how the user captures material.
_Avoid_: Required template

**Canvas Item**:
User-created or captured material placed on a Page, initially limited to text, freehand drawing, image or screenshot paste, links, and code blocks.
_Avoid_: Block, object, widget

**Hover Metadata**:
Lightweight metadata shown only when the user hovers or focuses a Canvas Item, used for quick context without interrupting capture.
_Avoid_: Always-visible metadata, metadata panel

**Item Inspector**:
An optional sidebar opened from a Canvas Item when the user chooses to edit metadata such as tags, captions, notes, or generated summaries.
_Avoid_: Permanent form, below-canvas editor

**Code Block**:
A non-runnable Canvas Item for storing searchable Python-first interview solution drafts, pseudocode, or code snippets.
_Avoid_: Cell, runner, judge

**Code Editing Split**:
A temporary Drawing Screen split view for editing a Code Block with Python-focused editor assistance while keeping the canvas visible.
_Avoid_: Below-canvas code form, separate IDE, runnable notebook cell

**Link Card**:
A Canvas Item for a pasted URL with optional notes and tags, without treating the linked page as captured notebook content.
_Avoid_: Web clip, article import, crawled source

**Image Item**:
A Canvas Item for a pasted image or screenshot, with optional caption, tags, and AI summary.
_Avoid_: Source document, required classification

**Rough Work**:
Freeform interview-prep thinking captured with minimal friction, such as sketches, traces, partial code, diagrams, mistakes, and side notes.
_Avoid_: Structured entry, form

**Tag**:
Optional user-provided metadata used to label material without interrupting capture.
_Avoid_: Required field

**Generated Metadata**:
System-created descriptions, topics, concepts, or relevance signals inferred from notebook material.
_Avoid_: Manual metadata, required metadata

**Searchable Material**:
Notebook material included in retrieval, initially typed text, code, links, titles, tags, and generated summaries for pasted images or screenshots.
_Avoid_: Search everything

**Local Index**:
A lightweight search index for notebook text, code, links, titles, and tags that can be maintained without AI.
_Avoid_: RAG pipeline, AI index

**Search Result**:
A retrieval result that shows where material lives in the Notebook and jumps to a highlighted Canvas Region.
_Avoid_: Page-only result

**Core Loop**:
The essential product flow: capture messy interview-prep material, retrieve it later, and jump back to the relevant Canvas Region.
_Avoid_: AI chat first, polished editor first

**AI Enrichment**:
Generated summaries or metadata added to notebook material to improve retrieval and answers.
_Avoid_: Local index, required metadata

**Notebook Assistant**:
The AI chat experience that answers from notebook material, summarizes pages or regions, finds related notes, and cites Canvas Regions.
_Avoid_: General interview coach, autonomous agent

**Assistant Bubble**:
An unobtrusive, dismissible Drawing Screen affordance for opening the Notebook Assistant without making AI the main surface.
_Avoid_: Always-open chat panel, primary layout column

**Private by Default**:
A product promise that interview preparation material is treated as personal and not shared or synced without the user's intent.
_Avoid_: Local-first

**Freehand Drawing**:
Rough visual work drawn directly on a Page; captured in the MVP but not semantically searchable.
_Avoid_: Searchable drawing, handwriting OCR

**Diagram Item**:
A structured visual Canvas Item such as a box, arrow, label, or sticky note used for system design diagrams.
_Avoid_: Required diagram template

**Canvas Region**:
A spatial area on a Page identified by a stable app-owned Canvas Item reference and bounds; the primary unit that search results and AI answers cite and jump to.
_Avoid_: Exact section, snippet location
