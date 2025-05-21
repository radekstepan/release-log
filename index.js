// index.js
const { generateChangelog } = require('./lib/changelog-generator');

/**
 * @typedef {object} ChangelogConfig
 * @property {string} [repoPath=process.cwd()] - Path to the git repository.
 * @property {string|null} [fromTag=null] - The git tag to start the changelog from (exclusive).
 *   If `unreleased` is true, this is the tag to compare HEAD against.
 * @property {string|null} [toTag=null] - The git tag to end the changelog at (inclusive).
 *   Ignored if `unreleased` is true.
 * @property {boolean} [unreleased=false] - If true, generates changelog for commits since `fromTag` (or latest tag if `fromTag` is null) up to HEAD.
 * @property {boolean} [save=false] - If true, saves the generated changelog by prepending it to the specified file.
 * @property {string} [changelogFile='CHANGELOG.md'] - File path to save/update the changelog. Used if `save` is true. Relative to `repoPath` if not absolute.
 * @property {Record<string, string>} [commitTypes] - Custom mapping of commit type prefixes (e.g., 'feat', 'fix')
 *   to section titles (e.g., 'Features', 'Bug Fixes') in the changelog. Merged with defaults.
 * @property {string|null} [githubRepoUrl=null] - Base URL of the GitHub repository (e.g., "https://github.com/owner/repo")
 *   to generate links for commit hashes. If null, links are not generated.
 * @property {(tag: string) => boolean} [tagFilter] - A function that receives a tag string and returns `true` if the tag should be included in versioning, `false` otherwise.
 *   Defaults to a function that filters out tags ending with '-schema'.
 */

/**
 * Generates a changelog string based on conventional commit messages from a git repository.
 *
 * @async
 * @param {ChangelogConfig} [options={}] - Configuration options for changelog generation.
 * @returns {Promise<string>} A promise that resolves with the generated changelog content as a string.
 * @throws {Error} Throws an error if git commands fail, configuration is invalid, or other issues occur during generation.
 */
async function getChangelog(options = {}) {
  return generateChangelog(options);
}

module.exports = {
  generateChangelog: getChangelog,
};
