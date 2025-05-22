// index.ts
import { generateChangelog as internalGenerateChangelog } from './lib/changelog-generator';
import { ChangelogUserConfig as Config } from './lib/config'; // Exporting the config type

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

// Re-export for direct usage if preferred by consumers
export { type ChangelogUserConfig } from './lib/config';
