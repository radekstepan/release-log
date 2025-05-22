const fs = require('fs');
const { resolveConfig } = require('./config');
const { getCommitRange, getLatestTag, getPreviousTag } = require('./git_utils');
const { parseCommits } = require('./commit_parser');
const { formatChangelog } = require('./formatter');

async function generateChangelog(userConfig = {}) {
  const config = resolveConfig(userConfig);

  try {
    const range = getCommitRange(config);
    // console.log(`[generateChangelog] Effective config: ${JSON.stringify(config, null, 2)}`);
    // console.log(`[generateChangelog] Calculated Range: ${range}`);

    const categories = parseCommits(range, config);

    let currentTagForDisplay; // The tag name for the release title (e.g., v1.0.0)
    let previousTagForCompare; // The tag before currentTagForDisplay, for compare URLs (e.g., v0.9.0)

    if (config.unreleased) {
        currentTagForDisplay = null; // "Unreleased" doesn't have a current tag in the same way
        // For unreleased, previousTagForCompare is the base (fromTag or latest actual tag) to compare HEAD against
        previousTagForCompare = config.fromTag || getLatestTag(config);
    } else {
        // Determine currentTagForDisplay for a release
        if (config.toTag && config.toTag !== 'HEAD') {
            currentTagForDisplay = config.toTag;
        } else if (range && range.includes('..')) {
            let endOfRange = range.substring(range.lastIndexOf('..') + 2);
            currentTagForDisplay = (endOfRange === 'HEAD') ? getLatestTag(config) : endOfRange;
        } else if (range && range !== 'HEAD') { // Single tag specified (e.g., `git log v1.0.0` implies range up to v1.0.0)
            currentTagForDisplay = range;
        } else { // Default case: log for latest tag if no specific range given
            currentTagForDisplay = getLatestTag(config);
        }

        // If currentTagForDisplay resolved to 'HEAD' (e.g. range was 'vX..HEAD' but not unreleased mode),
        // treat it as latest tag for display purposes.
        if (currentTagForDisplay === 'HEAD') {
            currentTagForDisplay = getLatestTag(config);
        }
        
        // Determine previousTagForCompare based on the resolved currentTagForDisplay
        if (currentTagForDisplay) {
            previousTagForCompare = getPreviousTag(currentTagForDisplay, config);
        }
    }
    // console.log(`[generateChangelog] currentTagForDisplay: ${currentTagForDisplay}, previousTagForCompare: ${previousTagForCompare}`);

    const changelogContent = formatChangelog(categories, currentTagForDisplay, previousTagForCompare, config);

    if (config.save) {
      let existingContent = '';
      const changelogFilePath = config.changelogFile; // Already absolute if save is true

      if (fs.existsSync(changelogFilePath)) {
        existingContent = fs.readFileSync(changelogFilePath, 'utf8');
      }
      fs.writeFileSync(changelogFilePath, changelogContent + existingContent);
    }

    return changelogContent;

  } catch (error) {
    // console.error("[generateChangelog] Final Error:", error.message, error.stack);
    throw error;
  }
}

module.exports = {
  generateChangelog,
};
