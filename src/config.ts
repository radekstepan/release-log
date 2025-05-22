import path from 'path';
import { CommitEntry } from './commit_parser';

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
  githubRepoUrl?: string | null; // User can pass undefined, string, or null
  unreleased?: boolean;
  save?: boolean;
  tag?: string | TagRange | null;
  tagFilter?: TagFilter;
  commitFilter?: CommitFilter;
  commitTypes?: CommitTypeMapping;
}

export interface ResolvedChangelogConfig {
  repoPath: string;
  changelogFile: string;
  githubRepoUrl: string | null; // Resolved must be string or null
  unreleased: boolean;
  save: boolean;
  tag?: string | TagRange | null;
  tagFilter: TagFilter;
  commitFilter: CommitFilter;
  commitTypes: CommitTypeMapping;
}

// Options for the new getPreviousMajorVersionTags utility
export interface PreviousMajorVersionTagsOptions {
  startingTag?: string;
  count: number;
  repoPath?: string;
  tagFilter?: TagFilter;
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

export const defaultTagFilter: TagFilter = (tag: string): boolean => Boolean(tag && !tag.endsWith('-schema'));
const defaultCommitFilter: CommitFilter = (_commit: CommitEntry): boolean => true;

export function resolveConfig(userConfig: ChangelogUserConfig | PreviousMajorVersionTagsOptions = {}): ResolvedChangelogConfig {
  let githubRepoUrlFromUser: string | null | undefined = null;
  if ('githubRepoUrl' in userConfig) {
    githubRepoUrlFromUser = (userConfig as ChangelogUserConfig).githubRepoUrl;
  }

  const resolved: ResolvedChangelogConfig = {
    repoPath: userConfig.repoPath ?? process.cwd(),
    changelogFile: (userConfig as ChangelogUserConfig).changelogFile ?? 'CHANGELOG.md',
    githubRepoUrl: githubRepoUrlFromUser === undefined ? null : githubRepoUrlFromUser, // Correctly handle undefined from user to null
    unreleased: (userConfig as ChangelogUserConfig).unreleased ?? false,
    save: (userConfig as ChangelogUserConfig).save ?? false,
    tag: (userConfig as ChangelogUserConfig).tag === undefined ? undefined : (userConfig as ChangelogUserConfig).tag,
    tagFilter: defaultTagFilter,
    commitFilter: defaultCommitFilter,
    commitTypes: { ...DEFAULT_COMMIT_TYPES, ...((userConfig as ChangelogUserConfig).commitTypes || {}) },
  };

  if (typeof userConfig.tagFilter === 'function') {
    resolved.tagFilter = userConfig.tagFilter;
  } else if (userConfig.tagFilter !== undefined) {
    console.warn("Warning: `tagFilter` provided is not a function. Using default tag filter.");
  }
  
  if ('commitFilter' in userConfig && typeof (userConfig as ChangelogUserConfig).commitFilter === 'function') {
    resolved.commitFilter = (userConfig as ChangelogUserConfig).commitFilter!;
  } else if ('commitFilter' in userConfig && (userConfig as ChangelogUserConfig).commitFilter !== undefined) {
    console.warn("Warning: `commitFilter` provided is not a function. Using default commit filter.");
  }


  if (resolved.save && !resolved.changelogFile) {
    throw new Error("Changelog file path (`changelogFile`) must be specified when `save` is true.");
  }
  if (resolved.githubRepoUrl && !(resolved.githubRepoUrl.startsWith('http://') || resolved.githubRepoUrl.startsWith('https://'))) {
    throw new Error("`githubRepoUrl` must be a valid URL (e.g., https://github.com/owner/repo).");
  }

  if (resolved.save && resolved.changelogFile && !path.isAbsolute(resolved.changelogFile)) {
    resolved.changelogFile = path.join(resolved.repoPath, resolved.changelogFile);
  }

  return resolved;
}
