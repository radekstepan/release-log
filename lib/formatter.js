const { DEFAULT_COMMIT_TYPES } = require('./config'); // For establishing sort order of default categories

function formatChangelog(categories, tagName, config) {
  const date = new Date().toISOString().split('T')[0];
  let changelog = '';

  if (config.unreleased) {
    changelog += '# Unreleased\n\n';
  } else if (tagName) {
    changelog += `# ${tagName} (${date})\n\n`;
  } else {
    changelog += `# Changelog (${date})\n\n`; // Fallback for no tags / first release
  }

  // Sort categories: default types first in their defined order, then custom types alphabetically
  const defaultOrder = Object.values(DEFAULT_COMMIT_TYPES);
  const sortedCategoryNames = Object.keys(categories).sort((aTitle, bTitle) => {
      const indexA = defaultOrder.findIndex(defaultTitle => defaultTitle === aTitle);
      const indexB = defaultOrder.findIndex(defaultTitle => defaultTitle === bTitle);

      if (indexA !== -1 && indexB !== -1) return indexA - indexB; // Both are default types
      if (indexA !== -1) return -1; // A is default, B is custom
      if (indexB !== -1) return 1;  // B is default, A is custom
      return aTitle.localeCompare(bTitle); // Both are custom
  });

  sortedCategoryNames.forEach(category => {
    if (categories[category].length > 0) {
      changelog += `## ${category}\n\n`;
      categories[category].forEach(entry => {
        const scopeText = entry.scope ? `**${entry.scope}:** ` : '';
        let commitLink = `(${entry.hash})`;
        if (config.githubRepoUrl) {
          const baseUrl = config.githubRepoUrl.endsWith('/') ? config.githubRepoUrl : config.githubRepoUrl + '/';
          commitLink = `([${entry.hash}](${baseUrl}commit/${entry.hash}))`;
        }
        changelog += `- ${scopeText}${entry.message} ${commitLink}\n`;
      });
      changelog += '\n';
    }
  });
  return changelog;
}

module.exports = {
  formatChangelog,
};
