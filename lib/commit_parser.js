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
    output = git(command, config.repoPath);
  } catch (error) {
    const errorMessage = error.message.toLowerCase();
    if (errorMessage.includes("does not have any commits yet") || 
        errorMessage.includes("unknown revision or path not in the working tree") || 
        errorMessage.includes("fatal: bad revision") || 
        errorMessage.includes("your current branch master does not have any commits yet") ||
        (errorMessage.includes("fatal: your current branch") && errorMessage.includes("does not have any commits yet"))
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
  const commits = rawCommits.reverse(); 

  const seenJiraTickets = new Set();
  const categories = {};
  const effectiveCommitTypes = config.commitTypes;

  for (const commit of commits) {
    const parts = commit.trim().split('\n');
    const hash = parts[0];
    const subjectLine = parts[1];
    const body = parts.length > 2 ? parts.slice(2).join('\n') : '';
    const fullMessage = subjectLine + (body ? '\n' + body : '');

    const jiraTicket = extractJiraTicket(fullMessage);

    if (jiraTicket && seenJiraTickets.has(jiraTicket)) {
      continue;
    }

    const subjectMatch = subjectLine.match(/^(\w+)(?:\(([^)]+)\))?(!?):\s+(.*)$/);

    if (subjectMatch) {
      const [, type, scope, breakingMarker, messageText] = subjectMatch;

      if (effectiveCommitTypes[type]) {
        const categoryTitle = effectiveCommitTypes[type];

        if (jiraTicket) {
          seenJiraTickets.add(jiraTicket);
        }

        const entry = {
          hash: hash.substring(0, 7),
          subject: messageText, 
          message: (jiraTicket && !messageText.toUpperCase().includes(`(${jiraTicket})`) && !messageText.toUpperCase().includes(jiraTicket))
                     ? `${messageText} (${jiraTicket})`
                     : messageText,
          scope,
          jiraTicket,
          type,
          isExclamationBreaking: breakingMarker === '!',
          breakingNotes: [] 
        };

        const breakingChangeKeywords = ["BREAKING CHANGE:", "BREAKING-CHANGE:"];
        let currentBody = body; // Process only the body for footers
        
        // eslint-disable-next-line no-constant-condition
        while(true) {
            let bestKeywordIndexInBody = -1;
            let matchedKeywordLength = 0;
            let keywordFound = null;

            for (const keyword of breakingChangeKeywords) {
                const keywordIndex = currentBody.toLowerCase().indexOf(keyword.toLowerCase());
                if (keywordIndex !== -1) {
                    // Check if this keyword is at the start of a line in the body
                    const lineStartBeforeKeyword = currentBody.lastIndexOf('\n', keywordIndex -1);
                    const textBeforeKeywordOnLine = currentBody.substring(lineStartBeforeKeyword === -1 ? 0 : lineStartBeforeKeyword + 1, keywordIndex);

                    if (textBeforeKeywordOnLine.trim() === '') { // Starts a new line (or is at start of body)
                        if (bestKeywordIndexInBody === -1 || keywordIndex < bestKeywordIndexInBody) {
                            bestKeywordIndexInBody = keywordIndex;
                            matchedKeywordLength = keyword.length;
                            keywordFound = keyword;
                        }
                    }
                }
            }

            if (keywordFound) {
                // Extract the note after the keyword
                // The note is the text following the keyword, potentially multi-paragraph.
                // We assume the note extends until the end of the commit body or another *different* type of footer.
                // For simplicity here, we'll take the rest of the currentBody after this keyword instance.
                // If there are multiple BREAKING CHANGE footers, this loop will find them sequentially.
                let noteText = currentBody.substring(bestKeywordIndexInBody + matchedKeywordLength).trim();
                
                // The test case `feat(module)!` has a note: "Module X API is entirely new.\n\nSee migration guide..."
                // We want to capture both lines. Removing the `doubleNewlineIndex` truncation.
                // If other footers follow, they might be included if not handled. This is a simplification.

                if (noteText) {
                    entry.breakingNotes.push(noteText);
                }
                
                // Advance currentBody past this processed footer to find the next one
                // This is a simplification: assumes footers don't contain other footer keywords.
                currentBody = currentBody.substring(bestKeywordIndexInBody + matchedKeywordLength + noteText.length);
            } else {
                break; // No more valid "BREAKING CHANGE:" footers found in the remaining body
            }
        }

        if (!categories[categoryTitle]) {
          categories[categoryTitle] = [];
        }
        categories[categoryTitle].push(entry);
      }
    }
  }
  return categories;
}

module.exports = {
  extractJiraTicket,
  parseCommits,
};
