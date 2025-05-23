import { generateChangelog as internalGenerateChangelog } from './changelog-generator';
// Import ChangelogUserConfig directly for re-export
import { ChangelogUserConfig as Config, CommitFilter, TagFilter, ChangelogUserConfig, TagRange, PreviousSemverTagsOptions } from './config';
import { CommitEntry } from './commit-parser';
import { getPreviousSemverTags as internalGetPreviousSemverTags } from './git-utils';

export interface ChangelogConfig extends Config {}

/**
 * Generates a changelog string based on conventional commit messages from a git repository.
 *
 * @async
 * @param {ChangelogConfig} [options={}] - Configuration options for changelog generation.
 * @returns {Promise<string>} A promise that resolves with the generated changelog content as a string.
 * @throws {Error} Throws an error if git commands fail, configuration is invalid, or other issues occur during generation.
 */
export async function generateChangelog(options: ChangelogConfig = {}): Promise<string> {
  return internalGenerateChangelog(options);
}

/**
 * Retrieves a list of tags representing previous semantic versions (major or minor) from a git repository.
 *
 * @async
 * @param {PreviousSemverTagsOptions} options - Configuration options.
 * @returns {Promise<string[]>} A promise that resolves with an array of tag strings, sorted from newest to oldest among the selected previous versions.
 * @throws {Error} Throws an error if git commands fail or other issues occur.
 */
export async function getPreviousSemverTags(options: PreviousSemverTagsOptions): Promise<string[]> {
  return internalGetPreviousSemverTags(options);
}


// Re-export types for direct usage if preferred by consumers
export { 
  type ChangelogUserConfig, 
  type CommitFilter, 
  type TagFilter, 
  type CommitEntry, 
  type TagRange,
  type PreviousSemverTagsOptions
};
