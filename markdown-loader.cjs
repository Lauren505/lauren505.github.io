/** Markdown, as a module whose default export is the file's text — for the
 *  bakery's recipes, which content/recipes.ts reads. See next.config.mjs. */
module.exports = function markdownLoader(source) {
  return `export default ${JSON.stringify(source)};`;
};
