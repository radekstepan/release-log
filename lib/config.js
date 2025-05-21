const path = require('path');

const DEFAULT_COMMIT_TYPES = {
  feat: 'Features',
  fix: 'Bug Fixes',
  docs: 'Documentation',
  style: 'Styles',
  refactor: 'Code Refactoring',
  perf: 'Performance Improvements',
  test: 'Tests',
  build: 'Build System',
  ci: 'CI',
  chore: 'Chores',
  revert: 'Reverts',
};

// Default values for configuration options
const DEFAULT_CONFIG_OPTIONS = {
  repoPath: process.cwd(),
  changelogFile: 'CHANGELOG.md',
  githubRepoUrl: null,
  unreleased: false,
  save: false,
  fromTag: null,
  toTag: null,
};

function resolveConfig(userConfig = {}) {
  const config = {
    ...DEFAULT_CONFIG_OPTIONS, // Apply default values for options
    ...userConfig              // Override with user-provided options
  };

  // Construct effective commitTypes by merging defaults with user-provided ones
  config.commitTypes = { ...DEFAULT_COMMIT_TYPES, ...(userConfig.commitTypes || {}) };

  // Validate config
  if (config.save && !config.changelogFile) {
    throw new Error("Changelog file path (`changelogFile`) must be specified when `save` is true.");
  }
  if (config.githubRepoUrl && !(config.githubRepoUrl.startsWith('http://') || config.githubRepoUrl.startsWith('https://'))) {
    throw new Error("`githubRepoUrl` must be a valid URL (e.g., https://github.com/owner/repo).");
  }

  // Resolve changelogFile path to be absolute if save is true
  if (config.save && config.changelogFile && !path.isAbsolute(config.changelogFile)) {
    config.changelogFile = path.join(config.repoPath, config.changelogFile);
  }

  return config;
}

module.exports = {
  DEFAULT_COMMIT_TYPES,
  resolveConfig,
};
