const { execSync } = require('child_process');

function git(command, cwd) {
  try {
    return execSync(command, { encoding: 'utf8', cwd }).trim();
  } catch (error) {
    const errorMessage = `Git command failed in ${cwd}: ${command}\n` +
                         `Exit status: ${error.status || 'N/A'}\n` +
                         `Stdout: ${(error.stdout || '').toString().trim() || 'N/A'}\n` +
                         `Stderr: ${(error.stderr || '').toString().trim() || 'N/A'}`;
    throw new Error(errorMessage);
  }
}

function getTags(config) {
  try {
    const rawTags = git('git tag --list --sort=-version:refname', config.repoPath);
    if (!rawTags) return [];
    return rawTags.split('\n').filter(tag => tag && !tag.endsWith('-schema'));
  } catch (error) {
    if (error.message.includes("not a git repository") ||
        error.message.includes("does not have any commits yet") ||
        error.message.includes("ambiguous argument 'HEAD'") ||
        error.message.includes("No names found, nothing to show") ||
        error.message.includes("no tag found")
       ) {
      return [];
    }
    throw error;
  }
}

function getLatestTag(config) {
  const tags = getTags(config);
  return tags.length > 0 ? tags[0] : null;
}

function getPreviousTag(currentTag, config) {
  const tags = getTags(config);
  const currentIndex = tags.indexOf(currentTag);
  if (currentIndex !== -1 && currentIndex < tags.length - 1) {
    return tags[currentIndex + 1];
  }
  return null;
}

function getCommitRange(config) {
  // console.log(`[getCommitRange] Initial config: from=${config.fromTag}, to=${config.toTag}, unreleased=${config.unreleased}`);
  if (config.unreleased) {
    const baseTagForUnreleased = config.fromTag || getLatestTag(config);
    return baseTagForUnreleased ? `${baseTagForUnreleased}..HEAD` : 'HEAD';
  }

  if (config.fromTag && config.toTag) {
    return `${config.fromTag}..${config.toTag}`;
  }

  let effectiveToTag = config.toTag;
  let effectiveFromTag = config.fromTag;

  if (!effectiveToTag) {
    effectiveToTag = getLatestTag(config);
    if (effectiveToTag && !effectiveFromTag) {
      effectiveFromTag = getPreviousTag(effectiveToTag, config);
    }
  } else {
    if (!effectiveFromTag) {
      effectiveFromTag = getPreviousTag(effectiveToTag, config);
    }
  }

  // console.log(`[getCommitRange] After auto-detection: effectiveFromTag=${effectiveFromTag}, effectiveToTag=${effectiveToTag}`);

  if (effectiveToTag) {
    if (effectiveFromTag) {
      return `${effectiveFromTag}..${effectiveToTag}`;
    } else {
      return effectiveToTag;
    }
  } else {
    return 'HEAD';
  }
}

module.exports = {
  git,
  getTags,
  getLatestTag,
  getPreviousTag,
  getCommitRange,
};
