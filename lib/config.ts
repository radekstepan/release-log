import path from 'path';

export type CommitTypeMapping = Record<string, string>;
export type TagFilter = (tag: string) => boolean;

export interface ChangelogUserConfig {
  repoPath?: string;
  changelogFile?: string;
  githubRepoUrl?: string | null;
  unreleased?: boolean;
  save?: boolean;
  fromTag?: string | null;
  toTag?: string | null;
  tagFilter?: TagFilter;
  commitTypes?: CommitTypeMapping;
}

// This is the type of the object after defaults have been applied and paths resolved.
export interface ResolvedChangelogConfig {
  repoPath: string;
  changelogFile: string; // Path is resolved to absolute if save is true
  githubRepoUrl: string | null;
  unreleased: boolean;
  save: boolean;
  fromTag: string | null;
  toTag: string | null;
  tagFilter: TagFilter;
  commitTypes: CommitTypeMapping;
}

export const DEFAULT_COMMIT_TYPES: CommitTypeMapping = {
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

// Default tag filter function: keeps tags that don't end with '-schema'
// Corrected to explicitly return a boolean
const defaultTagFilter: TagFilter = (tag: string): boolean => Boolean(tag && !tag.endsWith('-schema'));

export function resolveConfig(userConfig: ChangelogUserConfig = {}): ResolvedChangelogConfig {
  // Initialize config ensuring all properties of ResolvedChangelogConfig are set correctly from the start.
  const config: ResolvedChangelogConfig = {
    repoPath: userConfig.repoPath ?? process.cwd(),
    changelogFile: userConfig.changelogFile ?? 'CHANGELOG.md', // Path resolution will happen later
    githubRepoUrl: userConfig.githubRepoUrl === undefined ? null : userConfig.githubRepoUrl,
    unreleased: userConfig.unreleased ?? false,
    save: userConfig.save ?? false,
    fromTag: userConfig.fromTag === undefined ? null : userConfig.fromTag,
    toTag: userConfig.toTag === undefined ? null : userConfig.toTag,
    tagFilter: defaultTagFilter, // Start with the default, will be validated/overridden below
    commitTypes: { ...DEFAULT_COMMIT_TYPES, ...(userConfig.commitTypes || {}) }, // Merge commit types
  };

  // Handle tagFilter specifically: validate user-provided filter or use default.
  if (typeof userConfig.tagFilter === 'function') {
    config.tagFilter = userConfig.tagFilter;
  } else if (userConfig.tagFilter !== undefined) {
    // User provided a tagFilter, but it's not a function. Warn and use default.
    console.warn("Warning: `tagFilter` provided is not a function. Using default tag filter.");
    // config.tagFilter remains defaultTagFilter, which is correct.
  }
  // If userConfig.tagFilter was undefined, config.tagFilter (already set to defaultTagFilter) is used.

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
