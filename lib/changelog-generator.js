// lib/changelog-generator.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_COMMIT_TYPES = {
  feat: 'Features',
  fix: 'Bug Fixes',
  docs: 'Documentation',
  style: 'Styles',
  refactor: 'Code Refactoring',
  perf: 'Performance Improvements',
  test: 'Tests',
  build: 'Build System',
  ci: 'CI',
  chore: 'Chores',
  revert: 'Reverts',
};

const DEFAULT_CONFIG = {
  repoPath: process.cwd(),
  changelogFile: 'CHANGELOG.md',
  commitTypes: DEFAULT_COMMIT_TYPES,
  githubRepoUrl: null,
  unreleased: false,
  save: false,
  fromTag: null,
  toTag: null,
};

function git(command, cwd) {
  try {
    return execSync(command, { encoding: 'utf8', cwd }).trim();
  } catch (error) {
    const errorMessage = `Git command failed in ${cwd}: ${command}\n` +
                         `Exit status: ${error.status || 'N/A'}\n` +
                         `Stdout: ${(error.stdout || '').toString().trim() || 'N/A'}\n` +
                         `Stderr: ${(error.stderr || '').toString().trim() || 'N/A'}`;
    throw new Error(errorMessage);
  }
}

function getTags(config) {
  try {
    // Use --list and --sort=-version:refname for more robust sorting of version tags
    // The 'version:refname' sorter (often abbreviated as 'v:refname') handles tags like v1.0.0, v1.2.0, v0.1.1 properly.
    const rawTags = git('git tag --list --sort=-version:refname', config.repoPath);
    if (!rawTags) return [];
    return rawTags.split('\n').filter(tag => tag && !tag.endsWith('-schema'));
  } catch (error) {
    // Handle cases where the repo is uninitialized, has no commits, or no tags.
    if (error.message.includes("not a git repository") || 
        error.message.includes("does not have any commits yet") || 
        error.message.includes("ambiguous argument 'HEAD'") ||
        error.message.includes("No names found, nothing to show") || // From 'git tag --list' if no tags
        error.message.includes("no tag found") // General "no tags" message
       ) {
      return [];
    }
    throw error;
  }
}

function getLatestTag(config) {
  const tags = getTags(config);
  return tags.length > 0 ? tags[0] : null;
}

function getPreviousTag(currentTag, config) {
  const tags = getTags(config);
  const currentIndex = tags.indexOf(currentTag);
  if (currentIndex !== -1 && currentIndex < tags.length - 1) {
    return tags[currentIndex + 1];
  }
  return null;
}

function getCommitRange(config) {
  // console.log(`[getCommitRange] Initial config: from=${config.fromTag}, to=${config.toTag}, unreleased=${config.unreleased}`);
  if (config.unreleased) {
    const baseTagForUnreleased = config.fromTag || getLatestTag(config);
    return baseTagForUnreleased ? `${baseTagForUnreleased}..HEAD` : 'HEAD';
  }

  if (config.fromTag && config.toTag) {
    return `${config.fromTag}..${config.toTag}`;
  }

  let effectiveToTag = config.toTag;
  let effectiveFromTag = config.fromTag;

  if (!effectiveToTag) { 
    effectiveToTag = getLatestTag(config); 
    if (effectiveToTag && !effectiveFromTag) { 
      effectiveFromTag = getPreviousTag(effectiveToTag, config); 
    }
  } else { 
    if (!effectiveFromTag) { 
      effectiveFromTag = getPreviousTag(effectiveToTag, config); 
    }
  }
  
  // console.log(`[getCommitRange] After auto-detection: effectiveFromTag=${effectiveFromTag}, effectiveToTag=${effectiveToTag}`);

  if (effectiveToTag) {
    if (effectiveFromTag) {
      return `${effectiveFromTag}..${effectiveToTag}`;
    } else {
      return effectiveToTag;
    }
  } else {
    return 'HEAD'; 
  }
}


function extractJiraTicket(message) {
  const jiraMatch = message.match(/([A-Z][A-Z0-9]*-\d+)/i);
  return jiraMatch ? jiraMatch[1].toUpperCase() : null;
}

function parseCommits(range, config) {
  let command;
  // If range is 'HEAD' or a single tag (like 'v0.1.0'), it means all commits up to that point.
  // If range is 'TAG1..TAG2', it means commits between TAG1 (exclusive) and TAG2 (inclusive).
  if (range) {
    command = `git log ${range} --format="%H%n%s%n%b%n==END==" --no-merges`;
  } else { 
    // This case should ideally not be hit if getCommitRange always returns a valid range string.
    // However, as a fallback, assume HEAD if range is somehow null/undefined.
    command = `git log HEAD --format="%H%n%s%n%b%n==END==" --no-merges`;
  }
  
  let output;
  try {
    // console.log(`[parseCommits] Executing: ${command} in ${config.repoPath}`);
    output = git(command, config.repoPath);
    // console.log(`[parseCommits] Raw output for range '${range}':\n---\n${output}\n---`);
  } catch (error) {
    // The git() function already throws a detailed error.
    // This catch block handles specific git log failures that might return non-zero exit codes
    // but are expected scenarios (e.g., logging an empty repo or a non-existent revision).
    const errorMessage = error.message.toLowerCase(); // Standardize for easier matching
    if (errorMessage.includes('unknown revision or path not in the working tree') || 
        (errorMessage.includes('fatal: your current branch') && errorMessage.includes('does not have any commits yet')) ||
        errorMessage.includes('fatal: bad revision') || // e.g. tag does not exist
        errorMessage.includes("does not have any commits") // another variation
        ) {
      output = ''; 
    } else {
      throw error; // Re-throw other unexpected errors
    }
  }

  if (!output) {
    return {};
  }

  const rawCommits = output.split('==END==\n').filter(Boolean);
  const commits = rawCommits.reverse(); // Process oldest first for JIRA deduplication

  const seenJiraTickets = new Set();
  const categories = {};
  const effectiveCommitTypes = { ...DEFAULT_COMMIT_TYPES, ...config.commitTypes };

  for (const commit of commits) {
    const parts = commit.trim().split('\n');
    const hash = parts[0];
    const subject = parts[1];
    // Body can be multi-line or empty. parts[2] would be the first line of body, or empty if no body.
    const body = parts.length > 2 ? parts.slice(2).join('\n') : ''; 
    const fullMessage = subject + (body ? '\n' + body : '');

    const jiraTicket = extractJiraTicket(fullMessage);

    if (jiraTicket && seenJiraTickets.has(jiraTicket)) {
      continue; 
    }

    const match = subject.match(/^(\w+)(?:\(([^)]+)\))?:\s+(.+)$/);

    if (match) {
      const [, type, scope, messageText] = match;
      if (effectiveCommitTypes[type]) {
        const category = effectiveCommitTypes[type];

        if (jiraTicket) {
          seenJiraTickets.add(jiraTicket);
        }

        const entry = {
          hash: hash.substring(0, 7),
          message: (jiraTicket && !messageText.toUpperCase().includes(`(${jiraTicket})`) && !messageText.toUpperCase().includes(jiraTicket)) // Check if JIRA ID already in message
                     ? `${messageText} (${jiraTicket})`
                     : messageText,
          scope,
          jiraTicket
        };

        if (!categories[category]) {
          categories[category] = [];
        }
        categories[category].push(entry);
      }
    }
  }
  return categories;
}

function formatChangelog(categories, tagName, config) {
  const date = new Date().toISOString().split('T')[0];
  let changelog = '';

  if (config.unreleased) {
    changelog += '# Unreleased\n\n';
  } else if (tagName) {
    changelog += `# ${tagName} (${date})\n\n`;
  } else {
    changelog += `# Changelog (${date})\n\n`;
  }

  // Sort categories based on DEFAULT_COMMIT_TYPES order, then alphabetically for custom types
  const defaultOrder = Object.values(DEFAULT_COMMIT_TYPES);
  const sortedCategoryNames = Object.keys(categories).sort((aTitle, bTitle) => {
      const indexA = defaultOrder.findIndex(defaultTitle => defaultTitle === aTitle);
      const indexB = defaultOrder.findIndex(defaultTitle => defaultTitle === bTitle);

      if (indexA !== -1 && indexB !== -1) return indexA - indexB; // Both are default types
      if (indexA !== -1) return -1; // A is default, B is custom (or not found in default)
      if (indexB !== -1) return 1;  // B is default, A is custom
      return aTitle.localeCompare(bTitle); // Both are custom (or not found in default)
  });

  sortedCategoryNames.forEach(category => {
    if (categories[category].length > 0) {
      changelog += `## ${category}\n\n`;
      categories[category].forEach(entry => {
        const scopeText = entry.scope ? `**${entry.scope}:** ` : '';
        let commitLink = `(${entry.hash})`;
        if (config.githubRepoUrl) {
          const baseUrl = config.githubRepoUrl.endsWith('/') ? config.githubRepoUrl : config.githubRepoUrl + '/';
          commitLink = `([${entry.hash}](${baseUrl}commit/${entry.hash}))`;
        }
        changelog += `- ${scopeText}${entry.message} ${commitLink}\n`;
      });
      changelog += '\n';
    }
  });
  return changelog;
}

async function generateChangelog(userConfig = {}) {
  const config = { ...DEFAULT_CONFIG, ...userConfig };
  if (userConfig.commitTypes) {
    config.commitTypes = { ...DEFAULT_COMMIT_TYPES, ...userConfig.commitTypes};
  }

  if (config.save && !config.changelogFile) {
    throw new Error("Changelog file path (`changelogFile`) must be specified when `save` is true.");
  }
  if (config.githubRepoUrl && !(config.githubRepoUrl.startsWith('http://') || config.githubRepoUrl.startsWith('https://'))) {
    throw new Error("`githubRepoUrl` must be a valid URL (e.g., https://github.com/owner/repo).");
  }
  
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
            titleTagForFormatting = null;
        }
    }
    // console.log(`[generateChangelog] titleTagForFormatting: ${titleTagForFormatting}`);

    const changelogContent = formatChangelog(categories, titleTagForFormatting, config);

    if (config.save) {
      let existingContent = '';
      const changelogFilePath = path.isAbsolute(config.changelogFile) 
        ? config.changelogFile 
        : path.join(config.repoPath, config.changelogFile);

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
