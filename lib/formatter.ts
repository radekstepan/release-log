import { ResolvedChangelogConfig } from './config';
import { ParsedCommits, CommitEntry } from './commit_parser';

// Order for sections based on conventional-changelog-angular preset
const ANGULAR_PRESET_CATEGORY_TITLES_ORDER: string[] = [
  'Features',
  'Bug Fixes',
  'Performance Improvements',
  'Reverts',
  'Documentation',
  'Styles',
  'Code Refactoring',
  'Tests',
  'Build System',
  'CI',
  'Chores',
];

export function formatChangelog(
  categories: ParsedCommits, 
  currentTagForDisplay: string | null | undefined, 
  previousTagForCompare: string | null | undefined, 
  config: ResolvedChangelogConfig
): string {
  const date = new Date().toISOString().split('T')[0];
  let changelog = '';
  const baseUrl = config.githubRepoUrl ? (config.githubRepoUrl.endsWith('/') ? config.githubRepoUrl : config.githubRepoUrl + '/') : null;

  let headerDisplayPart: string;
  if (config.unreleased) {
    headerDisplayPart = 'Unreleased';
    if (baseUrl && previousTagForCompare) {
      headerDisplayPart = `[Unreleased](${baseUrl}compare/${previousTagForCompare}...HEAD)`;
    }
  } else if (currentTagForDisplay) {
    headerDisplayPart = currentTagForDisplay; 
    if (baseUrl) {
      if (previousTagForCompare) {
        headerDisplayPart = `[${currentTagForDisplay}](${baseUrl}compare/${previousTagForCompare}...${currentTagForDisplay})`;
      } else { 
        headerDisplayPart = `[${currentTagForDisplay}](${baseUrl}tree/${currentTagForDisplay})`;
      }
    }
  } else { 
    headerDisplayPart = 'Changelog';
  }

  changelog += `## ${headerDisplayPart} (${date})\n\n`;

  const allCommits: CommitEntry[] = Object.values(categories).flat();
  const breakingCommits = allCommits.filter(c => c.isExclamationBreaking || c.breakingNotes.length > 0);

  if (breakingCommits.length > 0) {
    changelog += `### BREAKING CHANGES\n\n`;
    breakingCommits.forEach(entry => {
      const scopeText = entry.scope ? `**${entry.scope}:** ` : '';
      const commitLink = baseUrl ? `([${entry.hash}](${baseUrl}commit/${entry.hash}))` : `(${entry.hash})`;
      changelog += `* ${scopeText}${entry.subject} ${commitLink}\n`; 

      if (entry.breakingNotes.length > 0) {
        entry.breakingNotes.forEach(noteBlock => { 
          const noteLines = noteBlock.trim().split('\n')
                               .map(line => line.trim()) 
                               .filter(line => line.length > 0); 
          noteLines.forEach(line => {
            changelog += `  * ${line}\n`; 
          });
        });
      }
    });
    changelog += '\n'; 
  }

  const categoryOrderMap: Record<string, number> = ANGULAR_PRESET_CATEGORY_TITLES_ORDER.reduce((acc, title, index) => {
    acc[title] = index;
    return acc;
  }, {} as Record<string, number>);

  Object.keys(categories)
    .sort((aTitle, bTitle) => {
      const indexA = categoryOrderMap[aTitle];
      const indexB = categoryOrderMap[bTitle];
      if (indexA !== undefined && indexB !== undefined) return indexA - indexB;
      if (indexA !== undefined) return -1; // Standard sections first
      if (indexB !== undefined) return 1;  // Standard sections first
      return aTitle.localeCompare(bTitle); // Custom sections alphabetically
    })
    .forEach(categoryTitle => {
      if (categories[categoryTitle].length > 0) {
        changelog += `### ${categoryTitle}\n\n`;
        categories[categoryTitle].forEach(entry => {
          const scopeText = entry.scope ? `**${entry.scope}:** ` : '';
          const commitLink = baseUrl ? `([${entry.hash}](${baseUrl}commit/${entry.hash}))` : `(${entry.hash})`;
          changelog += `* ${scopeText}${entry.message} ${commitLink}\n`;
        });
        changelog += '\n';
      }
    });

  return changelog;
}
