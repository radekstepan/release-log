const fs = require('fs');
// Note: path module is not directly used here anymore as resolveConfig handles path joining for changelogFile
// const path = require('path'); 
const { resolveConfig } = require('./config');
const { getCommitRange, getLatestTag } = require('./git_utils');
const { parseCommits } = require('./commit_parser');
const { formatChangelog } = require('./formatter');

async function generateChangelog(userConfig = {}) {
  const config = resolveConfig(userConfig);

  try {
    const range = getCommitRange(config);
    // console.log(`[generateChangelog] Effective config: ${JSON.stringify(config, null, 2)}`);
    // console.log(`[generateChangelog] Calculated Range: ${range}`);

    const categories = parseCommits(range, config);

    let titleTagForFormatting;
    if (config.unreleased) {
        titleTagForFormatting = null;
    } else {
        if (config.toTag && config.toTag !== 'HEAD') {
            titleTagForFormatting = config.toTag;
        }
        else if (range && range.includes('..')) {
            let endOfRange = range.substring(range.lastIndexOf('..') + 2);
            titleTagForFormatting = (endOfRange === 'HEAD') ? getLatestTag(config) : endOfRange;
        }
        else if (range && range !== 'HEAD') {
            titleTagForFormatting = range;
        }
        else {
            titleTagForFormatting = getLatestTag(config);
        }

        if (titleTagForFormatting === 'HEAD') {
            titleTagForFormatting = null; // Use generic title if the resolved tag is literally "HEAD"
        }
    }
    // console.log(`[generateChangelog] titleTagForFormatting: ${titleTagForFormatting}`);

    const changelogContent = formatChangelog(categories, titleTagForFormatting, config);

    if (config.save) {
      let existingContent = '';
      // config.changelogFile is already an absolute path if 'save' is true, resolved by resolveConfig.
      const changelogFilePath = config.changelogFile;

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
