"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateChangelog = generateChangelog;
exports.getPreviousSemverTags = getPreviousSemverTags;
const changelog_generator_1 = require("./changelog-generator");
const git_utils_1 = require("./git-utils");
/**
 * Generates a changelog string based on conventional commit messages from a git repository.
 *
 * @async
 * @param {ChangelogConfig} [options={}] - Configuration options for changelog generation.
 * @returns {Promise<string>} A promise that resolves with the generated changelog content as a string.
 * @throws {Error} Throws an error if git commands fail, configuration is invalid, or other issues occur during generation.
 */
async function generateChangelog(options = {}) {
    return (0, changelog_generator_1.generateChangelog)(options);
}
/**
 * Retrieves a list of tags representing previous semantic versions (major or minor) from a git repository.
 *
 * @async
 * @param {PreviousSemverTagsOptions} options - Configuration options.
 * @returns {Promise<string[]>} A promise that resolves with an array of tag strings, sorted from newest to oldest among the selected previous versions.
 * @throws {Error} Throws an error if git commands fail or other issues occur.
 */
async function getPreviousSemverTags(options) {
    return (0, git_utils_1.getPreviousSemverTags)(options);
}
