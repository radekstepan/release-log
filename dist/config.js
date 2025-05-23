"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultTagFilter = exports.DEFAULT_COMMIT_TYPES = void 0;
exports.resolveConfig = resolveConfig;
const path_1 = __importDefault(require("path"));
exports.DEFAULT_COMMIT_TYPES = {
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
const defaultTagFilter = (tag) => Boolean(tag && !tag.endsWith('-schema'));
exports.defaultTagFilter = defaultTagFilter;
const defaultCommitFilter = (_commit) => true;
function resolveConfig(userConfig = {}) {
    const resolved = {
        repoPath: userConfig.repoPath ?? process.cwd(),
        changelogFile: userConfig.changelogFile ?? 'CHANGELOG.md',
        githubRepoUrl: userConfig.githubRepoUrl === undefined ? null : userConfig.githubRepoUrl,
        unreleased: userConfig.unreleased ?? false,
        save: userConfig.save ?? false,
        tag: userConfig.tag === undefined ? undefined : userConfig.tag,
        tagFilter: exports.defaultTagFilter,
        commitFilter: defaultCommitFilter,
        commitTypes: { ...exports.DEFAULT_COMMIT_TYPES, ...(userConfig.commitTypes || {}) },
    };
    if (typeof userConfig.tagFilter === 'function') {
        resolved.tagFilter = userConfig.tagFilter;
    }
    else if (userConfig.tagFilter !== undefined) {
        console.warn("Warning: `tagFilter` provided is not a function. Using default tag filter.");
    }
    if (typeof userConfig.commitFilter === 'function') {
        resolved.commitFilter = userConfig.commitFilter;
    }
    else if (userConfig.commitFilter !== undefined) {
        console.warn("Warning: `commitFilter` provided is not a function. Using default commit filter.");
    }
    if (resolved.save && !resolved.changelogFile) {
        throw new Error("Changelog file path (`changelogFile`) must be specified when `save` is true.");
    }
    if (resolved.githubRepoUrl && !(resolved.githubRepoUrl.startsWith('http://') || resolved.githubRepoUrl.startsWith('https://'))) {
        throw new Error("`githubRepoUrl` must be a valid URL (e.g., https://github.com/owner/repo).");
    }
    if (resolved.save && resolved.changelogFile && !path_1.default.isAbsolute(resolved.changelogFile)) {
        resolved.changelogFile = path_1.default.join(resolved.repoPath, resolved.changelogFile);
    }
    return resolved;
}
