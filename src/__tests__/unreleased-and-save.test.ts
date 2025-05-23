import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { generateChangelog } from '../index';

// Store original Date before mocking
const ACTUAL_SYSTEM_DATE = global.Date;

describe('Changelog Generation - Unreleased and Save Functionality', () => {
  let tmpDir: string;
  const GITHUB_REPO_URL = 'https://github.com/test-org/test-repo';
  const MOCK_DATE_STR = '2023-10-31';
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-unreleased-save-test-'));
    execInTmpDir('git init');
    execInTmpDir('git config commit.gpgsign false');
    try { execInTmpDir('git checkout -b main', true); } catch (e) { /* Branch main likely exists */ }
    execInTmpDir('git config user.name "Test User"');
    execInTmpDir('git config user.email "test@example.com"');

    createCommit('chore: Initial commit', '# Test Repository'); //0
    execInTmpDir('git tag v0.1.0'); 

    createCommit('fix: Fix login redirect PROJ-125', 'Login fix', 'auth.js'); 
    execInTmpDir('git tag v0.2.0'); 

    createCommit('feat: Add password reset feature PROJ-127', 'Password reset', 'reset.js'); 
    execInTmpDir('git tag v0.3.0'); 
    
    createCommit('feat(api)!: Introduce new API version BC-BANG-001', 'api_v2.js'); 
    execInTmpDir('git tag v0.3.1'); 

    createCommit('feat: Important feature JDTA-1', 'first commit JDTA-1', 'jira_a1.js');
    createCommit('fix: Fix critical security issue PROJ-131', 'security.js');
    createCommit('feat: Add new dashboard PROJ-132', 'New dashboard', 'dashboard.js');
    
    execInTmpDir('git tag v0.4.0-beta'); 
    createCommit('feat: Beta feature CF-001', 'beta_cf.js');
    execInTmpDir('git tag v0.4.0-rc'); 
    createCommit('fix: RC fix CF-002', 'rc_fix_cf.js');
    execInTmpDir('git tag v0.4.0-release'); 
    createCommit('feat: Another feature CF-003', 'another_cf.js');
    execInTmpDir('git tag v0.5.0-experimental'); 
  });

  test('formats unreleased header with compare link (since latest filtered tag)', async () => {
    const currentHeadBeforeUnreleasedTest = execInTmpDir('git rev-parse HEAD');
    createCommit('feat: Truly unreleased feature UNRL-001 for angular test', 'unreleased_angular.js');
    
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      unreleased: true, 
      githubRepoUrl: GITHUB_REPO_URL, 
    });

    expect(changelog).toMatch(new RegExp(`^## \\[Unreleased\\]\\(${GITHUB_REPO_URL}/compare/v0\\.5\\.0-experimental\\.\\.\\.HEAD\\) \\(${DATE_REGEX_ESCAPED}\\)\n\n\n`));
    expect(changelog).toContain('### Features\n\n');
    expect(changelog).toMatch(new RegExp(`\\* Truly unreleased feature UNRL-001 for angular test ${COMMIT_LINK_REGEX}\n`));
    expect(changelog.endsWith('\n\n')).toBe(true);

    execInTmpDir(`git reset --hard ${currentHeadBeforeUnreleasedTest}`, true);
  });

  test('generates changelog for unreleased changes from a specific tag (v0.3.1..HEAD)', async () => {
    const currentHeadBeforeUnreleasedTest = execInTmpDir('git rev-parse HEAD');
    createCommit('feat: Another unreleased from v0.3.1 SPECIFIC-UNRL-002', 'specific_unreleased_final.js');

    const changelog = await generateChangelog({
      repoPath: tmpDir,
      tag: { from: 'v0.3.1' }, 
      unreleased: true,
      githubRepoUrl: GITHUB_REPO_URL,
    });
    expect(changelog).toMatch(new RegExp(`^## \\[Unreleased\\]\\(${GITHUB_REPO_URL}/compare/v0\\.3\\.1\\.\\.\\.HEAD\\) \\(${DATE_REGEX_ESCAPED}\\)\n\n\n`));
    
    expect(changelog).toContain('### Features\n\n');
    expect(changelog).toMatch(new RegExp(`\\* Important feature JDTA-1 ${COMMIT_LINK_REGEX}\n`));
    expect(changelog).toMatch(new RegExp(`\\* Add new dashboard PROJ-132 ${COMMIT_LINK_REGEX}\n`));
    expect(changelog).toMatch(new RegExp(`\\* Beta feature CF-001 ${COMMIT_LINK_REGEX}\n`));
    expect(changelog).toMatch(new RegExp(`\\* Another feature CF-003 ${COMMIT_LINK_REGEX}\n`));
    expect(changelog).toMatch(new RegExp(`\\* Another unreleased from v0.3.1 SPECIFIC-UNRL-002 ${COMMIT_LINK_REGEX}\n`));
    
    expect(changelog).toContain('### Bug Fixes\n\n');
    expect(changelog).toMatch(new RegExp(`\\* Fix critical security issue PROJ-131 ${COMMIT_LINK_REGEX}\n`));
    expect(changelog).toMatch(new RegExp(`\\* RC fix CF-002 ${COMMIT_LINK_REGEX}\n`));
    expect(changelog.endsWith('\n\n')).toBe(true);
    
    execInTmpDir(`git reset --hard ${currentHeadBeforeUnreleasedTest}`, true); 
  });

  test('saves changelog to file and prepends correctly', async () => {
    const changelogFileName = 'MY_CHANGELOG.md';
    const changelogFilePath = path.join(tmpDir, changelogFileName);
    if (fs.existsSync(changelogFilePath)) fs.unlinkSync(changelogFilePath);

    const headBeforeSave = execInTmpDir('git rev-parse HEAD');
    createCommit('feat: unreleased for save test SAVE-001', 'save_test.js');

    await generateChangelog({
      repoPath: tmpDir,
      unreleased: true, 
      save: true,
      changelogFile: changelogFileName,
      githubRepoUrl: GITHUB_REPO_URL,
    });

    expect(fs.existsSync(changelogFilePath)).toBe(true);
    let fileContent = fs.readFileSync(changelogFilePath, 'utf8');
    expect(fileContent).toMatch(new RegExp(`^## \\[Unreleased\\]\\(${GITHUB_REPO_URL}/compare/v0\\.5\\.0-experimental\\.\\.\\.HEAD\\) \\(${DATE_REGEX_ESCAPED}\\)\n\n\n`));
    expect(fileContent).toContain('unreleased for save test SAVE-001');
    expect(fileContent.endsWith('\n\n')).toBe(true); 

    await generateChangelog({
      repoPath: tmpDir,
      tag: { from: 'v0.2.0', to: 'v0.3.0'},
      save: true,
      changelogFile: changelogFileName,
      githubRepoUrl: GITHUB_REPO_URL,
    });
    
    fileContent = fs.readFileSync(changelogFilePath, 'utf8');
    const expectedV030Header = `# [0.3.0](${GITHUB_REPO_URL}/compare/v0.2.0...v0.3.0) (${MOCK_DATE_STR})\n\n\n`;
    const expectedUnreleasedHeader = `## [Unreleased](${GITHUB_REPO_URL}/compare/v0.5.0-experimental...HEAD) (${MOCK_DATE_STR})\n\n\n`;
    
    expect(fileContent.startsWith(expectedV030Header)).toBe(true);
    expect(fileContent).toContain('Add password reset feature PROJ-127');
    expect(fileContent).toContain(expectedUnreleasedHeader);
    expect(fileContent).toContain('unreleased for save test SAVE-001');
    expect(fileContent.indexOf(expectedV030Header)).toBeLessThan(fileContent.indexOf(expectedUnreleasedHeader));
    expect(fileContent.endsWith('\n\n')).toBe(true); 

    execInTmpDir(`git reset --hard ${headBeforeSave}`, true); 
  });
});
