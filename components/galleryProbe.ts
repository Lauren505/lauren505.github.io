/**
 * What the scene knows about a model that the gallery's data does not: the
 * framing it falls back on when `modelSpan` and `modelFocus` are left out,
 * which is the model's own bounding box. The scene writes it as each model
 * loads; the gallery editor reads it, so that zooming or panning a model that
 * has never been framed starts from where it is drawn rather than from zero.
 */
export const modelBoxes = new Map<string, { span: number; focus: [number, number, number] }>();
