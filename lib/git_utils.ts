import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { ResolvedChangelogConfig, TagRange } from './config';

export function git(command: string, cwd: string): string {
  try {
    const options: ExecSyncOptionsWithStringEncoding = { encoding: 'utf8', cwd };
    return execSync(command, options).trim();
  } catch (error: any) {
    const errorMessage = `Git command failed in ${cwd}: ${command}\n` +
                         `Exit status: ${error.status || 'N/A'}\n` +
                         `Stdout: ${(error.stdout || '').toString().trim() || 'N/A'}\n` +
                         `Stderr: ${(error.stderr || '').toString().trim() || 'N/A'}`;
    throw new Error(errorMessage);
  }
}

export function getTags(config: ResolvedChangelogConfig): string[] {
  try {
    const rawTags = git('git tag --list --sort=-version:refname', config.repoPath);
    if (!rawTags) return [];
    return rawTags.split('\n').filter(tag => config.tagFilter(tag));
  } catch (error: any) {
    if (error instanceof Error && (
        error.message.includes("not a git repository") ||
        error.message.includes("does not have any commits yet") ||
        error.message.includes("ambiguous argument 'HEAD'") ||
        error.message.includes("No names found, nothing to show") ||
        error.message.includes("no tag found")
       )) {
      return [];
    }
    throw error;
  }
}

export function getLatestTag(config: ResolvedChangelogConfig): string | null {
  const tags = getTags(config);
  return tags.length > 0 ? tags[0] : null;
}

export function getPreviousTag(currentTag: string, config: ResolvedChangelogConfig): string | null {
  const tags = getTags(config);
  const currentIndex = tags.indexOf(currentTag);
  if (currentIndex !== -1 && currentIndex < tags.length - 1) {
    return tags[currentIndex + 1];
  }
  return null;
}

export interface CommitRangeDetails {
  range: string;                 // For git log command
  displayFromTag: string | null; // For compare link (LHS) or null if from beginning/first tag
  displayToTag: string | null;   // For compare link (RHS), version header, or null if unreleased/all commits
}

export function getCommitRangeDetails(
  config: ResolvedChangelogConfig
): CommitRangeDetails {
  let reqFrom: string | undefined;
  let reqTo: string | undefined;

  if (typeof config.tag === 'string') {
    reqTo = config.tag;
  } else if (typeof config.tag === 'object' && config.tag !== null) {
    reqFrom = config.tag.from;
    reqTo = config.tag.to;
  }
  // If config.tag is undefined or null, reqFrom and reqTo remain undefined.

  if (config.unreleased) {
    const base = reqFrom || getLatestTag(config);
    return {
      range: base ? `${base}..HEAD` : 'HEAD',
      displayFromTag: base,
      displayToTag: null, // Signifies "Unreleased"
    };
  }

  // Not unreleased
  if (reqFrom && reqTo) {
    if (reqFrom === reqTo) { // e.g., tag: { from: 'v1', to: 'v1' }
      // Interpret as "commits for this single tag"
      const prev = getPreviousTag(reqTo, config);
      return {
        range: prev ? `${prev}..${reqTo}` : reqTo,
        displayFromTag: prev,
        displayToTag: reqTo,
      };
    }
    return { range: `${reqFrom}..${reqTo}`, displayFromTag: reqFrom, displayToTag: reqTo };
  }

  if (reqTo) { // Only 'to' was requested (e.g., tag: 'v1.0.0' or tag: {to: 'v1.0.0'})
              // This means commits for the release 'reqTo'.
    const prev = getPreviousTag(reqTo, config);
    return {
      range: prev ? `${prev}..${reqTo}` : reqTo,
      displayFromTag: prev,
      displayToTag: reqTo,
    };
  }

  if (reqFrom) { // Only 'from' was requested (e.g., tag: {from: 'v1.0.0'})
                // This means commits from 'reqFrom' up to the latest tag.
    const latest = getLatestTag(config);
    if (!latest || !getTags(config).includes(reqFrom)) {
      // reqFrom is invalid or no tags exist. Fallback to "for reqFrom" if it's the only one.
      const prev = getPreviousTag(reqFrom, config); // Assumes reqFrom is a valid tag if we reach here
      return { range: prev ? `${prev}..${reqFrom}` : reqFrom, displayFromTag: prev, displayToTag: reqFrom };
    }

    if (latest === reqFrom) { // reqFrom IS the latest tag.
                              // This is effectively asking for the release of 'latest'.
      const prev = getPreviousTag(latest, config);
      return {
        range: prev ? `${prev}..${latest}` : latest,
        displayFromTag: prev,
        displayToTag: latest,
      };
    }
    // reqFrom is older than latest. Range is reqFrom..latest
    return {
      range: `${reqFrom}..${latest}`,
      displayFromTag: reqFrom,
      displayToTag: latest,
    };
  }

  // Neither 'from' nor 'to' explicitly requested (tag: undefined or null). Means "latest release".
  const latest = getLatestTag(config);
  if (latest) {
    const prev = getPreviousTag(latest, config);
    return {
      range: prev ? `${prev}..${latest}` : latest,
      displayFromTag: prev,
      displayToTag: latest,
    };
  }

  // No tags in repo, no specific request. All commits.
  return {
    range: 'HEAD',
    displayFromTag: null,
    displayToTag: null, // Will result in generic "Changelog" title
  };
}
