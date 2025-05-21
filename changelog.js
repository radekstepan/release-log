#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');

// Configuration
const CHANGELOG_FILE = 'CHANGELOG.md';
const COMMIT_TYPES = {
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

// Parse arguments
const args = process.argv.slice(2);
const unreleased = args.includes('--unreleased');
const save = args.includes('--save');

// Parse from and to tags from arguments
let fromTag = null;
let toTag = null;

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--from=')) {
    fromTag = args[i].substring(7);
  } else if (args[i].startsWith('--to=')) {
    toTag = args[i].substring(5);
  }
}

// Helper function to execute git commands
function git(command) {
  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch (error) {
    console.error(`Error executing git command: ${command}`);
    console.error(error.message);
    return '';
  }
}

// Get all tags sorted by creation date (newest first), excluding -schema tags
function getTags() {
  const tags = git('git tag --sort=-creatordate')
    .split('\n')
    .filter(tag => tag && !tag.endsWith('-schema'));
  
  return tags;
}

// Get latest tag
function getLatestTag() {
  const tags = getTags();
  return tags.length > 0 ? tags[0] : null;
}

// Get previous tag based on the current tag
function getPreviousTag(currentTag) {
  const tags = getTags();
  const currentIndex = tags.indexOf(currentTag);
  return currentIndex < tags.length - 1 ? tags[currentIndex + 1] : null;
}

// Get commit range to use
function getCommitRange() {
  // If from/to tags are specified, use them
  if (fromTag && toTag) {
    return `${fromTag}..${toTag}`;
  }
  
  const latestTag = toTag || getLatestTag();
  const previousTag = fromTag || (latestTag ? getPreviousTag(latestTag) : null);
  
  if (unreleased) {
    return latestTag ? `${latestTag}..HEAD` : '';
  } else if (previousTag && latestTag) {
    return `${previousTag}..${latestTag}`;
  } else if (latestTag) {
    // For first tag, include all commits up to that tag
    return `${latestTag}`;
  } else {
    // No tags found, include all commits
    return '';
  }
}

// Extract JIRA ticket from commit message
function extractJiraTicket(message) {
  // Common JIRA ticket pattern (e.g., ABC-123, PROJECT-456)
  const jiraMatch = message.match(/([A-Z]+-\d+)/);
  return jiraMatch ? jiraMatch[1] : null;
}

// Parse commits into categorized changelog entries
function parseCommits(range) {
  // Get raw commits
  let command;
  
  if (range) {
    if (range.indexOf('..') > -1) {
      command = `git log ${range} --format="%H%n%s%n%b%n==END==" --no-merges`;
    } else {
      // For a single tag, we need to get all commits up to that tag
      command = `git log ${range} --format="%H%n%s%n%b%n==END==" --no-merges`;
    }
  } else {
    command = `git log --format="%H%n%s%n%b%n==END==" --no-merges`;
  }
  
  // Debug output
  console.log(`Executing command: ${command}`);
  
  const output = git(command);
  if (!output) {
    console.log('No commits found in the specified range.');
    return {};
  }
  
  const commits = output.split('==END==\n').filter(Boolean);
  console.log(`Found ${commits.length} commits in the range.`);
  
  // Track JIRA tickets to avoid duplicates
  const seenJiraTickets = new Set();
  const categories = {};

  for (const commit of commits) {
    const [hash, subject, ...bodyParts] = commit.trim().split('\n');
    const body = bodyParts.join('\n');
    const fullMessage = subject + '\n' + body;
    
    // Extract JIRA ticket from commit message
    const jiraTicket = extractJiraTicket(fullMessage);
    
    // Skip if we've seen this JIRA ticket before
    if (jiraTicket && seenJiraTickets.has(jiraTicket)) {
      console.log(`Skipping duplicate commit for ticket ${jiraTicket}: ${subject}`);
      continue;
    }
    
    // Parse conventional commit
    const match = subject.match(/^(\w+)(?:\(([^)]+)\))?:\s+(.+)$/);
    
    if (match) {
      const [, type, scope, message] = match;
      if (COMMIT_TYPES[type]) {
        const category = COMMIT_TYPES[type];
        
        // If JIRA ticket is found, mark it as seen
        if (jiraTicket) {
          seenJiraTickets.add(jiraTicket);
        }
        
        const entry = {
          hash: hash.substring(0, 7),
          message: jiraTicket ? `${message} (${jiraTicket})` : message,
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

// Format changelog
function formatChangelog(categories, tagName) {
  const date = new Date().toISOString().split('T')[0];
  let changelog = '';
  
  // Add header
  if (unreleased) {
    changelog += '# Unreleased\n\n';
  } else if (tagName) {
    changelog += `# ${tagName} (${date})\n\n`;
  } else {
    changelog += `# Initial Release (${date})\n\n`;
  }
  
  // Add entries by category
  Object.keys(categories).forEach(category => {
    if (categories[category].length > 0) {
      changelog += `## ${category}\n\n`;
      
      categories[category].forEach(entry => {
        const scope = entry.scope ? `**${entry.scope}:** ` : '';
        changelog += `- ${scope}${entry.message} ([${entry.hash}](https://github.com/your-org/your-repo/commit/${entry.hash}))\n`;
      });
      
      changelog += '\n';
    }
  });
  
  return changelog;
}

// Main function
function main() {
  try {
    const range = getCommitRange();
    console.log(`Using commit range: ${range || 'all commits'}`);
    
    const latestTag = toTag || getLatestTag();
    const categories = parseCommits(range);
    
    if (Object.keys(categories).length === 0) {
      console.log('No conventional commits found in the specified range.');
      return;
    }
    
    // For unreleased changes
    const tagToUse = unreleased ? null : latestTag;
    const changelog = formatChangelog(categories, tagToUse);
    
    // Output changelog
    console.log(changelog);
    
    // Option to save to file
    if (save) {
      if (unreleased) {
        // Prepend to existing changelog
        const existingChangelog = fs.existsSync(CHANGELOG_FILE) 
          ? fs.readFileSync(CHANGELOG_FILE, 'utf8')
          : '';
        fs.writeFileSync(CHANGELOG_FILE, changelog + existingChangelog);
      } else {
        // Create new changelog or prepend to existing
        if (fs.existsSync(CHANGELOG_FILE)) {
          const existingChangelog = fs.readFileSync(CHANGELOG_FILE, 'utf8');
          fs.writeFileSync(CHANGELOG_FILE, changelog + existingChangelog);
        } else {
          fs.writeFileSync(CHANGELOG_FILE, changelog);
        }
      }
      console.log(`Changelog saved to ${CHANGELOG_FILE}`);
    }
  } catch (error) {
    console.error('Error generating changelog:', error.message);
    process.exit(1);
  }
}

main();
