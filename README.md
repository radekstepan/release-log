# Programmatic Changelog Generator

A library to programmatically generate changelogs from git history and conventional commits.
This tool helps automate the process of creating and maintaining `CHANGELOG.md` files by parsing commit messages that follow the [Conventional Commits specification](https://www.conventionalcommits.org/).

## Features

*   **Conventional Commits Parsing:** Understands standard conventional commit types (feat, fix, chore, etc.).
*   **Tag-Based Changelogs:**
    *   Generate changelog for a specific tag range (e.g., `v1.0.0..v1.1.0`).
    *   Generate changelog for a single release (e.g., all commits up to `v1.0.0`).
    *   Generate changelog for the latest release by default.
*   **Unreleased Changes:** Generate a section for "Unreleased" changes since the last tag or a specific tag.
*   **Customizable Commit Types:** Define custom commit types or override default section titles (e.g., map `feat` to "✨ New Features").
*   **JIRA Integration:**
    *   Automatically extracts JIRA ticket IDs (e.g., `PROJ-123`) from commit messages.
    *   Appends JIRA ID to commit messages in the changelog if not already present.
    *   Deduplicates entries based on JIRA ticket ID, keeping the message from the oldest commit for that ticket.
*   **GitHub Integration:** Generates links to commits if a `githubRepoUrl` is provided.
*   **File Operations:**
    *   Optionally save the generated changelog to a file.
    *   Prepends new content to the existing changelog file.
*   **Robust Handling:**
    *   Ignores "schema" tags (e.g., `v1.0.0-schema`) when determining release versions.
    *   Gracefully handles repositories with no tags, no commits, or no conventional commits within a range.
*   **Flexible Configuration:** Highly configurable to suit various project needs.

## Installation

Using npm:
```bash
npm install programmatic-changelog-generator
```

Using yarn:
```bash
yarn add programmatic-changelog-generator
```

## Usage

### Basic Example

```javascript
const { generateChangelog } = require('programmatic-changelog-generator');

async function createChangelog() {
  try {
    // Generate changelog for the latest release (commits between the last two tags)
    const changelogContent = await generateChangelog({
      repoPath: '/path/to/your/git/repository', // Defaults to process.cwd()
      githubRepoUrl: 'https://github.com/your-org/your-repo' // For commit links
    });
    console.log(changelogContent);
  } catch (error) {
    console.error('Failed to generate changelog:', error);
  }
}

createChangelog();
```

### Advanced Example: Unreleased Changes and Saving to File

```javascript
const { generateChangelog } = require('programmatic-changelog-generator');

async function updateMyChangelog() {
  try {
    const changelogContent = await generateChangelog({
      repoPath: process.cwd(),
      unreleased: true, // Generate for unreleased changes since the latest tag
      // fromTag: 'v1.2.0', // Optionally specify a base tag for unreleased changes
      save: true,
      changelogFile: 'CHANGELOG.md', // File to save to (relative to repoPath)
      githubRepoUrl: 'https://github.com/your-org/your-repo',
      commitTypes: {
        feat: '🚀 New Features & Enhancements',
        fix: '🐛 Bug Fixes',
        perf: '⚡ Performance Improvements',
        // other custom types or overrides
      }
    });
    console.log('Changelog updated successfully!');
    // console.log(changelogContent); // Contains the newly generated section
  } catch (error) {
    console.error('Failed to update changelog:', error);
  }
}

updateMyChangelog();
```

## Configuration Options (API)

The `generateChangelog` function accepts an options object with the following properties:

| Option          | Type                       | Default                        | Description                                                                                                                                                              |
| --------------- | -------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `repoPath`      | `string`                   | `process.cwd()`                | Path to the git repository.                                                                                                                                              |
| `fromTag`       | `string \| null`           | `null`                         | The git tag to start the changelog from (exclusive). If `unreleased` is true, this is the tag to compare HEAD against. If `null` & `unreleased`, uses the latest tag.      |
| `toTag`         | `string \| null`           | `null`                         | The git tag to end the changelog at (inclusive). Ignored if `unreleased` is true. If `null` & not `unreleased`, uses the latest tag.                                      |
| `unreleased`    | `boolean`                  | `false`                        | If true, generates changelog for commits since `fromTag` (or latest tag if `fromTag` is `null`) up to HEAD. The title will be "# Unreleased".                         |
| `save`          | `boolean`                  | `false`                        | If true, saves the generated changelog by prepending it to the specified file.                                                                                           |
| `changelogFile` | `string`                   | `'CHANGELOG.md'`               | File path to save/update the changelog. Used if `save` is true. Relative to `repoPath` if not absolute.                                                                 |
| `commitTypes`   | `Record<string, string>`   | See [Default Commit Types](#default-commit-types) | Custom mapping of commit type prefixes (e.g., 'feat', 'fix') to section titles (e.g., 'Features', 'Bug Fixes'). Merged with defaults, custom values override. |
| `githubRepoUrl` | `string \| null`           | `null`                         | Base URL of the GitHub repository (e.g., "https://github.com/owner/repo") to generate links for commit hashes. If `null`, links are not generated.                    |

## Conventional Commits

This library relies on commit messages following the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/).
A typical commit message looks like:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Example:
`feat(api): add new endpoint for user profiles PROJ-456`
`fix: correct calculation error in payment module JIRA-123`

## Default Commit Types

The following commit types are recognized by default and mapped to these section titles in the changelog:

| Type       | Default Section Title    |
| ---------- | ------------------------ |
| `feat`     | Features                 |
| `fix`      | Bug Fixes                |
| `docs`     | Documentation            |
| `style`    | Styles                   |
| `refactor` | Code Refactoring         |
| `perf`     | Performance Improvements |
| `test`     | Tests                    |
| `build`    | Build System             |
| `ci`       | CI                       |
| `chore`    | Chores                   |
| `revert`   | Reverts                  |

You can customize these titles or add new types using the `commitTypes` option. Custom types will be sorted alphabetically after the default types.

## Development

To work on this project:

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    yarn install
    # or
    npm install
    ```
3.  Run tests:
    ```bash
    yarn test
    # or
    npm test
    ```

The tests in `lib/__tests__/changelog.test.js` provide comprehensive examples of the library's capabilities and are a good place to understand its behavior.
