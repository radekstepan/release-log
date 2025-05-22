import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { generateChangelog, CommitEntry } from '../../index';

describe('Changelog Generation - Commit Filtering and JIRA Interaction', () => {
  let tmpDir: string;
  const GITHUB_REPO_URL = 'https://github.com/test-org/test-repo';
  const DATE_REGEX = `\\(\\d{4}-\\d{2}-\\d{2}\\)`;
  const COMMIT_LINK_REGEX = `\\(\\[([a-f0-9]{7})\\]\\(${GITHUB_REPO_URL}/commit/\\1\\)\\)`;

  const execInTmpDir = (command: string, silent = false): string => {
    try {
      const options: ExecSyncOptionsWithStringEncoding = { encoding: 'utf8', cwd: tmpDir, stdio: 'pipe' };
      const output = execSync(command, options);
      return output ? output.trim() : '';
    } catch (error: any) {
      throw error;
    }
  };

  const createCommit = (message: string, content?: string, fileName: string = 'README.md') => {
    const filePath = path.join(tmpDir, fileName);
    const dirPath = path.dirname(filePath);

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    let fileToAdd = fileName;
    if (fileName.endsWith('/')) {
        if (!fs.existsSync(filePath)) fs.mkdirSync(filePath, {recursive: true});
        const dummyFileName = 'file.txt';
        const dummyFilePath = path.join(filePath, dummyFileName);
        fs.writeFileSync(dummyFilePath, content || 'dummy content for dir');
        fileToAdd = path.join(fileName, dummyFileName);
    } else {
        if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '');
        fs.appendFileSync(filePath, `\n${content || message}`);
        fileToAdd = fileName;
    }
    execInTmpDir(`git add "${fileToAdd}"`);
    const parts = message.split('\n\n');
    const subject = parts[0].replace(/"/g, '\\"');
    let commitCmd = `git commit --no-verify --allow-empty -m "${subject}"`;
    if (parts.length > 1) {
        const body = parts.slice(1).join('\n\n').replace(/"/g, '\\"');
        commitCmd += ` -m "${body}"`;
    }
    execInTmpDir(commitCmd, true);
  };

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-commitfilter-test-'));
    execInTmpDir('git init');
    execInTmpDir('git config commit.gpgsign false');
    try { execInTmpDir('git checkout -b main', true); } catch (e) { /* Branch main likely exists */ }
    execInTmpDir('git config user.name "Test User"');
    execInTmpDir('git config user.email "test@example.com"');

    // Setup specific for these tests
    createCommit('chore: Initial commit for filter test', '# Test Repository'); //0
    execInTmpDir('git tag v1.0.0_filter_base');

    createCommit('feat(email): Add email templates PROJ-A1 [WIP]', 'Email templates WIP'); //1
    createCommit('fix: A normal fix PROJ-A2', 'Normal fix content'); //2
    createCommit('chore: A chore to be filtered PROJ-A3', 'Chore content'); //3
    execInTmpDir('git tag v1.1.0_filter_target');
    
    // Commits for JIRA interaction tests
    createCommit('feat: Important feature JDTA-1', 'first commit JDTA-1', 'jira_a1.js'); //4
    createCommit('chore: Setup for JDTA-1', 'chore commit for JDTA-1', 'jira_a2.js'); //5
    createCommit('fix: Bugfix for JDTA-1', 'fix commit for JDTA-1', 'jira_a3.js'); //6
    createCommit('feat: Another feature unrelated OTHER-100', 'unrelated'); //7
    execInTmpDir('git tag v1.2.0_jira_target');
  });

  test('filters out commits based on type using commitFilter', async () => {
    const commitFilter = (commit: CommitEntry) => commit.type !== 'chore';
    // Range v1.0.0_filter_base to v1.1.0_filter_target includes commit 3 (chore)
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      fromTag: 'v1.0.0_filter_base',
      toTag: 'v1.1.0_filter_target',
      commitFilter,
      githubRepoUrl: GITHUB_REPO_URL,
    });

    expect(changelog).not.toContain('A chore to be filtered PROJ-A3');
    expect(changelog).toContain('Add email templates PROJ-A1 [WIP]');
    expect(changelog).not.toContain('### Chores');
  });

  test('filters out commits based on subject content using commitFilter', async () => {
    const commitFilter = (commit: CommitEntry) => !commit.subject.includes('[WIP]');
     // Range v1.0.0_filter_base to v1.1.0_filter_target includes commit 1 ([WIP])
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      fromTag: 'v1.0.0_filter_base',
      toTag: 'v1.1.0_filter_target',
      commitFilter,
      githubRepoUrl: GITHUB_REPO_URL,
    });
    expect(changelog).not.toContain('Add email templates PROJ-A1 [WIP]');
    expect(changelog).toContain('A normal fix PROJ-A2');
  });

  test('default commitFilter includes all conventional commits', async () => {
     // Range v1.0.0_filter_base to v1.1.0_filter_target (commits 1, 2, 3)
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      fromTag: 'v1.0.0_filter_base',
      toTag: 'v1.1.0_filter_target',
      githubRepoUrl: GITHUB_REPO_URL,
    });
    expect(changelog).toContain('Add email templates PROJ-A1 [WIP]');
    expect(changelog).toContain('A normal fix PROJ-A2');
    expect(changelog).toContain('A chore to be filtered PROJ-A3');
  });

  test('commitFilter interacts correctly with JIRA deduplication', async () => {
    // Commits for JDTA-1 in range v1.1.0_filter_target to v1.2.0_jira_target:
    // 4: feat: Important feature JDTA-1
    // 5: chore: Setup for JDTA-1
    // 6: fix: Bugfix for JDTA-1
    // Filter should keep only the 'fix' for JDTA-1.
    const commitFilter = (commit: CommitEntry) => {
      if (commit.jiraTicket === 'JDTA-1') {
        return commit.type === 'fix';
      }
      return true;
    };

    const changelog = await generateChangelog({
      repoPath: tmpDir,
      fromTag: 'v1.1.0_filter_target',
      toTag: 'v1.2.0_jira_target',
      commitFilter,
      githubRepoUrl: GITHUB_REPO_URL,
    });
    
    expect(changelog).not.toContain('Important feature JDTA-1');
    expect(changelog).not.toContain('Setup for JDTA-1');      
    expect(changelog).toContain('Bugfix for JDTA-1'); // This is the oldest that passes filter
    expect(changelog).toContain('Another feature unrelated OTHER-100'); // Should still be present
  });

   test('JIRA deduplication: if first commit for a JIRA ID is filtered, subsequent non-filtered one is kept', async () => {
      // Commits for JDTA-1 in range v1.1.0_filter_target to v1.2.0_jira_target:
      // 4: feat: Important feature JDTA-1
      // 5: chore: Setup for JDTA-1
      // 6: fix: Bugfix for JDTA-1
      // Filter out 'feat' (4) and 'chore' (5) for JDTA-1. 'fix' (6) should be kept.
      const commitFilter = (commit: CommitEntry) => {
          if (commit.jiraTicket === 'JDTA-1' && (commit.type === 'feat' || commit.type === 'chore')) {
              return false; 
          }
          return true;
      };

      const changelog = await generateChangelog({
          repoPath: tmpDir,
          fromTag: 'v1.1.0_filter_target',
          toTag: 'v1.2.0_jira_target',
          commitFilter,
          githubRepoUrl: GITHUB_REPO_URL,
      });

      expect(changelog).not.toContain('Important feature JDTA-1');
      expect(changelog).not.toContain('Setup for JDTA-1');
      expect(changelog).toContain('Bugfix for JDTA-1');
  });
});
