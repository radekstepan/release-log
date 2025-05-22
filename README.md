# release-log

A library to programmatically generate changelogs from git history and conventional commits, following the [conventional-changelog-angular](https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-changelog-angular) preset style. This tool helps automate the process of creating and maintaining `CHANGELOG.md` files. Now written in TypeScript with type definitions included!

## Features

*   **Angular Preset Formatting:**
    *   Changelog sections start with `## [vX.Y.Z](compare_url) (YYYY-MM-DD)` or `## [Unreleased](compare_url) (YYYY-MM-DD)`.
    *   `BREAKING CHANGES` are prominently displayed in their own `###` section at the top.
    *   Commit types (Features, Bug Fixes, etc.) are `###` sections.
    *   Commits are listed with asterisks, scopes, and links: `* **scope:** message ([hash](commit_url))`.
*   **Conventional Commits Parsing:** Understands standard conventional commit types (`feat`, `fix`, `perf`, `docs`, etc.) and breaking change indicators (`!` or `BREAKING CHANGE:` footer).
*   **Tag-Based Changelogs:**
    *   Generate changelog for a specific tag range (e.g., `v1.0.0..v1.1.0`).
    *   Generate changelog for a single release (e.g., all commits up to `v1.0.0`).
    *   Generate changelog for the latest release by default.
*   **Unreleased Changes:** Generate a section for "Unreleased" changes since the last tag or a specific tag.
*   **Customizable Commit Types:** Define custom commit types or override default section titles (e.g., map `feat` to "✨ New Features"). These will be sorted after standard Angular sections.
*   **JIRA Integration:**
    *   Automatically extracts JIRA ticket IDs (e.g., `PROJ-123`) from commit messages.
    *   Appends JIRA ID to commit messages in the changelog if not already present.
    *   Deduplicates entries based on JIRA ticket ID, keeping the message from the oldest commit for that ticket.
*   **GitHub Integration:** Generates links to commits, tags, and comparisons if a `githubRepoUrl` is provided.
*   **File Operations:**
    *   Optionally save the generated changelog to a file.
    *   Prepends new content to the existing changelog file.
*   **Robust Handling:**
    *   Flexible tag filtering using a `tagFilter` function (defaults to ignoring tags ending with `-schema`).
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

### Basic Example (JavaScript)

```javascript
const { generateChangelog } = require('release-log'); // Or import if using ESModules

async function createChangelog() {
  try {
    // Generate changelog for the latest release (commits between the last two tags)
    const changelogContent = await generateChangelog({
      repoPath: '/path/to/your/git/repository', // Defaults to process.cwd()
      githubRepoUrl: 'https://github.com/your-org/your-repo' // For commit and comparison links
    });
    console.log(changelogContent);
  } catch (error) {
    console.error('Failed to generate changelog:', error);
  }
}

createChangelog();
```
This might output something like:
```markdown
## [v1.0.1](https://github.com/your-org/your-repo/compare/v1.0.0...v1.0.1) (2023-10-27)

### Bug Fixes

* **auth:** correct redirect loop on invalid token ([a1b2c3d](https://github.com/your-org/your-repo/commit/a1b2c3d))

### Features

* **api:** add endpoint for user preferences ([d4e5f6g](https://github.com/your-org/your-repo/commit/d4e5f6g))
```

### Advanced Example (TypeScript)

```typescript
import { generateChangelog, ChangelogConfig } from 'release-log';

async function updateMyChangelog() {
  try {
    const options: ChangelogConfig = {
      repoPath: process.cwd(),
      unreleased: true, // Generate for unreleased changes since the latest tag
      // fromTag: 'v1.2.0', // Optionally specify a base tag for unreleased changes
      save: true,
      changelogFile: 'CHANGELOG.md', // File to save to (relative to repoPath)
      githubRepoUrl: 'https://github.com/your-org/your-repo',
      commitTypes: {
        feat: '🚀 New Features & Enhancements', // Custom title for 'feat'
        fix: '🐛 Bug Fixes',
        perf: '⚡ Performance Improvements',
        // other custom types or overrides
      },
      tagFilter: (tag: string) => /^v\d+\.\d+\.\d+$/.test(tag) // Only consider tags like v1.0.0, v0.2.1, etc.
    };

    const changelogContent = await generateChangelog(options);
    console.log('Changelog updated successfully!');
    // console.log(changelogContent); // Contains the newly generated section
  } catch (error) {
    console.error('Failed to update changelog:', error);
  }
}

updateMyChangelog();
```
This will generate a section like:
```markdown
## [Unreleased](https://github.com/your-org/your-repo/compare/v1.2.3...HEAD) (2023-10-27)

### BREAKING CHANGES

* **core:** The `process` method now requires a configuration object. ([abcdef0](https://github.com/your-org/your-repo/commit/abcdef0))
  * Old method signature `process(data)` is removed.
  * See migration guide for details.

### 🚀 New Features & Enhancements

* **ui:** implement dark mode toggle ([1234567](https://github.com/your-org/your-repo/commit/1234567))

### 🐛 Bug Fixes

* **validation:** allow empty strings for optional fields ([fedcba9](https://github.com/your-org/your-repo/commit/fedcba9))
```

## Configuration Options (API)

The `generateChangelog` function accepts an options object (`ChangelogConfig`) with the following properties:

| Option          | Type                               | Default                                                      | Description                                                                                                                                                              |
| --------------- | ---------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `repoPath`      | `string`                           | `process.cwd()`                                              | Path to the git repository.                                                                                                                                              |
| `fromTag`       | `string \| null`                   | `null`                                                       | The git tag to start the changelog from (exclusive). If `unreleased` is true, this is the tag to compare HEAD against. If `null` & `unreleased`, uses the latest tag.      |
| `toTag`         | `string \| null`                   | `null`                                                       | The git tag to end the changelog at (inclusive). Ignored if `unreleased` is true. If `null` & not `unreleased`, uses the latest tag.                                      |
| `unreleased`    | `boolean`                          | `false`                                                      | If true, generates changelog for commits since `fromTag` (or latest tag if `fromTag` is `null`) up to HEAD. The title will reflect unreleased status.                         |
| `save`          | `boolean`                          | `false`                                                      | If true, saves the generated changelog by prepending it to the specified file.                                                                                           |
| `changelogFile` | `string`                           | `'CHANGELOG.md'`                                             | File path to save/update the changelog. Used if `save` is true. Relative to `repoPath` if not absolute.                                                                 |
| `commitTypes`   | `Record<string, string>`           | See [Default Commit Types](#default-commit-types)            | Custom mapping of commit type prefixes (e.g., 'feat', 'fix') to section titles (e.g., 'New Features', 'Bug Fixes'). Merged with defaults, custom values override. Custom-titled sections are sorted alphabetically after standard sections. |
| `githubRepoUrl` | `string \| null`                   | `null`                                                       | Base URL of the GitHub repository (e.g., "https://github.com/owner/repo") to generate links for commit hashes, tags, and comparisons. If `null`, links are not generated.                    |
| `tagFilter`     | `(tag: string) => boolean`         | `(tag) => tag && !tag.endsWith('-schema')`                   | A function that receives a tag string and returns `true` if the tag should be included in versioning, `false` otherwise.                                             |

## Conventional Commits

This library relies on commit messages following the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/).
A typical commit message looks like:

```
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```
A `!` after the type/scope indicates a breaking change. Alternatively, a footer starting with `BREAKING CHANGE:` (or `BREAKING-CHANGE:`) also indicates a breaking change.

Example:
`feat(api)!: add new endpoint for user profiles PROJ-456`
`fix: correct calculation error in payment module JIRA-123`
`refactor(core): simplify internal data structures\n\nBREAKING CHANGE: The `Widget` class constructor now takes an options object.`

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

The tests in `lib/__tests__/changelog.test.ts` provide comprehensive examples of the library's capabilities and are a good place to understand its behavior.
