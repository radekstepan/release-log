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
    const body = parts.length > 2 ? parts.slice(2).join('\n').trim() : ''; // Trim the body
    const fullMessage = subject + (body ? '\n' + body : '');

    const commitNotes = [];
    if (body) {
      const bodyLines = body.split('\n');
      let currentNote = null;
      for (let i = 0; i < bodyLines.length; i++) {
        const line = bodyLines[i];
        const breakingChangeMatch = line.match(/^BREAKING(?:-CHANGE)?:(.*)/i);

        if (breakingChangeMatch) {
          // If there's an existing note, push it before starting a new one
          if (currentNote) {
            commitNotes.push(currentNote);
          }
          currentNote = {
            title: 'BREAKING CHANGE',
            text: breakingChangeMatch[1].trim()
          };
        } else if (currentNote) {
          // Check if the line looks like a new footer/metadata or is empty
          // This is a simple heuristic. More robust parsing might involve checking against a list of known footer keywords.
          if (line.match(/^\s*[a-zA-Z-]+:/) || line.trim() === '') {
            // End of current note
            commitNotes.push(currentNote);
            currentNote = null;
            // Potentially re-process this line if it's a new BREAKING CHANGE, though unlikely if it matched here.
            // For simplicity, we assume one BREAKING CHANGE note for now, or that they are clearly separated.
            // If it's another footer, it's ignored for the current note.
            // If it's a blank line, it definitely ends the current note.
          } else {
            // It's a continuation of the current note's text
            currentNote.text += '\n' + line.trim();
          }
        }
      }
      // Add the last collected note if any
      if (currentNote) {
        commitNotes.push(currentNote);
      }
    }

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

        if (commitNotes.length > 0) {
          entry.notes = commitNotes;
        }

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
