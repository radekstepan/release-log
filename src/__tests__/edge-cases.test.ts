import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { generateChangelog } from '../../index';

describe('Changelog Generation - Edge Cases', () => {
  const GITHUB_REPO_URL = 'https://github.com/test-org/test-repo';
  const DATE_REGEX = `\\(\\d{4}-\\d{2}-\\d{2}\\)`;
  const COMMIT_LINK_REGEX = `\\(\\[([a-f0-9]{7})\\]\\(${GITHUB_REPO_URL}/commit/\\1\\)\\)`;

  const execInDir = (command: string, dir: string): string => {
    try {
      const options: ExecSyncOptionsWithStringEncoding = { encoding: 'utf8', cwd: dir, stdio: 'pipe' };
      const output = execSync(command, options);
      return output ? output.trim() : '';
    } catch (error: any) {
      throw error;
    }
  };
  
  const localCreateCommit = (msg: string, dir: string, fileName: string = 'file.txt') => {
    fs.writeFileSync(path.join(dir, fileName), `${msg}\n`, { flag: 'a' });
    execInDir(`git add ${fileName}`, dir);
    const parts = msg.split('\n\n');
    const subject = parts[0].replace(/"/g, '\\"');
    let commitCmd = `git commit --no-verify -m "${subject}"`;
    if (parts.length > 1) {
        const body = parts.slice(1).join('\n\n').replace(/"/g, '\\"');
        commitCmd += ` -m "${body}"`;
    }
    execInDir(commitCmd, dir);
  };

  test('generates changelog for all commits if no tags exist', async () => {
    const noTagsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-notags-'));
    execInDir('git init', noTagsTmpDir);
    execInDir('git config commit.gpgsign false', noTagsTmpDir);
    try { execInDir('git checkout -b main', noTagsTmpDir); } catch (e) {/* ignore */}
    execInDir('git config user.name "Test User"', noTagsTmpDir);
    execInDir('git config user.email "test@example.com"', noTagsTmpDir);

    localCreateCommit('feat: First feature in no-tag repo AA-100', noTagsTmpDir);
    localCreateCommit('fix: A bug BB-200', noTagsTmpDir);

    const changelog = await generateChangelog({
      repoPath: noTagsTmpDir,
      githubRepoUrl: GITHUB_REPO_URL,
      // tag: undefined (default)
    });
    expect(changelog).toMatch(new RegExp(`^## Changelog ${DATE_REGEX}`));
    expect(changelog).toContain('### Features');
    expect(changelog).toMatch(new RegExp(`\\* First feature in no-tag repo AA-100 ${COMMIT_LINK_REGEX}`));
    expect(changelog).toContain('### Bug Fixes');
    expect(changelog).toMatch(new RegExp(`\\* A bug BB-200 ${COMMIT_LINK_REGEX}`));
  });
  
  test('handles empty repository (no commits)', async () => {
    const emptyTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-empty-'));
    execInDir('git init', emptyTmpDir);
    execInDir('git config commit.gpgsign false', emptyTmpDir);
    try { execInDir('git checkout -b main', emptyTmpDir); } catch (e) {/* ignore */}
    execInDir('git config user.name "Test User"', emptyTmpDir); 
    execInDir('git config user.email "test@example.com"', emptyTmpDir);

    const changelog = await generateChangelog({
      repoPath: emptyTmpDir,
      githubRepoUrl: GITHUB_REPO_URL,
      // tag: undefined (default)
    });
    expect(changelog).toMatch(new RegExp(`^## Changelog ${DATE_REGEX}`));
    const significantLines = changelog.split('\n').filter(line => line.trim().length > 0 && !line.startsWith('## Changelog'));
    expect(significantLines.length).toBe(0); 
  });

  test('handles repository with commits but no conventional commits in range', async () => {
    const nonConvTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-nonconv-'));
      execInDir('git init', nonConvTmpDir);
      execInDir('git config commit.gpgsign false', nonConvTmpDir);
      try { execInDir('git checkout -b main', nonConvTmpDir); } catch (e) {/* ignore */}
      execInDir('git config user.name "Test User"', nonConvTmpDir);
      execInDir('git config user.email "test@example.com"', nonConvTmpDir);

      localCreateCommit('Just a regular commit', nonConvTmpDir);
      localCreateCommit('Another regular commit', nonConvTmpDir);
      execInDir('git tag v1.0.0', nonConvTmpDir);

      const changelog = await generateChangelog({
        repoPath: nonConvTmpDir,
        tag: 'v1.0.0',
        githubRepoUrl: GITHUB_REPO_URL,
      });
      expect(changelog).toMatch(new RegExp(`^## \\[v1\\.0\\.0\\]\\(${GITHUB_REPO_URL}/tree/v1\\.0\\.0\\) ${DATE_REGEX}`));
      expect(changelog).not.toContain('### Features');
      expect(changelog).not.toContain('### Bug Fixes');
      const significantLines = changelog.split('\n').filter(line => line.trim().length > 0 && !line.match(/^## \[[^\]]+\]/));
      expect(significantLines.length).toBe(0);
  });
});
