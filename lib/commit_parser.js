const { git } = require('./git_utils');

function extractJiraTicket(message) {
  const jiraMatch = message.match(/([A-Z][A-Z0-9]*-\d+)/i);
  return jiraMatch ? jiraMatch[1].toUpperCase() : null;
}

function parseCommits(range, config) {
  let command;
  if (range) {
    command = `git log ${range} --format="%H%n%s%n%b%n==END==" --no-merges`;
  } else {
    command = `git log HEAD --format="%H%n%s%n%b%n==END==" --no-merges`;
  }

  let output;
  try {
    // console.log(`[parseCommits] Executing: ${command} in ${config.repoPath}`);
    output = git(command, config.repoPath);
    // console.log(`[parseCommits] Raw output for range '${range}':\n---\n${output}\n---`);
  } catch (error) {
    const errorMessage = error.message.toLowerCase();
    if (errorMessage.includes('unknown revision or path not in the working tree') ||
        (errorMessage.includes('fatal: your current branch') && errorMessage.includes('does not have any commits yet')) ||
        errorMessage.includes('fatal: bad revision') ||
        errorMessage.includes("does not have any commits")
        ) {
      output = '';
    } else {
      throw error;
    }
  }

  if (!output) {
    return {};
  }

  const rawCommits = output.split('==END==\n').filter(Boolean);
  const commits = rawCommits.reverse(); // Process oldest first for JIRA deduplication

  const seenJiraTickets = new Set();
  const categories = {};
  const effectiveCommitTypes = config.commitTypes; // Already fully resolved by resolveConfig

  for (const commit of commits) {
    const parts = commit.trim().split('\n');
    const hash = parts[0];
    const subject = parts[1];
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
          message: (jiraTicket && !messageText.toUpperCase().includes(`(${jiraTicket})`) && !messageText.toUpperCase().includes(jiraTicket))
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

module.exports = {
  extractJiraTicket,
  parseCommits,
};
