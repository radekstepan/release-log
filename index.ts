import { generateChangelog as internalGenerateChangelog } from './lib/changelog-generator';
// Import ChangelogUserConfig directly for re-export
import { ChangelogUserConfig as Config, CommitFilter, TagFilter, ChangelogUserConfig, TagRange } from './lib/config';
import { CommitEntry } from './lib/commit_parser';

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

// Re-export types for direct usage if preferred by consumers
// Now ChangelogUserConfig is directly imported and can be re-exported by its original name.
export { type ChangelogUserConfig, type CommitFilter, type TagFilter, type CommitEntry, type TagRange };
