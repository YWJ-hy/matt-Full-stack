export const skillSources = {
  'productivity/grilling': ['SKILL.md'],
  'engineering/grill-with-docs': ['SKILL.md'],
  'engineering/domain-modeling': ['SKILL.md', 'GLOSSARY-FORMAT.md', 'ADR-FORMAT.md'],
  'engineering/implement': ['SKILL.md'],
  'engineering/tdd': ['SKILL.md', 'tests.md', 'mocking.md'],
  'engineering/codebase-design': ['SKILL.md', 'DEEPENING.md', 'DESIGN-IT-TWICE.md'],
  'engineering/code-review': ['SKILL.md'],
  'engineering/diagnosing-bugs': ['SKILL.md', 'scripts/hitl-loop.template.sh'],
};

export const skillFiles = Object.entries(skillSources).flatMap(([directory, files]) =>
  files.map(file => ({ source: `skills/${directory}/${file}`, local: `${directory.split('/')[1]}/${file}` })));
