import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { getPreviousSemverTags } from '../git-utils';
import { defaultTagFilter, PreviousSemverTagsOptions } from '../config';

describe('Tag Utilities - getPreviousSemverTags', () => {
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

  const createCommitAndTag = (message: string, tagName?: string) => {
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), message + '\n', { flag: 'a' });
    execInTmpDir('git add file.txt');
    execInTmpDir(`git commit --no-verify --allow-empty -m "${message}"`);
    if (tagName) {
      execInTmpDir(`git tag ${tagName}`);
    }
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-semvertagutils-test-'));
    execInTmpDir('git init');
    execInTmpDir('git config commit.gpgsign false');
    execInTmpDir('git config user.name "Test User"');
    execInTmpDir('git config user.email "test@example.com"');
    createCommitAndTag('Initial commit');
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (error) {
        try {
          execSync(`rm -rf "${tmpDir}"`, { stdio: 'ignore' });
        } catch (e) { /* ignore */ }
      }
    }
  });

  test('should return empty array if count is 0 for major', async () => {
    createCommitAndTag('c1', 'v1.0.0');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: { major: 0 } });
    expect(result).toEqual([]);
  });

  test('should return empty array if count is 0 for minor', async () => {
    createCommitAndTag('c1', 'v1.1.0');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: { minor: 0 }, startingTag: 'v1.1.0' });
    expect(result).toEqual([]);
  });

  test('should return empty array if no tags exist', async () => {
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: { major: 1 } });
    expect(result).toEqual([]);
  });

  test('should return empty array if no semver tags exist', async () => {
    createCommitAndTag('c1', 'foo');
    createCommitAndTag('c2', 'bar');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: { major: 1 } });
    expect(result).toEqual([]);
  });

  test('basic case: get 1 previous major', async () => {
    createCommitAndTag('c1', 'v1.0.0');
    createCommitAndTag('c2', 'v2.0.0');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: { major: 1 } });
    expect(result).toEqual(['v1.0.0']);
  });
  
  test('basic case: get 1 previous minor', async () => {
    createCommitAndTag('c1.0', 'v1.0.0');
    createCommitAndTag('c1.1', 'v1.1.0');
    createCommitAndTag('c1.2', 'v1.2.0');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: { minor: 1 }, startingTag: 'v1.2.0' });
    expect(result).toEqual(['v1.1.0']);
  });

  test('get multiple previous majors', async () => {
    createCommitAndTag('c1.0', 'v1.0.0');
    createCommitAndTag('c1.5', 'v1.5.0');
    createCommitAndTag('c2.0', 'v2.0.0');
    createCommitAndTag('c2.1', 'v2.1.0');
    createCommitAndTag('c3', 'v3.0.0');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: { major: 2 } });
    expect(result).toEqual(['v2.1.0', 'v1.5.0']);
  });

  test('get multiple previous minors', async () => {
    createCommitAndTag('c1.0.0', 'v1.0.0');
    createCommitAndTag('c1.1.8', 'v1.1.8');
    createCommitAndTag('c1.2.0', 'v1.2.0');
    createCommitAndTag('c1.2.5', 'v1.2.5');
    createCommitAndTag('c1.3', 'v1.3.0');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: { minor: 2 }, startingTag: 'v1.3.0' });
    expect(result).toEqual(['v1.2.5', 'v1.1.8']);
  });

  test('request more majors than exist', async () => {
    createCommitAndTag('c0', 'v0.1.0');
    createCommitAndTag('c1', 'v1.0.0');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: { major: 5 } });
    expect(result).toEqual(['v0.1.0']);
  });

  test('request more minors than exist', async () => {
    createCommitAndTag('c1.0', 'v1.0.0');
    createCommitAndTag('c1.1', 'v1.1.0');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: { minor: 5 }, startingTag: 'v1.1.0' });
    expect(result).toEqual(['v1.0.0']);
  });

  test('with startingTag specified for major', async () => {
    createCommitAndTag('c1.5', 'v1.5.0');
    createCommitAndTag('c2.1', 'v2.1.0');
    createCommitAndTag('c3', 'v3.0.0');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, startingTag: 'v2.1.0', count: { major: 1 } });
    expect(result).toEqual(['v1.5.0']);
  });
  
  test('with startingTag specified for minor', async () => {
    createCommitAndTag('c2.0.5', 'v2.0.5');
    createCommitAndTag('c2.1', 'v2.1.0');
    createCommitAndTag('c2.2', 'v2.2.0');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, startingTag: 'v2.1.0', count: { minor: 1 } });
    expect(result).toEqual(['v2.0.5']);
  });

  test('startingTag is the only major, count 1 major', async () => {
    createCommitAndTag('c3', 'v3.0.0');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, startingTag: 'v3.0.0', count: { major: 1 } });
    expect(result).toEqual([]);
  });

  test('startingTag has no previous minors, count 1 minor', async () => {
    createCommitAndTag('c3', 'v3.0.0');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, startingTag: 'v3.0.0', count: { minor: 1 } });
    expect(result).toEqual([]);
  });

  test('startingTag does not exist', async () => {
    createCommitAndTag('c1', 'v1.0.0');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, startingTag: 'vNonExistent', count: { major: 1 } });
    expect(result).toEqual([]);
  });
  
  test('startingTag is not a semver tag, should find semver anchor for major search', async () => {
    createCommitAndTag('c1', 'v1.0.0');
    createCommitAndTag('custom', 'my-special-release');
    createCommitAndTag('c2', 'v2.0.0');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, startingTag: 'my-special-release', count: { major: 1 } });
    expect(result).toEqual([]);

    createCommitAndTag('c0.9', 'v0.9.0');
    const result2 = await getPreviousSemverTags({ repoPath: tmpDir, startingTag: 'my-special-release', count: { major: 1 } });
    expect(result2).toEqual(['v0.9.0']);
  });

  test('startingTag is not a semver tag, should find semver anchor for minor search', async () => {
    createCommitAndTag('c1.0', 'v1.0.0');
    createCommitAndTag('c1.1', 'v1.1.0');
    createCommitAndTag('custom-alpha', 'alpha-build');
    createCommitAndTag('c1.2', 'v1.2.0');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, startingTag: 'alpha-build', count: { minor: 1 } });
    expect(result).toEqual(['v1.0.0']);
  });

  test('tagFilter excludes a major version series for major search', async () => {
    createCommitAndTag('c1.5', 'v1.5.0');
    createCommitAndTag('c2.0', 'v2.0.0');
    createCommitAndTag('c2.1', 'v2.1.0');
    createCommitAndTag('c3', 'v3.0.0');
    
    const customTagFilter = (tag: string) => !tag.startsWith('v2.');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: { major: 1 }, tagFilter: customTagFilter });
    expect(result).toEqual(['v1.5.0']);
  });

  test('tagFilter excludes a minor version for minor search', async () => {
    createCommitAndTag('c1.1', 'v1.1.0');
    createCommitAndTag('c1.2', 'v1.2.0');
    createCommitAndTag('c1.3', 'v1.3.0');
    const customTagFilter = (tag: string) => tag !== 'v1.2.0';
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: { minor: 1 }, startingTag: 'v1.3.0', tagFilter: customTagFilter });
    expect(result).toEqual(['v1.1.0']);
  });

  test('tags with v prefix and without for major search', async () => {
    createCommitAndTag('c1', '1.0.0');
    createCommitAndTag('c2', 'v2.0.0');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: { major: 1 } });
    expect(result).toEqual(['1.0.0']);
  });
  
  test('tags with v prefix and without for minor search', async () => {
    createCommitAndTag('c2.1', '2.1.0');
    createCommitAndTag('c2.2', 'v2.2.0');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: { minor: 1 }, startingTag: 'v2.2.0' });
    expect(result).toEqual(['2.1.0']);
  });

  test('pre-release tags are handled, non-prerelease preferred for major search', async () => {
    createCommitAndTag('c1.beta', 'v1.0.0-beta');
    createCommitAndTag('c1', 'v1.0.0');
    createCommitAndTag('c2.rc1', 'v2.0.0-rc1');
    createCommitAndTag('c2.final', 'v2.0.0');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: { major: 1 } });
    expect(result).toEqual(['v1.0.0']);
  });
  
  test('pre-release tags are handled, non-prerelease preferred for minor search', async () => {
    createCommitAndTag('c1.1.beta', 'v1.1.0-beta');
    createCommitAndTag('c1.1', 'v1.1.0');
    createCommitAndTag('c1.2.rc1', 'v1.2.0-rc1');
    createCommitAndTag('c1.2.final', 'v1.2.0');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: { minor: 1 }, startingTag: 'v1.2.0'});
    expect(result).toEqual(['v1.1.0']);
  });
  
  test('startingTag is a pre-release, should anchor to its major/minor components for major search', async () => {
    createCommitAndTag('c1.beta', 'v1.0.0-beta');
    createCommitAndTag('c1', 'v1.0.0');
    createCommitAndTag('c2.rc1', 'v2.0.0-rc1');
    createCommitAndTag('c2.final', 'v2.0.0');

    const result = await getPreviousSemverTags({ repoPath: tmpDir, startingTag: 'v2.0.0-rc1', count: { major: 1 } });
    expect(result).toEqual(['v1.0.0']);
  });

  test('startingTag is a pre-release, should anchor to its major/minor components for minor search', async () => {
    createCommitAndTag('c1.1beta', 'v1.1.0-beta');
    createCommitAndTag('c1.1', 'v1.1.0');
    createCommitAndTag('c1.2rc1', 'v1.2.0-rc1');
    createCommitAndTag('c1.2final', 'v1.2.0');

    const result = await getPreviousSemverTags({ repoPath: tmpDir, startingTag: 'v1.2.0-rc1', count: { minor: 1 } });
    expect(result).toEqual(['v1.1.0']);
  });

  test('all tags are pre-releases for different majors', async () => {
    createCommitAndTag('c1b', 'v1.0.0-beta');
    createCommitAndTag('c2a', 'v2.0.0-alpha');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: { major: 1 } });
    expect(result).toEqual(['v1.0.0-beta']);
  });

  test('all tags are pre-releases for different minors in same major', async () => {
    createCommitAndTag('c1.1b', 'v1.1.0-beta');
    createCommitAndTag('c1.2a', 'v1.2.0-alpha');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: { minor: 1 }, startingTag: 'v1.2.0-alpha' });
    expect(result).toEqual(['v1.1.0-beta']);
  });
  
  test('startingTag is filtered out by tagFilter', async () => {
    createCommitAndTag('c09', 'v0.9.0');
    createCommitAndTag('c1s', 'v1.0.0-schema');
    createCommitAndTag('c2', 'v2.0.0');

    const resultMajor = await getPreviousSemverTags({
      repoPath: tmpDir,
      startingTag: 'v1.0.0-schema',
      count: { major: 1 },
      tagFilter: defaultTagFilter 
    });
    expect(resultMajor).toEqual([]);
    
    const resultMinor = await getPreviousSemverTags({
      repoPath: tmpDir,
      startingTag: 'v1.0.0-schema',
      count: { minor: 1 },
      tagFilter: defaultTagFilter
    });
    expect(resultMinor).toEqual([]);
  });
  
  test('no semver tags when startingTag is non-semver and no other semver tags', async () => {
    createCommitAndTag('foo', 'foo-release');
    createCommitAndTag('bar', 'bar-release');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, startingTag: 'foo-release', count: { major: 1 } });
    expect(result).toEqual([]);
  });

  test('latest tag is non-semver, should find previous semver major', async () => {
    createCommitAndTag('c0.9', 'v0.9.0');
    createCommitAndTag('c1', 'v1.0.0');
    createCommitAndTag('latest', 'latest-build');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: {major: 1} });
    expect(result).toEqual(['v0.9.0']);
  });

  test('latest tag is non-semver, should find previous semver minor', async () => {
    createCommitAndTag('c1.0', 'v1.0.0');
    createCommitAndTag('c1.1', 'v1.1.0');
    createCommitAndTag('latest', 'latest-build');
    const result = await getPreviousSemverTags({ repoPath: tmpDir, count: {minor: 1} });
    expect(result).toEqual(['v1.0.0']);
  });
});
