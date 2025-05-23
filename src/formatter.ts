import { ResolvedChangelogConfig } from './config';
import { ParsedCommits, CommitEntry } from './commit-parser';
import { parseSemVer, SemVer } from './git-utils'; // Import SemVer and parseSemVer

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

function getFormattedDate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getHeaderLevel(
  currentTag: string | null | undefined,
  previousTag: string | null | undefined,
  isUnreleased: boolean
): '#' | '##' {
  if (isUnreleased) return '##';
  if (!currentTag) return '##'; // Generic "Changelog" title

  const currentSemVer = parseSemVer(currentTag);

  if (!previousTag) { // This is the first release
    return '#';
  }

  const previousSemVer = parseSemVer(previousTag);

  if (!currentSemVer || !previousSemVer) { // Non-semver tags involved in comparison
    return '##'; // Default to patch level for safety
  }

  if (currentSemVer.major > previousSemVer.major || 
      (currentSemVer.major === previousSemVer.major && currentSemVer.minor > previousSemVer.minor)) {
    return '#'; // Major or Minor release
  }
  
  return '##'; // Patch release or pre-release increment
}


export function formatChangelog(
  categories: ParsedCommits, 
  currentTagForDisplay: string | null | undefined, 
  previousTagForCompare: string | null | undefined, 
  config: ResolvedChangelogConfig
): string {
  const date = getFormattedDate();
  let changelog = '';
  const baseUrl = config.githubRepoUrl ? (config.githubRepoUrl.endsWith('/') ? config.githubRepoUrl : config.githubRepoUrl + '/') : null;

  let displayVersion = currentTagForDisplay ? currentTagForDisplay.replace(/^v/, '') : null;
  const prevDisplayVersion = previousTagForCompare ? previousTagForCompare.replace(/^v/, '') : null;
  const originalCurrentTag = currentTagForDisplay; // keep original for tree/compare links if needed
  const originalPreviousTag = previousTagForCompare;


  let headerDisplayPart: string;
  const headerLevel = getHeaderLevel(originalCurrentTag, originalPreviousTag, config.unreleased);

  if (config.unreleased) {
    headerDisplayPart = 'Unreleased';
    if (baseUrl && originalPreviousTag) { // Use original tags for links
      headerDisplayPart = `[Unreleased](${baseUrl}compare/${originalPreviousTag}...HEAD)`;
    }
  } else if (displayVersion) { // Tagged release
    headerDisplayPart = displayVersion; 
    if (baseUrl) {
      if (originalPreviousTag) { // Use original tags for links
        headerDisplayPart = `[${displayVersion}](${baseUrl}compare/${originalPreviousTag}...${originalCurrentTag})`;
      } else { 
        headerDisplayPart = `[${displayVersion}](${baseUrl}tree/${originalCurrentTag})`;
      }
    }
  } else { // All commits, no tags
    headerDisplayPart = 'Changelog';
  }

  changelog += `${headerLevel} ${headerDisplayPart} (${date})\n\n\n`; // Header + 2 blank lines

  const allCommits: CommitEntry[] = Object.values(categories).flat();
  const breakingCommits = allCommits.filter(c => c.isExclamationBreaking || c.breakingNotes.length > 0);

  if (breakingCommits.length > 0) {
    changelog += `### BREAKING CHANGES\n\n`; // Section title + 1 blank line
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
    changelog += '\n\n\n'; // 2 blank lines after section items
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
        changelog += `### ${categoryTitle}\n\n`; // Section title + 1 blank line
        categories[categoryTitle].forEach(entry => {
          const scopeText = entry.scope ? `**${entry.scope}:** ` : '';
          const commitLink = baseUrl ? `([${entry.hash}](${baseUrl}commit/${entry.hash}))` : `(${entry.hash})`;
          changelog += `* ${scopeText}${entry.message} ${commitLink}\n`;
        });
        changelog += '\n\n\n'; // 2 blank lines after section items
      }
    });

  // Remove potentially excessive trailing newlines from the very last section
  // If the entire changelog (after header) was empty, it would be just `\n\n\n`.
  // If it had content, it would end with `\n\n\n`. We want to ensure it ends with at most two newlines.
  // A simple way is to trim and add back two newlines if there was content.
  const headerEndIndex = changelog.indexOf('\n\n\n') + 3;
  const bodyContent = changelog.substring(headerEndIndex).trim();
  
  if (bodyContent.length > 0) {
    return changelog.substring(0, headerEndIndex) + bodyContent + '\n\n';
  } else {
    // No body content, just the header. Ensure it ends with one newline.
    return `${headerLevel} ${headerDisplayPart} (${date})\n`;
  }
}
