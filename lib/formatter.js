const { DEFAULT_COMMIT_TYPES } = require('./config'); // For establishing sort order of default categories

function formatChangelog(categories, tagName, config) {
  const date = new Date().toISOString().split('T')[0];
  let changelogContent = '';

  if (config.unreleased) {
    changelogContent += '# Unreleased\n\n';
  } else if (tagName) {
    changelogContent += `# ${tagName} (${date})\n\n`;
  } else {
    changelogContent += `# Changelog (${date})\n\n`; // Fallback for no tags / first release
  }

  // Handle Breaking Changes for Angular preset
  if (config.preset === 'angular') {
    const breakingChanges = [];
    Object.values(categories).forEach(categoryCommits => {
      categoryCommits.forEach(entry => {
        if (entry.notes && Array.isArray(entry.notes)) {
          entry.notes.forEach(note => {
            if (note.title === 'BREAKING CHANGE') {
              // Format: "* **scope:** description (hash)"
              const scopeText = entry.scope ? `**${entry.scope}:** ` : '';
              let commitLink = `(${entry.hash})`;
              if (config.githubRepoUrl) {
                const baseUrl = config.githubRepoUrl.endsWith('/') ? config.githubRepoUrl : config.githubRepoUrl + '/';
                commitLink = `([${entry.hash}](${baseUrl}commit/${entry.hash}))`;
              }
              breakingChanges.push(`* ${scopeText}${note.text} ${commitLink}`);
            }
          });
        }
      });
    });

    if (breakingChanges.length > 0) {
      changelogContent += '## BREAKING CHANGES\n\n';
      breakingChanges.forEach(bc => {
        changelogContent += `${bc}\n`;
      });
      changelogContent += '\n';
    }
  }

  let sortedCategoryNames;
  if (config.preset === 'angular') {
    // For Angular, use the order of sections as defined in config.commitTypes (which should reflect the preset's order)
    // Create a unique list of section titles from config.commitTypes
    const angularSectionOrder = Object.values(config.commitTypes);
    // Filter out duplicates while preserving order for known sections
    const uniqueAngularSections = [...new Set(angularSectionOrder)];

    sortedCategoryNames = Object.keys(categories).sort((aTitle, bTitle) => {
      const indexA = uniqueAngularSections.indexOf(aTitle);
      const indexB = uniqueAngularSections.indexOf(bTitle);

      if (indexA !== -1 && indexB !== -1) return indexA - indexB; // Both known, sort by preset order
      if (indexA !== -1) return -1; // A is known, B is not (should not happen if categories are derived from commitTypes)
      if (indexB !== -1) return 1;  // B is known, A is not
      return aTitle.localeCompare(bTitle); // Fallback for unknown or custom types not in preset
    });
  } else {
    // Default sorting logic
    const defaultOrder = Object.values(DEFAULT_COMMIT_TYPES);
    sortedCategoryNames = Object.keys(categories).sort((aTitle, bTitle) => {
        const indexA = defaultOrder.findIndex(defaultTitle => defaultTitle === aTitle);
        const indexB = defaultOrder.findIndex(defaultTitle => defaultTitle === bTitle);

        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return aTitle.localeCompare(bTitle);
    });
  }

  sortedCategoryNames.forEach(categoryName => {
    // Do not re-list breaking changes if they are also their own type (e.g. 'BREAKING CHANGE' type from preset)
    // However, the current setup extracts breaking notes and lists them separately, commits still go to their type.
    if (categories[categoryName] && categories[categoryName].length > 0) {
      changelogContent += `## ${categoryName}\n\n`;
      categories[categoryName].forEach(entry => {
        const scopeText = entry.scope ? `**${entry.scope}:** ` : '';
        let commitLink = `(${entry.hash})`;
        if (config.githubRepoUrl) {
          const baseUrl = config.githubRepoUrl.endsWith('/') ? config.githubRepoUrl : config.githubRepoUrl + '/';
          commitLink = `([${entry.hash}](${baseUrl}commit/${entry.hash}))`;
        }
        changelogContent += `- ${scopeText}${entry.message} ${commitLink}\n`;

        // For Angular preset, if a commit has breaking change notes, they are listed under "BREAKING CHANGES".
        // Optionally, some conventions might also list a brief note under the commit itself, but
        // the primary detail is hoisted. For now, we only list the main commit message here.
      });
      changelogContent += '\n';
    }
  });
  return changelogContent;
}

module.exports = {
  formatChangelog,
};
