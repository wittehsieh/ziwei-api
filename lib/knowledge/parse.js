/**
 * Generic parser for the knowledge/*.md files. Every file in that folder
 * uses the same shape: `## <key>` headers followed by `- field: value`
 * bullet lines. Sub-headers (`### ...`) and any prose outside a `## `
 * section are ignored -- they're supplementary methodology text, not
 * lookup data.
 */
const FIELD_LINE = /^-\s*([A-Za-z_]+):\s*(.*)$/;

function parseSections(text) {
  const sections = [];
  let current = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();

    if (line.startsWith('## ') && !line.startsWith('### ')) {
      current = { title: line.slice(3).trim(), fields: {} };
      sections.push(current);
      continue;
    }

    if (!current) continue;

    const fieldMatch = FIELD_LINE.exec(line.trim());
    if (fieldMatch) {
      current.fields[fieldMatch[1]] = fieldMatch[2].trim();
    }
  }

  return sections;
}

module.exports = { parseSections };
