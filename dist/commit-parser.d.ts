import { ResolvedChangelogConfig } from './config';
export interface CommitEntry {
    hash: string;
    subject: string;
    message: string;
    scope?: string;
    jiraTicket: string | null;
    issue: string | null;
    type: string;
    isExclamationBreaking: boolean;
    breakingNotes: string[];
}
export type ParsedCommits = Record<string, CommitEntry[]>;
export declare function extractJiraTicket(message: string): string | null;
export declare function extractIssueNumber(message: string): string | null;
export declare function parseCommits(range: string | null, config: ResolvedChangelogConfig): ParsedCommits;
