import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { generateChangelog, CommitEntry } from '../index';
import { extractIssueNumber } from '../commit-parser'; 

// Store original Date before mocking
const ACTUAL_SYSTEM_DATE = global.Date;

describe('Commit Parser Utilities', () => {
  describe('extractIssueNumber', () => {
    it('should extract issue number if present in subject', () => {
      expect(extractIssueNumber('feat: new feature (#123)')).toBe('123');
    });
    it('should extract issue number from commit body', () => {
      expect(extractIssueNumber('feat: new feature\n\nCloses (#456)')).toBe('456');
    });
    it('should extract issue number when Jira ID is also present', () => {
      expect(extractIssueNumber('feat: new feature PROJ-123 (#123)')).toBe('123');
      expect(extractIssueNumber('feat: new feature (#123) PROJ-123')).toBe('123');
    });
    it('should return null if no issue number is present', () => {
      expect(extractIssueNumber('feat: new feature')).toBeNull();
    });
    it('should handle multiple parentheses correctly, extracting the issue pattern', () => {
      expect(extractIssueNumber('feat: (new) feature (#789)')).toBe('789');
    });
    it('should only extract the first issue number if multiple are present', () => {
      expect(extractIssueNumber('feat: new feature (#123) and (#456)')).toBe('123');
    });
    it('should return null if pattern is similar but not exact (e.g. no #)', () => {
      expect(extractIssueNumber('feat: new feature (123)')).toBeNull();
    });
    it('should return null if pattern is similar but not exact (e.g. no parens)', () => {
      expect(extractIssueNumber('feat: new feature #123')).toBeNull();
    });
    it('should return null for empty message', () => {
      expect(extractIssueNumber('')).toBeNull();
    });
  });
});

describe('Changelog Generation - Commit Filtering and JIRA Interaction', () => {
  let tmpDir: string;
  const GITHUB_REPO_URL = 'https://github.com/test-org/test-repo';
  const MOCK_DATE_STR = '2023-10-29';
  const DATE_REGEX_ESCAPED = MOCK_DATE_STR.replace(/-/g, '\\-');
  const COMMIT_LINK_REGEX = `\\(\\[([a-f0-9]{7})\\]\\(${GITHUB_REPO_URL}/commit/\\1\\)\\)`;

  beforeEach(() => {
    jest.spyOn(global, 'Date').mockImplementation((...args: any[]) => {
      if (args.length > 0) {
        // @ts-ignore
        return new ACTUAL_SYSTEM_DATE(...args);
      }
      return new ACTUAL_SYSTEM_DATE(`${MOCK_DATE_STR}T12:00:00.000Z`);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });


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

    createCommit('chore: Initial commit for filter test', '# Test Repository'); //0
    execInTmpDir('git tag v1.0.0_filter_base');

    createCommit('feat(email): Add email templates PROJ-A1 [WIP]', 'Email templates WIP'); //1
    createCommit('fix: A normal fix PROJ-A2', 'Normal fix content'); //2
    createCommit('chore: A chore to be filtered PROJ-A3', 'Chore content'); //3
    execInTmpDir('git tag v1.1.0_filter_target');
    
    createCommit('feat: Important feature JDTA-1', 'first commit JDTA-1', 'jira_a1.js'); //4
    createCommit('chore: Setup for JDTA-1', 'chore commit for JDTA-1', 'jira_a2.js'); //5
    createCommit('fix: Bugfix for JDTA-1', 'fix commit for JDTA-1', 'jira_a3.js'); //6
    createCommit('feat: Another feature unrelated OTHER-100', 'unrelated'); //7
    execInTmpDir('git tag v1.2.0_jira_target');

    execInTmpDir('git tag v1.3.0_issue_base'); 
    createCommit('feat: Feature with issue (#101) PROJ-C1', 'content for issue 101'); //8
    createCommit('fix: Fix without issue PROJ-C2', 'content for no issue'); //9
    createCommit('feat: Feature with different issue (#202) PROJ-C3', 'content for issue 202'); //10
    createCommit('chore: Chore with issue (#101) PROJ-C4', 'chore for issue 101'); //11
    createCommit('docs: Docs update with issue in body\n\nThis relates to (#303)', 'docs for issue 303'); //12
    execInTmpDir('git tag v1.4.0_issue_target'); 
  });

  test('filters out commits based on type using commitFilter', async () => {
    const commitFilter = (commit: CommitEntry) => commit.type !== 'chore';
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      tag: { from: 'v1.0.0_filter_base', to: 'v1.1.0_filter_target' },
      commitFilter,
      githubRepoUrl: GITHUB_REPO_URL,
    });

    expect(changelog).not.toContain('A chore to be filtered PROJ-A3');
    expect(changelog).toContain('Add email templates PROJ-A1 [WIP]');
    expect(changelog).not.toContain('### Chores');
  });

  test('filters out commits based on subject content using commitFilter', async () => {
    const commitFilter = (commit: CommitEntry) => !commit.subject.includes('[WIP]');
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      tag: { from: 'v1.0.0_filter_base', to: 'v1.1.0_filter_target' },
      commitFilter,
      githubRepoUrl: GITHUB_REPO_URL,
    });
    expect(changelog).not.toContain('Add email templates PROJ-A1 [WIP]');
    expect(changelog).toContain('A normal fix PROJ-A2');
  });

  test('default commitFilter includes all conventional commits', async () => {
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      tag: { from: 'v1.0.0_filter_base', to: 'v1.1.0_filter_target' },
      githubRepoUrl: GITHUB_REPO_URL,
    });
    expect(changelog).toContain('Add email templates PROJ-A1 [WIP]');
    expect(changelog).toContain('A normal fix PROJ-A2');
    expect(changelog).toContain('A chore to be filtered PROJ-A3');
  });

  test('commitFilter interacts correctly with JIRA deduplication', async () => {
    const commitFilter = (commit: CommitEntry) => {
      if (commit.jiraTicket === 'JDTA-1') {
        return commit.type === 'fix';
      }
      return true;
    };

    const changelog = await generateChangelog({
      repoPath: tmpDir,
      tag: { from: 'v1.1.0_filter_target', to: 'v1.2.0_jira_target' },
      commitFilter,
      githubRepoUrl: GITHUB_REPO_URL,
    });
    
    expect(changelog).not.toContain('Important feature JDTA-1');
    expect(changelog).not.toContain('Setup for JDTA-1');      
    expect(changelog).toContain('Bugfix for JDTA-1'); 
    expect(changelog).toContain('Another feature unrelated OTHER-100'); 
  });

   test('JIRA deduplication: if first commit for a JIRA ID is filtered, subsequent non-filtered one is kept', async () => {
      const commitFilter = (commit: CommitEntry) => {
          if (commit.jiraTicket === 'JDTA-1' && (commit.type === 'feat' || commit.type === 'chore')) {
              return false; 
          }
          return true;
      };

      const changelog = await generateChangelog({
          repoPath: tmpDir,
          tag: { from: 'v1.1.0_filter_target', to: 'v1.2.0_jira_target' },
          commitFilter,
          githubRepoUrl: GITHUB_REPO_URL,
      });

      expect(changelog).not.toContain('Important feature JDTA-1');
      expect(changelog).not.toContain('Setup for JDTA-1');
      expect(changelog).toContain('Bugfix for JDTA-1');
  });

  test('filters commits based on specific issue number using commitFilter', async () => {
    const commitFilter = (commit: CommitEntry) => commit.issue === '101';
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      tag: { from: 'v1.3.0_issue_base', to: 'v1.4.0_issue_target' },
      commitFilter,
      githubRepoUrl: GITHUB_REPO_URL,
    });

    expect(changelog).toContain('Feature with issue (#101) PROJ-C1');
    expect(changelog).toContain('Chore with issue (#101) PROJ-C4');
    expect(changelog).not.toContain('Fix without issue PROJ-C2');
    expect(changelog).not.toContain('Feature with different issue (#202) PROJ-C3');
    expect(changelog).not.toContain('Docs update with issue in body');
  });

  test('filters commits based on issue number present in body using commitFilter', async () => {
    const commitFilter = (commit: CommitEntry) => commit.issue === '303';
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      tag: { from: 'v1.3.0_issue_base', to: 'v1.4.0_issue_target' },
      commitFilter,
      githubRepoUrl: GITHUB_REPO_URL,
    });
    expect(changelog).toContain('Docs update with issue in body');
    expect(changelog).not.toContain('Feature with issue (#101) PROJ-C1');
  });

  test('commitFilter using non-existent issue number results in no matching commits from range', async () => {
    const commitFilter = (commit: CommitEntry) => commit.issue === '999';
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      tag: { from: 'v1.3.0_issue_base', to: 'v1.4.0_issue_target' },
      commitFilter,
      githubRepoUrl: GITHUB_REPO_URL,
    });

    expect(changelog).not.toContain('Feature with issue (#101) PROJ-C1');
    expect(changelog).not.toContain('Fix without issue PROJ-C2');
    expect(changelog).not.toContain('Feature with different issue (#202) PROJ-C3');
    expect(changelog).not.toContain('Chore with issue (#101) PROJ-C4');
    expect(changelog).not.toContain('Docs update with issue in body');
    
    // Check that the changelog is essentially empty of commits from this range
    // v1.4.0_issue_target is a patch from v1.3.0_issue_base -> ## header
    // Formatter returns Header + \n for empty body.
    const expectedHeader = `## [1.4.0_issue_target](${GITHUB_REPO_URL}/compare/v1.3.0_issue_base...v1.4.0_issue_target) (${MOCK_DATE_STR})\n`;
    expect(changelog).toBe(expectedHeader);
  });

  test('commitFilter allows commits that have no issue number (issue is null)', async () => {
    const commitFilter = (commit: CommitEntry) => commit.issue === null;
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      tag: { from: 'v1.3.0_issue_base', to: 'v1.4.0_issue_target' },
      commitFilter,
      githubRepoUrl: GITHUB_REPO_URL,
    });
    expect(changelog).toContain('Fix without issue PROJ-C2');
    expect(changelog).not.toContain('Feature with issue (#101) PROJ-C1');
    expect(changelog).not.toContain('Feature with different issue (#202) PROJ-C3');
    expect(changelog).not.toContain('Chore with issue (#101) PROJ-C4');
    expect(changelog).not.toContain('Docs update with issue in body');
  });
});
