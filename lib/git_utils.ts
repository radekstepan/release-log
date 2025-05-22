import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { ResolvedChangelogConfig } from './config';

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

export function getCommitRange(config: ResolvedChangelogConfig): string {
  if (config.unreleased) {
    const baseTagForUnreleased = config.fromTag || getLatestTag(config);
    return baseTagForUnreleased ? `${baseTagForUnreleased}..HEAD` : 'HEAD';
  }

  if (config.fromTag && config.toTag) {
    return `${config.fromTag}..${config.toTag}`;
  }

  let effectiveToTag = config.toTag;
  let effectiveFromTag = config.fromTag;

  if (!effectiveToTag) {
    effectiveToTag = getLatestTag(config);
    if (effectiveToTag && !effectiveFromTag) {
      effectiveFromTag = getPreviousTag(effectiveToTag, config);
    }
  } else {
    if (!effectiveFromTag) {
      effectiveFromTag = getPreviousTag(effectiveToTag, config);
    }
  }

  if (effectiveToTag) {
    if (effectiveFromTag) {
      return `${effectiveFromTag}..${effectiveToTag}`;
    } else {
      return effectiveToTag;
    }
  } else {
    return 'HEAD';
  }
}
