import fs from 'fs';
import { resolveConfig, ChangelogUserConfig, ResolvedChangelogConfig } from './config';
import { getCommitRange, getLatestTag, getPreviousTag } from './git_utils';
import { parseCommits, ParsedCommits } from './commit_parser';
import { formatChangelog } from './formatter';

export async function generateChangelog(userConfig: ChangelogUserConfig = {}): Promise<string> {
  const config: ResolvedChangelogConfig = resolveConfig(userConfig);

  try {
    const range = getCommitRange(config);
    
    const categories: ParsedCommits = parseCommits(range, config);

    let currentTagForDisplay: string | null | undefined;
    let previousTagForCompare: string | null | undefined;

    if (config.unreleased) {
        currentTagForDisplay = null; 
        previousTagForCompare = config.fromTag || getLatestTag(config);
    } else {
        if (config.toTag && config.toTag !== 'HEAD') {
            currentTagForDisplay = config.toTag;
        } else if (range && range.includes('..')) {
            let endOfRange = range.substring(range.lastIndexOf('..') + 2);
            currentTagForDisplay = (endOfRange === 'HEAD') ? getLatestTag(config) : endOfRange;
        } else if (range && range !== 'HEAD') { 
            currentTagForDisplay = range;
        } else { 
            currentTagForDisplay = getLatestTag(config);
        }

        if (currentTagForDisplay === 'HEAD') {
            currentTagForDisplay = getLatestTag(config);
        }
        
        if (currentTagForDisplay) {
            previousTagForCompare = getPreviousTag(currentTagForDisplay, config);
        }
    }

    const changelogContent = formatChangelog(categories, currentTagForDisplay, previousTagForCompare, config);

    if (config.save) {
      let existingContent = '';
      const changelogFilePath = config.changelogFile; 

      if (fs.existsSync(changelogFilePath)) {
        existingContent = fs.readFileSync(changelogFilePath, 'utf8');
      }
      fs.writeFileSync(changelogFilePath, changelogContent + existingContent);
    }

    return changelogContent;

  } catch (error) {
    throw error;
  }
}
