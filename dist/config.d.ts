import { CommitEntry } from './commit-parser';
export type CommitTypeMapping = Record<string, string>;
export type TagFilter = (tag: string) => boolean;
export type CommitFilter = (commit: CommitEntry) => boolean;
export type TagRange = {
    from?: string;
    to?: string;
};
export interface ChangelogUserConfig {
    repoPath?: string;
    changelogFile?: string;
    githubRepoUrl?: string | null;
    unreleased?: boolean;
    save?: boolean;
    tag?: string | TagRange | null;
    tagFilter?: TagFilter;
    commitFilter?: CommitFilter;
    commitTypes?: CommitTypeMapping;
}
export interface ResolvedChangelogConfig {
    repoPath: string;
    changelogFile: string;
    githubRepoUrl: string | null;
    unreleased: boolean;
    save: boolean;
    tag?: string | TagRange | null;
    tagFilter: TagFilter;
    commitFilter: CommitFilter;
    commitTypes: CommitTypeMapping;
}
export interface PreviousSemverTagsOptions {
    startingTag?: string;
    count: {
        major: number;
    } | {
        minor: number;
    };
    repoPath?: string;
    tagFilter?: TagFilter;
}
export declare const DEFAULT_COMMIT_TYPES: CommitTypeMapping;
export declare const defaultTagFilter: TagFilter;
export declare function resolveConfig(userConfig?: ChangelogUserConfig): ResolvedChangelogConfig;
