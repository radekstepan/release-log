import { git } from './git_utils';
import { ResolvedChangelogConfig } from './config';

export interface CommitEntry {
  hash: string;
  subject: string;
  message: string;
  scope?: string;
  jiraTicket: string | null;
  type: string;
  isExclamationBreaking: boolean;
  breakingNotes: string[];
}

export type ParsedCommits = Record<string, CommitEntry[]>; // CategoryTitle -> Commits

export function extractJiraTicket(message: string): string | null {
  const jiraMatch = message.match(/([A-Z][A-Z0-9]*-\d+)/i);
  return jiraMatch ? jiraMatch[1].toUpperCase() : null;
}

export function parseCommits(range: string | null, config: ResolvedChangelogConfig): ParsedCommits {
  let command: string;
  if (range) {
    command = `git log ${range} --format="%H%n%s%n%b%n==END==" --no-merges`;
  } else {
    command = `git log HEAD --format="%H%n%s%n%b%n==END==" --no-merges`;
  }

  let output: string;
  try {
    output = git(command, config.repoPath);
  } catch (error: any) {
    if (error instanceof Error) {
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
    } else {
        throw error; // re-throw if not an Error instance
    }
  }

  if (!output) {
    return {};
  }

  const rawCommits = output.split('==END==\n').filter(Boolean);
  const commits = rawCommits.reverse(); 

  const seenJiraTickets = new Set<string>();
  const categories: ParsedCommits = {};
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

        const entry: CommitEntry = {
          hash: hash.substring(0, 7),
          subject: messageText, 
          message: (jiraTicket && !messageText.toUpperCase().includes(`(${jiraTicket})`) && !messageText.toUpperCase().includes(jiraTicket))
                     ? `${messageText} (${jiraTicket})`
                     : messageText,
          scope: scope || undefined, // Ensure scope is undefined if not present
          jiraTicket,
          type,
          isExclamationBreaking: breakingMarker === '!',
          breakingNotes: [] 
        };

        const breakingChangeKeywords = ["BREAKING CHANGE:", "BREAKING-CHANGE:"];
        let currentBody = body;
        
        // eslint-disable-next-line no-constant-condition
        while(true) {
            let bestKeywordIndexInBody = -1;
            let matchedKeywordLength = 0;
            let keywordFound: string | null = null;

            for (const keyword of breakingChangeKeywords) {
                const keywordIndex = currentBody.toLowerCase().indexOf(keyword.toLowerCase());
                if (keywordIndex !== -1) {
                    const lineStartBeforeKeyword = currentBody.lastIndexOf('\n', keywordIndex -1);
                    const textBeforeKeywordOnLine = currentBody.substring(lineStartBeforeKeyword === -1 ? 0 : lineStartBeforeKeyword + 1, keywordIndex);

                    if (textBeforeKeywordOnLine.trim() === '') {
                        if (bestKeywordIndexInBody === -1 || keywordIndex < bestKeywordIndexInBody) {
                            bestKeywordIndexInBody = keywordIndex;
                            matchedKeywordLength = keyword.length;
                            keywordFound = keyword;
                        }
                    }
                }
            }

            if (keywordFound) {
                let noteText = currentBody.substring(bestKeywordIndexInBody + matchedKeywordLength).trim();
                
                if (noteText) {
                    entry.breakingNotes.push(noteText);
                }
                
                currentBody = currentBody.substring(bestKeywordIndexInBody + matchedKeywordLength + noteText.length);
            } else {
                break; 
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
