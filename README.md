# release-log

A library to programmatically generate changelogs from git history and conventional commits, following the [conventional-changelog-angular](https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-changelog-angular) preset style. This tool helps automate the process of creating and maintaining `CHANGELOG.md` files. Now written in TypeScript with type definitions included!

It also provides utility functions for working with git tags.

## Features

*   **Angular Preset Formatting:**
    *   Changelog sections start with `## [vX.Y.Z](compare_url) (YYYY-MM-DD)` or `## [Unreleased](compare_url) (YYYY-MM-DD)`.
    *   `BREAKING CHANGES` are prominently displayed in their own `###` section at the top.
    *   Commit types (Features, Bug Fixes, etc.) are `###` sections.
    *   Commits are listed with asterisks, scopes, and links: `* **scope:** message ([hash](commit_url))`.
*   **Conventional Commits Parsing:** Understands standard conventional commit types (`feat`, `fix`, `perf`, `docs`, etc.) and breaking change indicators (`!` or `BREAKING CHANGE:` footer).
*   **Tag-Based Changelogs:**
    *   Generate changelog for a specific tag (e.g., `v1.0.0`).
    *   Generate changelog for a range between two tags (e.g., `v1.0.0..v1.1.0`).
    *   Generate changelog from a specific tag to the latest tag or `HEAD`.
    *   Generate changelog for the latest release by default if no tag is specified.
*   **Unreleased Changes:** Generate a section for "Unreleased" changes since the last tag, a specific tag, or by default.
*   **Customizable Commit Types:** Define custom commit types or override default section titles (e.g., map `feat` to "✨ New Features"). These will be sorted after standard Angular sections.
*   **JIRA Integration:**
    *   Automatically extracts JIRA ticket IDs (e.g., `PROJ-123`) from commit messages.
    *   Appends JIRA ID to commit messages in the changelog if not already present.
    *   Includes all relevant commits, even if multiple commits share the same JIRA ticket ID within a release (respecting `commitFilter`).
*   **Issue Number Extraction:** Extracts issue numbers (e.g., `123` from `(#123)`) from commit messages into the `CommitEntry.issue` field.
*   **GitHub Integration:** Generates links to commits, tags, and comparisons if a `githubRepoUrl` is provided for changelog generation.
*   **File Operations:**
    *   Optionally save the generated changelog to a file.
    *   Prepends new content to the existing changelog file.
*   **Tag Utilities:** Includes functions like `getPreviousSemverTags` to retrieve lists of tags based on semantic versioning (major or minor).
*   **Robust Handling:**
    *   Flexible tag filtering using a `tagFilter` function (defaults to ignoring tags ending with `-schema`).
    *   Flexible commit filtering using a `commitFilter` function (defaults to including all parsed conventional commits).
    *   Gracefully handles repositories with no tags, no commits, or no conventional commits within a range.
*   **Flexible Configuration:** Highly configurable to suit various project needs.
*   **TypeScript Support:** Includes type definitions for a better development experience in TypeScript projects.

## Installation

Using yarn:
```bash
yarn add release-log
```
Or npm:
```bash
npm install release-log
```

## Usage

### Basic Changelog Example (JavaScript)

```javascript
const { generateChangelog } = require('release-log'); // Or import if using ESModules

async function createChangelog() {
  try {
    // Generate changelog for the latest release (commits between the last two tags)
    const changelogContent = await generateChangelog({
      repoPath: '/path/to/your/git/repository', // Defaults to process.cwd()
      githubRepoUrl: 'https://github.com/your-org/your-repo' // For commit and comparison links
      // 'tag' option is undefined by default, meaning latest release.
    });
    console.log(changelogContent);

    // Generate changelog for a specific tag
    const v1changelog = await generateChangelog({
      repoPath: '/path/to/your/git/repository',
      tag: 'v1.0.0',
      githubRepoUrl: 'https://github.com/your-org/your-repo'
    });
    console.log(v1changelog);

    // Generate changelog for a range
    const v1toV2changelog = await generateChangelog({
      repoPath: '/path/to/your/git/repository',
      tag: { from: 'v1.0.0', to: 'v1.1.0' },
      githubRepoUrl: 'https://github.com/your-org/your-repo'
    });
    console.log(v1toV2changelog);

  } catch (error) {
    console.error('Failed to generate changelog:', error);
  }
}

createChangelog();
```

### Advanced Changelog Example (TypeScript)

```typescript
import { generateChangelog, ChangelogConfig, CommitEntry } from 'release-log';

async function updateMyChangelog() {
  try {
    const options: ChangelogConfig = {
      repoPath: process.cwd(),
      unreleased: true, 
      // When unreleased is true and tag is not specified, 
      // it generates from the latest tag to HEAD.
      // To specify a base for unreleased: tag: { from: 'vSpecificTag' }
      save: true,
      changelogFile: 'CHANGELOG.md', 
      githubRepoUrl: 'https://github.com/your-org/your-repo',
      commitTypes: {
        feat: '🚀 New Features & Enhancements',
        fix: '🐛 Bug Fixes',
        perf: '⚡ Performance Improvements',
      },
      tagFilter: (tag: string) => /^v\d+\.\d+\.\d+$/.test(tag), // Only final release tags
      commitFilter: (commit: CommitEntry) => {
        // Example: Exclude commits with "[WIP]" in their subject message
        if (commit.subject.includes('[WIP]')) {
          return false;
        }
        // Example: Exclude 'chore' type commits unless they are breaking or related to issue #789
        if (commit.type === 'chore' && 
            !commit.isExclamationBreaking && 
            commit.breakingNotes.length === 0 &&
            commit.issue !== '789') {
          return false;
        }
        // Example: Only include commits related to a JIRA ticket or a specific issue number
        // if (!commit.jiraTicket && commit.issue !== '123') {
        //   return false;
        // }
        return true;
      }
    };

    const changelogContent = await generateChangelog(options);
    console.log('Changelog updated successfully!');
  } catch (error) {
    console.error('Failed to update changelog:', error);
  }
}

updateMyChangelog();
```

## Tag Utilities

### `getPreviousSemverTags`

This utility function helps you find tags corresponding to previous major or minor releases based on semantic versioning.

```typescript
import { getPreviousSemverTags, PreviousSemverTagsOptions } from 'release-log';

async function findPreviousReleases() {
  try {
    // Example 1: Find 2 previous major release tags
    const majorOptions: PreviousSemverTagsOptions = {
      repoPath: process.cwd(), // Optional
      count: { major: 2 },     // Find 2 previous major versions
      // startingTag: 'v5.2.0', // Optional, tag to start searching backwards from. Defaults to latest semver tag.
      // tagFilter: (tag: string) => !tag.includes('-beta'), // Optional
    };
    const majorTags = await getPreviousSemverTags(majorOptions);
    // If current latest is v5.x.y, majorTags might be ['v4.8.0', 'v3.10.2'] (latest tags from major 4 and 3)
    console.log('Previous major release tags:', majorTags);

    // Example 2: Find 1 previous minor release tag from v2.3.0
    const minorOptions: PreviousSemverTagsOptions = {
      repoPath: process.cwd(),
      count: { minor: 1 },     // Find 1 previous minor version
      startingTag: 'v2.3.0',   // Anchor search to v2.3.0
    };
    const minorTags = await getPreviousSemverTags(minorOptions);
    // If tags like v2.3.0, v2.2.5, v2.1.0 exist, minorTags would be ['v2.2.5']
    console.log('Previous minor release tags (from v2.3.0):', minorTags);

  } catch (error) {
    console.error('Failed to get previous semver tags:', error);
  }
}

findPreviousReleases();
```

#### `PreviousSemverTagsOptions`

| Option        | Type                                               | Default                                      | Description                                                                                                                                    |
| ------------- | -------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `repoPath`    | `string`                                           | `process.cwd()`                              | Path to the git repository.                                                                                                                    |
| `count`       | `{ major: number } \| { minor: number }`           | **Required**                                 | Specifies the number of previous major versions OR previous minor versions to find. <br> - `{ major: N }`: Find N previous major versions. <br> - `{ minor: N }`: Find N previous minor versions (within the same major as the `startingTag` or latest semver tag). |
| `startingTag` | `string`                                           | Latest semantic version tag                  | An optional tag string to start searching backwards from. If the `startingTag` itself is not a semantic version, the search anchors from the nearest older or equivalent semantic version tag. |
| `tagFilter`   | `(tag: string) => boolean`                         | `(tag) => tag && !tag.endsWith('-schema')` | A function that receives a tag string and returns `true` if the tag should be considered, `false` otherwise. Applied before any other logic. |


## Configuration Options (for `generateChangelog`)

The `generateChangelog` function accepts an options object (`ChangelogConfig`) with the following properties:

| Option          | Type                                               | Default                                                      | Description                                                                                                                                                              |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `repoPath`      | `string`                                           | `process.cwd()`                                              | Path to the git repository.                                                                                                                                              |
| `tag`           | `string \| { from?: string; to?: string; } \| null \| undefined` | `undefined`                                                  | Specifies the tag or range for the changelog. <br> - `string`: (e.g., `'v1.0.0'`) Commits for this specific tag. <br> - `{ from: 'v1', to: 'v2' }`: Commits between `v1` (exclusive) and `v2` (inclusive). <br> - `{ from: 'v1' }`: Commits from `v1` to the latest tag (or `HEAD` if `unreleased`). <br> - `{ to: 'v2' }`: Commits for tag `v2`. <br> - `undefined/null`: Latest release (if `unreleased: false`), or from latest tag to `HEAD` (if `unreleased: true`). |
| `unreleased`    | `boolean`                                          | `false`                                                      | If true, generates changelog for commits up to `HEAD`. The starting point is determined by the `tag` option (or latest tag if `tag.from` is not set). The title will reflect "Unreleased". |
| `save`          | `boolean`                                          | `false`                                                      | If true, saves the generated changelog by prepending it to the specified file.                                                                                           |
| `changelogFile` | `string`                                           | `'CHANGELOG.md'`                                             | File path to save/update the changelog. Used if `save` is true. Relative to `repoPath` if not absolute.                                                                 |
| `commitTypes`   | `Record<string, string>`                           | See [Default Commit Types](#default-commit-types)            | Custom mapping of commit type prefixes (e.g., 'feat', 'fix') to section titles (e.g., 'New Features', 'Bug Fixes'). Merged with defaults, custom values override. Custom-titled sections are sorted alphabetically after standard sections. |
| `githubRepoUrl` | `string \| null`                                   | `null`                                                       | Base URL of the GitHub repository (e.g., "https://github.com/owner/repo") to generate links for commit hashes, tags, and comparisons. If `null`, links are not generated.                    |
| `tagFilter`     | `(tag: string) => boolean`                         | `(tag) => tag && !tag.endsWith('-schema')`                   | A function that receives a tag string and returns `true` if the tag should be included in versioning, `false` otherwise.                                             |
| `commitFilter`  | `(commit: CommitEntry) => boolean`                 | `(_commit) => true`                                          | A function that receives a parsed `CommitEntry` object and returns `true` if the commit should be included in the changelog, `false` otherwise. Executed after parsing but before categorization. |

The `CommitEntry` object passed to `commitFilter` has the following structure:
```typescript
interface CommitEntry {
  hash: string;                 // Short commit hash (7 chars)
  subject: string;              // Original commit subject line (after type/scope/breaking marker)
  message: string;              // Subject line, potentially with JIRA ID appended if not originally present
  scope?: string;               // Parsed scope, if any
  jiraTicket: string | null;    // Extracted JIRA ticket ID (e.g., "PROJ-123")
  issue: string | null;          // Extracted issue number (e.g., "123" from "(#123)")
  type: string;                 // Conventional commit type (e.g., "feat", "fix")
  isExclamationBreaking: boolean; // True if "!" was used for breaking change
  breakingNotes: string[];      // Array of breaking change notes from footers
}
```

## Conventional Commits

This library relies on commit messages following the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/).
A typical commit message looks like:

```
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```
A `!` after the type/scope indicates a breaking change. Alternatively, a footer starting with `BREAKING CHANGE:` (or `BREAKING-CHANGE:`) also indicates a breaking change.
Issue numbers can be included in the description or body, typically as `(#123)`.

Example:
`feat(api)!: add new endpoint for user profiles PROJ-456 (#101)`
`fix: correct calculation error in payment module JIRA-123`
`refactor(core): simplify internal data structures\n\nBREAKING CHANGE: The \`Widget\` class constructor now takes an options object. See issue (#205).`

## Default Commit Types & Section Titles (Angular Preset)

The following commit types are recognized by default and mapped to these section titles in the changelog, ordered as they appear:

| Type       | Default Section Title    |
| ---------- | ------------------------ |
| `feat`     | Features                 |
| `fix`      | Bug Fixes                |
| `perf`     | Performance Improvements |
| `revert`   | Reverts                  |
| `docs`     | Documentation            |
| `style`    | Styles                   |
| `refactor` | Code Refactoring         |
| `test`     | Tests                    |
| `build`    | Build System             |
| `ci`       | CI                       |
| `chore`    | Chores                   |

Breaking changes are grouped under a `### BREAKING CHANGES` section at the top of each release's notes.
You can customize titles or add new types using the `commitTypes` option. Custom-titled sections will be sorted alphabetically after the standard sections listed above.

## Development

To work on this project:

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    yarn install
    # or
    npm install
    ```
3.  Build the TypeScript source:
    ```bash
    yarn build
    # or
    npm run build
    ```
4.  Run tests:
    ```bash
    yarn test
    # or
    npm test
    ```
    Tests will be run on the TypeScript files directly using `ts-jest`.

The tests in `lib/__tests__/` provide comprehensive examples of the library's capabilities and are a good place to understand its behavior.
