import path from 'path';
import { CommitEntry } from './commit_parser'; // Import CommitEntry

export type CommitTypeMapping = Record<string, string>;
export type TagFilter = (tag: string) => boolean;
export type CommitFilter = (commit: CommitEntry) => boolean;

export type TagRange = {
  from?: string;
  to?: string;
};

export interface ChangelogUserConfig {
  repoPath?: string;
  changelogFile?: string;
  githubRepoUrl?: string | null;
  unreleased?: boolean;
  save?: boolean;
  tag?: string | TagRange | null; // Replaces fromTag and toTag
  tagFilter?: TagFilter;
  commitFilter?: CommitFilter;
  commitTypes?: CommitTypeMapping;
}

export interface ResolvedChangelogConfig {
  repoPath: string;
  changelogFile: string;
  githubRepoUrl: string | null;
  unreleased: boolean;
  save: boolean;
  tag?: string | TagRange | null; // Replaces fromTag and toTag
  tagFilter: TagFilter;
  commitFilter: CommitFilter;
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

const defaultTagFilter: TagFilter = (tag: string): boolean => Boolean(tag && !tag.endsWith('-schema'));
const defaultCommitFilter: CommitFilter = (_commit: CommitEntry): boolean => true;

export function resolveConfig(userConfig: ChangelogUserConfig = {}): ResolvedChangelogConfig {
  const config: ResolvedChangelogConfig = {
    repoPath: userConfig.repoPath ?? process.cwd(),
    changelogFile: userConfig.changelogFile ?? 'CHANGELOG.md',
    githubRepoUrl: userConfig.githubRepoUrl === undefined ? null : userConfig.githubRepoUrl,
    unreleased: userConfig.unreleased ?? false,
    save: userConfig.save ?? false,
    tag: userConfig.tag === undefined ? undefined : userConfig.tag, // Initialize tag
    tagFilter: defaultTagFilter,
    commitFilter: defaultCommitFilter,
    commitTypes: { ...DEFAULT_COMMIT_TYPES, ...(userConfig.commitTypes || {}) },
  };

  if (typeof userConfig.tagFilter === 'function') {
    config.tagFilter = userConfig.tagFilter;
  } else if (userConfig.tagFilter !== undefined) {
    console.warn("Warning: `tagFilter` provided is not a function. Using default tag filter.");
  }

  if (typeof userConfig.commitFilter === 'function') {
    config.commitFilter = userConfig.commitFilter;
  } else if (userConfig.commitFilter !== undefined) {
    console.warn("Warning: `commitFilter` provided is not a function. Using default commit filter.");
  }

  if (config.save && !config.changelogFile) {
    throw new Error("Changelog file path (`changelogFile`) must be specified when `save` is true.");
  }
  if (config.githubRepoUrl && !(config.githubRepoUrl.startsWith('http://') || config.githubRepoUrl.startsWith('https://'))) {
    throw new Error("`githubRepoUrl` must be a valid URL (e.g., https://github.com/owner/repo).");
  }

  if (config.save && config.changelogFile && !path.isAbsolute(config.changelogFile)) {
    config.changelogFile = path.join(config.repoPath, config.changelogFile);
  }

  return config;
}
