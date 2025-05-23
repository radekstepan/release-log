"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatChangelog = formatChangelog;
const git_utils_1 = require("./git-utils");
function getFormattedDate() {
    const d = new Date();
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function getHeaderLevel(currentTag, previousTag, isUnreleased) {
    if (isUnreleased)
        return '##';
    if (!currentTag)
        return '##'; // Generic "Changelog" title for no tags
    const currentSemVer = (0, git_utils_1.parseSemVer)(currentTag);
    if (!currentSemVer) { // If current tag is not a valid SemVer (e.g., "my-custom-tag")
        return '##'; // Default to H2 for non-semver tags
    }
    // If the current tag is a pre-release, always use H2
    if (currentSemVer.preRelease) {
        return '##';
    }
    // If it's the first release (no previous tag to compare against), use H1
    if (!previousTag) {
        return '#';
    }
    const previousSemVer = (0, git_utils_1.parseSemVer)(previousTag);
    if (!previousSemVer) { // If previous tag is not a valid SemVer
        // Cannot reliably determine major/minor/patch, default to H2
        return '##';
    }
    // Standard major or minor release (non-prerelease) gets H1
    if (currentSemVer.major > previousSemVer.major ||
        (currentSemVer.major === previousSemVer.major && currentSemVer.minor > previousSemVer.minor)) {
        return '#';
    }
    // Patch release (non-prerelease) or other cases default to H2
    return '##';
}
function formatChangelog(categories, currentTagForDisplay, previousTagForCompare, config) {
    const date = getFormattedDate();
    let changelog = '';
    const baseUrl = config.githubRepoUrl ? (config.githubRepoUrl.endsWith('/') ? config.githubRepoUrl : config.githubRepoUrl + '/') : null;
    let displayVersion = currentTagForDisplay ? currentTagForDisplay.replace(/^v/, '') : null;
    const originalCurrentTag = currentTagForDisplay;
    const originalPreviousTag = previousTagForCompare;
    let headerDisplayPart;
    const headerLevel = getHeaderLevel(originalCurrentTag, originalPreviousTag, config.unreleased);
    if (config.unreleased) {
        headerDisplayPart = 'Unreleased';
        if (baseUrl && originalPreviousTag) {
            headerDisplayPart = `[Unreleased](${baseUrl}compare/${originalPreviousTag}...HEAD)`;
        }
    }
    else if (displayVersion) { // Tagged release
        headerDisplayPart = displayVersion;
        if (baseUrl) {
            if (originalPreviousTag) {
                headerDisplayPart = `[${displayVersion}](${baseUrl}compare/${originalPreviousTag}...${originalCurrentTag})`;
            }
            else {
                headerDisplayPart = `[${displayVersion}](${baseUrl}tree/${originalCurrentTag})`;
            }
        }
    }
    else { // All commits, no tags
        headerDisplayPart = 'Changelog';
    }
    changelog += `${headerLevel} ${headerDisplayPart} (${date})\n\n`; // Header + 1 blank line (total 2 newlines before first section)
    const allCommits = Object.values(categories).flat();
    const breakingCommits = allCommits.filter(c => c.isExclamationBreaking || c.breakingNotes.length > 0);
    if (breakingCommits.length > 0) {
        changelog += `### BREAKING CHANGES\n\n`; // Section title + 1 blank line
        breakingCommits.forEach(entry => {
            const scopeText = entry.scope ? `**${entry.scope}:** ` : '';
            const commitLink = baseUrl ? `([${entry.hash}](${baseUrl}commit/${entry.hash}))` : `(${entry.hash})`;
            changelog += `* ${scopeText}${entry.subject} ${commitLink}\n`;
            if (entry.breakingNotes.length > 0) {
                entry.breakingNotes.forEach(noteBlock => {
                    const noteLines = noteBlock.trim().split('\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 0);
                    noteLines.forEach(line => {
                        changelog += `  * ${line}\n`;
                    });
                });
            }
        });
        changelog += '\n'; // 1 blank line after section items (total 2 newlines before next section or end)
    }
    Object.keys(categories)
        .sort((aTitle, bTitle) => aTitle.localeCompare(bTitle)) // Sort alphabetically
        .forEach(categoryTitle => {
        if (categories[categoryTitle].length > 0) {
            changelog += `### ${categoryTitle}\n\n`; // Section title + 1 blank line
            categories[categoryTitle].forEach(entry => {
                const scopeText = entry.scope ? `**${entry.scope}:** ` : '';
                const commitLink = baseUrl ? `([${entry.hash}](${baseUrl}commit/${entry.hash}))` : `(${entry.hash})`;
                changelog += `* ${scopeText}${entry.message} ${commitLink}\n`;
            });
            changelog += '\n'; // 1 blank line after section items (total 2 newlines before next section or end)
        }
    });
    // Consolidate multiple newlines at the end to ensure exactly two newlines if there's body content,
    // or one newline if only header.
    const headerPlusInitialNewlines = `${headerLevel} ${headerDisplayPart} (${date})\n`;
    let bodyPart = changelog.substring(headerPlusInitialNewlines.length);
    bodyPart = bodyPart.replace(/\n\n+/g, '\n\n').trimEnd(); // Replace 3+ newlines with 2, then trim any trailing
    if (bodyPart.length > 0) {
        return headerPlusInitialNewlines + '\n' + bodyPart + '\n\n';
    }
    else {
        // No body content, just the header.
        return headerPlusInitialNewlines;
    }
}
