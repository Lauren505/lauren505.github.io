import type { LayoutItem } from "./projects";

// Written by the project editor (see components/ProjectEditor.tsx and
// app/api/projects) — arrange a spread in the browser under `next dev` and
// save. A project that is not listed here is laid out automatically.
export const projectLayouts: Record<string, LayoutItem[]> = {};
