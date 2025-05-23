"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateChangelog = generateChangelog;
const fs_1 = __importDefault(require("fs"));
const config_1 = require("./config");
const git_utils_1 = require("./git-utils");
const commit_parser_1 = require("./commit-parser");
const formatter_1 = require("./formatter");
async function generateChangelog(userConfig = {}) {
    const config = (0, config_1.resolveConfig)(userConfig);
    try {
        const details = (0, git_utils_1.getCommitRangeDetails)(config);
        const { range, displayFromTag, displayToTag } = details;
        const categories = (0, commit_parser_1.parseCommits)(range, config);
        let currentTagForDisplay;
        let previousTagForCompare;
        if (config.unreleased) {
            // For unreleased, displayToTag from getCommitRangeDetails is null.
            // Formatter will use "Unreleased" for the title.
            currentTagForDisplay = null;
            previousTagForCompare = displayFromTag; // This is the base tag (e.g., v1.0.0 for v1.0.0..HEAD compare link)
        }
        else {
            currentTagForDisplay = displayToTag; // This is the tag version being released (e.g., v1.1.0)
            // or null if 'HEAD' range for all commits with no tags (generic "Changelog" title)
            previousTagForCompare = displayFromTag; // This is the tag to compare from (e.g., v1.0.0 for compare link)
            // or null if currentTagForDisplay is the first tag (tree link)
        }
        const changelogContent = (0, formatter_1.formatChangelog)(categories, currentTagForDisplay, previousTagForCompare, config);
        if (config.save) {
            let existingContent = '';
            const changelogFilePath = config.changelogFile;
            if (fs_1.default.existsSync(changelogFilePath)) {
                existingContent = fs_1.default.readFileSync(changelogFilePath, 'utf8');
            }
            fs_1.default.writeFileSync(changelogFilePath, changelogContent + existingContent);
        }
        return changelogContent;
    }
    catch (error) {
        throw error;
    }
}
