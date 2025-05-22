import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { getPreviousMajorVersionTags } from '../git_utils';
import { defaultTagFilter, PreviousMajorVersionTagsOptions } from '../config';

describe('Tag Utilities - getPreviousMajorVersionTags', () => {
  let tmpDir: string;

  const execInTmpDir = (command: string): string => {
    try {
      const options: ExecSyncOptionsWithStringEncoding = { encoding: 'utf8', cwd: tmpDir, stdio: 'pipe' };
      const output = execSync(command, options);
      return output ? output.trim() : '';
    } catch (error: any) {
      throw error;
    }
  };

  const createTag = (tagName: string) => {
    execInTmpDir(`git tag ${tagName}`);
  };
  
  const createCommit = (message: string) => {
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), message, { flag: 'a' });
    execInTmpDir('git add file.txt');
    execInTmpDir(`git commit -m "${message}"`);
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-tagutils-test-'));
    execInTmpDir('git init');
    execInTmpDir('git config commit.gpgsign false');
    execInTmpDir('git config user.name "Test User"');
    execInTmpDir('git config user.email "test@example.com"');
    createCommit('Initial commit');
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (error) {
        // Fallback for older Node versions
        try {
          execSync(`rm -rf "${tmpDir}"`, { stdio: 'ignore' });
        } catch (e) {
          // If cleanup fails, it's not critical for tests
        }
      }
    }
  });

  test('should return empty array if count is 0', async () => {
    createTag('v1.0.0');
    const result = await getPreviousMajorVersionTags({ repoPath: tmpDir, count: 0 });
    expect(result).toEqual([]);
  });

  test('should return empty array if no tags exist', async () => {
    const result = await getPreviousMajorVersionTags({ repoPath: tmpDir, count: 1 });
    expect(result).toEqual([]);
  });

  test('should return empty array if no semver tags exist', async () => {
    createTag('foo');
    createTag('bar');
    const result = await getPreviousMajorVersionTags({ repoPath: tmpDir, count: 1 });
    expect(result).toEqual([]);
  });

  test('basic case: get 1 previous major', async () => {
    createTag('v2.0.0'); createCommit('c2');
    createTag('v1.0.0'); createCommit('c1');
    const result = await getPreviousMajorVersionTags({ repoPath: tmpDir, count: 1 });
    expect(result).toEqual(['v1.0.0']);
  });

  test('get multiple previous majors', async () => {
    createTag('v3.0.0'); createCommit('c3');
    createTag('v2.1.0'); createCommit('c2.1');
    createTag('v2.0.0'); createCommit('c2.0');
    createTag('v1.5.0'); createCommit('c1.5');
    createTag('v1.0.0'); createCommit('c1.0');
    const result = await getPreviousMajorVersionTags({ repoPath: tmpDir, count: 2 });
    expect(result).toEqual(['v2.1.0', 'v1.5.0']);
  });

  test('request more majors than exist', async () => {
    createTag('v1.0.0'); createCommit('c1');
    createTag('v0.1.0'); createCommit('c0');
    const result = await getPreviousMajorVersionTags({ repoPath: tmpDir, count: 5 });
    expect(result).toEqual(['v0.1.0']);
  });

  test('with startingTag specified', async () => {
    createTag('v3.0.0'); createCommit('c3');
    createTag('v2.1.0'); createCommit('c2.1');
    createTag('v1.5.0'); createCommit('c1.5');
    const result = await getPreviousMajorVersionTags({ repoPath: tmpDir, startingTag: 'v2.1.0', count: 1 });
    expect(result).toEqual(['v1.5.0']);
  });

  test('startingTag is the only major, count 1', async () => {
    createTag('v3.0.0'); createCommit('c3');
    const result = await getPreviousMajorVersionTags({ repoPath: tmpDir, startingTag: 'v3.0.0', count: 1 });
    expect(result).toEqual([]);
  });

  test('startingTag does not exist', async () => {
    createTag('v1.0.0');
    const result = await getPreviousMajorVersionTags({ repoPath: tmpDir, startingTag: 'vNonExistent', count: 1 });
    expect(result).toEqual([]);
  });
  
  test('startingTag is not a semver tag, should find semver anchor', async () => {
    createTag('v2.0.0'); createCommit('c2');
    createTag('v1.0.0'); createCommit('c1');
    
    // Create a non-semver tag that will be in the filtered list
    createTag('release-custom'); createCommit('custom');

    // Test with the custom tag as starting point
    const result = await getPreviousMajorVersionTags({ repoPath: tmpDir, startingTag: 'release-custom', count: 1 });
    
    // Since release-custom is not semver, function should find first semver tag at/after its position
    // The result depends on git's sorting, but there should be some result if semver tags exist
    const allTags = execInTmpDir('git tag --list --sort=-version:refname').split('\n').filter(t => t.trim());
    const customTagIndex = allTags.indexOf('release-custom');
    
    // Find first semver tag at or after the custom tag
    let expectedAnchorMajor: number | null = null;
    for (let i = customTagIndex; i < allTags.length; i++) {
      const semverMatch = allTags[i].match(/^(?:v)?(\d+)\.\d+\.\d+/);
      if (semverMatch) {
        expectedAnchorMajor = parseInt(semverMatch[1], 10);
        break;
      }
    }
    
    if (expectedAnchorMajor !== null && expectedAnchorMajor > 1) {
      expect(result).toEqual(['v1.0.0']);
    } else {
      expect(result).toEqual([]);
    }
  });

  test('tagFilter excludes a major version series', async () => {
    createTag('v3.0.0'); createCommit('c3');
    createTag('v2.1.0'); createCommit('c2.1');
    createTag('v2.0.0'); createCommit('c2.0');
    createTag('v1.5.0'); createCommit('c1.5');
    
    const customTagFilter = (tag: string) => !tag.startsWith('v2.');
    const result = await getPreviousMajorVersionTags({ repoPath: tmpDir, count: 1, tagFilter: customTagFilter });
    expect(result).toEqual(['v1.5.0']);
  });

  test('tags with v prefix and without', async () => {
    createTag('v2.0.0'); createCommit('c2');
    createTag('1.0.0'); createCommit('c1');
    const result = await getPreviousMajorVersionTags({ repoPath: tmpDir, count: 1 });
    expect(result).toEqual(['1.0.0']);
  });

  test('pre-release tags are handled, non-prerelease preferred', async () => {
    createTag('v2.0.0'); createCommit('c2.final');
    createTag('v2.0.0-rc1'); createCommit('c2.rc1');
    createTag('v1.0.0'); createCommit('c1');
    const result = await getPreviousMajorVersionTags({ repoPath: tmpDir, count: 1 });
    expect(result).toEqual(['v1.0.0']);
  });
  
  test('startingTag is a pre-release, should anchor to its major', async () => {
    createTag('v2.0.0'); createCommit('c2.final');
    createTag('v2.0.0-rc1'); createCommit('c2.rc1');
    createTag('v1.0.0'); createCommit('c1');
    createTag('v1.0.0-beta'); createCommit('c1.beta');

    const result = await getPreviousMajorVersionTags({ repoPath: tmpDir, startingTag: 'v2.0.0-rc1', count: 1 });
    expect(result).toEqual(['v1.0.0']);
  });

  test('all tags are pre-releases for different majors', async () => {
    createTag('v2.0.0-alpha'); createCommit('c2a');
    createTag('v1.0.0-beta'); createCommit('c1b');
    const result = await getPreviousMajorVersionTags({ repoPath: tmpDir, count: 1 });
    expect(result).toEqual(['v1.0.0-beta']);
  });
  
  test('startingTag is filtered out by tagFilter', async () => {
    createTag('v2.0.0'); createCommit('c2');
    createTag('v1.0.0-schema'); createCommit('c1s');
    createTag('v0.9.0'); createCommit('c09');

    const result = await getPreviousMajorVersionTags({
      repoPath: tmpDir,
      startingTag: 'v1.0.0-schema',
      count: 1,
      tagFilter: defaultTagFilter
    });
    expect(result).toEqual([]);
  });
  
  test('no semver tags when startingTag is non-semver', async () => {
    createTag('foo-release'); createCommit('foo');
    createTag('bar-release'); createCommit('bar');
    const result = await getPreviousMajorVersionTags({ repoPath: tmpDir, startingTag: 'foo-release', count: 1 });
    expect(result).toEqual([]);
  });
});
