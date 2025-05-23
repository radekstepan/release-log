import { ResolvedChangelogConfig, PreviousSemverTagsOptions } from './config';
export interface SemVer {
    major: number;
    minor: number;
    patch: number;
    preRelease?: string;
    original: string;
}
export declare function parseSemVer(tag: string): SemVer | null;
export declare function git(command: string, cwd: string): string;
export declare function getTags(config: Pick<ResolvedChangelogConfig, 'repoPath' | 'tagFilter'>): string[];
export declare function getLatestTag(config: Pick<ResolvedChangelogConfig, 'repoPath' | 'tagFilter'>): string | null;
export declare function getPreviousTag(currentTag: string, config: Pick<ResolvedChangelogConfig, 'repoPath' | 'tagFilter'>): string | null;
export interface CommitRangeDetails {
    range: string;
    displayFromTag: string | null;
    displayToTag: string | null;
}
export declare function getCommitRangeDetails(config: ResolvedChangelogConfig): CommitRangeDetails;
/**
 * Retrieves a list of tags representing previous semantic versions (major or minor).
 * @param options - Configuration options.
 * @returns A promise that resolves with an array of tag strings.
 */
export declare function getPreviousSemverTags(options: PreviousSemverTagsOptions): Promise<string[]>;
