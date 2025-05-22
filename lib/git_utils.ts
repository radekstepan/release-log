import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { ResolvedChangelogConfig, TagRange, PreviousMajorVersionTagsOptions, resolveConfig as resolveOptionsUtil, defaultTagFilter } from './config';

interface SemVer {
  major: number;
  minor: number;
  patch: number;
  preRelease?: string;
  original: string;
}

function parseSemVer(tag: string): SemVer | null {
  const semverRegex = /^(?:v)?(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/;
  const match = tag.match(semverRegex);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    preRelease: match[4] || undefined,
    original: tag,
  };
}

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

export function getTags(config: Pick<ResolvedChangelogConfig, 'repoPath' | 'tagFilter'>): string[] {
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

export function getLatestTag(config: Pick<ResolvedChangelogConfig, 'repoPath' | 'tagFilter'>): string | null {
  const tags = getTags(config);
  return tags.length > 0 ? tags[0] : null;
}

export function getPreviousTag(currentTag: string, config: Pick<ResolvedChangelogConfig, 'repoPath' | 'tagFilter'>): string | null {
  const tags = getTags(config);
  const currentIndex = tags.indexOf(currentTag);
  if (currentIndex !== -1 && currentIndex < tags.length - 1) {
    return tags[currentIndex + 1];
  }
  return null;
}

export interface CommitRangeDetails {
  range: string;
  displayFromTag: string | null;
  displayToTag: string | null;
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

  if (config.unreleased) {
    const base = reqFrom || getLatestTag(config);
    return {
      range: base ? `${base}..HEAD` : 'HEAD',
      displayFromTag: base,
      displayToTag: null,
    };
  }

  if (reqFrom && reqTo) {
    if (reqFrom === reqTo) {
      const prev = getPreviousTag(reqTo, config);
      return {
        range: prev ? `${prev}..${reqTo}` : reqTo,
        displayFromTag: prev,
        displayToTag: reqTo,
      };
    }
    return { range: `${reqFrom}..${reqTo}`, displayFromTag: reqFrom, displayToTag: reqTo };
  }

  if (reqTo) {
    const prev = getPreviousTag(reqTo, config);
    return {
      range: prev ? `${prev}..${reqTo}` : reqTo,
      displayFromTag: prev,
      displayToTag: reqTo,
    };
  }

  if (reqFrom) {
    const latest = getLatestTag(config);
    if (!latest || !getTags(config).includes(reqFrom)) {
      const prev = getPreviousTag(reqFrom, config);
      return { range: prev ? `${prev}..${reqFrom}` : reqFrom, displayFromTag: prev, displayToTag: reqFrom };
    }

    if (latest === reqFrom) {
      const prev = getPreviousTag(latest, config);
      return {
        range: prev ? `${prev}..${latest}` : latest,
        displayFromTag: prev,
        displayToTag: latest,
      };
    }
    return {
      range: `${reqFrom}..${latest}`,
      displayFromTag: reqFrom,
      displayToTag: latest,
    };
  }

  const latest = getLatestTag(config);
  if (latest) {
    const prev = getPreviousTag(latest, config);
    return {
      range: prev ? `${prev}..${latest}` : latest,
      displayFromTag: prev,
      displayToTag: latest,
    };
  }

  return {
    range: 'HEAD',
    displayFromTag: null,
    displayToTag: null,
  };
}

/**
 * Retrieves a list of tags representing previous major releases.
 * @param options - Configuration options.
 * @returns A promise that resolves with an array of tag strings.
 */
export async function getPreviousMajorVersionTags(
  options: PreviousMajorVersionTagsOptions
): Promise<string[]> {
  if (options.count <= 0) {
    return [];
  }

  const configForGetters: Pick<ResolvedChangelogConfig, 'repoPath' | 'tagFilter'> = {
    repoPath: options.repoPath ?? process.cwd(),
    tagFilter: options.tagFilter ?? defaultTagFilter,
  };

  const filteredSortedTags = getTags(configForGetters); // Newest to oldest
  if (filteredSortedTags.length === 0) {
    return [];
  }

  // Determine the semantic anchor tag
  let semanticAnchorTag: SemVer | null = null;
  
  if (options.startingTag) {
    // Check if startingTag exists in filtered tags
    if (!filteredSortedTags.includes(options.startingTag)) {
      return [];
    }
    
    // Try to parse the starting tag as semver
    const startingSemVer = parseSemVer(options.startingTag);
    if (startingSemVer) {
      semanticAnchorTag = startingSemVer;
    } else {
      // Starting tag is not semver, find the first semver tag that appears at or after it in the list
      const startingIndex = filteredSortedTags.indexOf(options.startingTag);
      for (let i = startingIndex; i < filteredSortedTags.length; i++) {
        const parsed = parseSemVer(filteredSortedTags[i]);
        if (parsed) {
          semanticAnchorTag = parsed;
          break;
        }
      }
    }
  } else {
    // No starting tag specified, find the first (latest) semver tag
    for (const tag of filteredSortedTags) {
      const parsed = parseSemVer(tag);
      if (parsed) {
        semanticAnchorTag = parsed;
        break;
      }
    }
  }
  
  if (!semanticAnchorTag) {
    return [];
  }
  
  const anchorMajor = semanticAnchorTag.major;

  // Collect latest tag for each major version
  const collectedMajorTags = new Map<number, SemVer>();

  for (const tagName of filteredSortedTags) {
    const parsed = parseSemVer(tagName);
    if (parsed) {
      const existingForMajor = collectedMajorTags.get(parsed.major);
      if (!existingForMajor) {
        collectedMajorTags.set(parsed.major, parsed);
      } else {
        // Prefer non-prerelease over prerelease for the same major
        if (!parsed.preRelease && existingForMajor.preRelease) {
          collectedMajorTags.set(parsed.major, parsed);
        }
      }
    }
  }

  // Sort by major version descending
  const sortedMajorsWithTagsList: SemVer[] = Array.from(collectedMajorTags.values())
    .sort((a, b) => b.major - a.major);

  // Find the index of the anchor major
  const anchorMajorEntryIndex = sortedMajorsWithTagsList.findIndex(entry => entry.major === anchorMajor);

  if (anchorMajorEntryIndex === -1) {
    return [];
  }

  // Get the previous major versions
  const targetMajorEntries = sortedMajorsWithTagsList.slice(
    anchorMajorEntryIndex + 1,
    anchorMajorEntryIndex + 1 + options.count
  );

  return targetMajorEntries.map(entry => entry.original);
}
