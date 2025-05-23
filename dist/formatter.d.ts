import { ResolvedChangelogConfig } from './config';
import { ParsedCommits } from './commit-parser';
export declare function formatChangelog(categories: ParsedCommits, currentTagForDisplay: string | null | undefined, previousTagForCompare: string | null | undefined, config: ResolvedChangelogConfig): string;
