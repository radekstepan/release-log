import fs from 'fs';
import { resolveConfig, ChangelogUserConfig, ResolvedChangelogConfig } from './config';
import { getCommitRangeDetails } from './git_utils';
import { parseCommits, ParsedCommits } from './commit_parser';
import { formatChangelog } from './formatter';

export async function generateChangelog(userConfig: ChangelogUserConfig = {}): Promise<string> {
  const config: ResolvedChangelogConfig = resolveConfig(userConfig);

  try {
    const details = getCommitRangeDetails(config);
    const { range, displayFromTag, displayToTag } = details;
    
    const categories: ParsedCommits = parseCommits(range, config);

    let currentTagForDisplay: string | null | undefined;
    let previousTagForCompare: string | null | undefined;

    if (config.unreleased) {
        // For unreleased, displayToTag from getCommitRangeDetails is null.
        // Formatter will use "Unreleased" for the title.
        currentTagForDisplay = null; 
        previousTagForCompare = displayFromTag; // This is the base tag (e.g., v1.0.0 for v1.0.0..HEAD compare link)
    } else {
        currentTagForDisplay = displayToTag;    // This is the tag version being released (e.g., v1.1.0)
                                                // or null if 'HEAD' range for all commits with no tags (generic "Changelog" title)
        previousTagForCompare = displayFromTag; // This is the tag to compare from (e.g., v1.0.0 for compare link)
                                                // or null if currentTagForDisplay is the first tag (tree link)
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
