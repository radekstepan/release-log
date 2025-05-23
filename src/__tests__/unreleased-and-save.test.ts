import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { generateChangelog } from '../index';

describe('Changelog Generation - Unreleased and Save Functionality', () => {
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-unreleased-save-test-'));
    execInTmpDir('git init');
    execInTmpDir('git config commit.gpgsign false');
    try { execInTmpDir('git checkout -b main', true); } catch (e) { /* Branch main likely exists */ }
    execInTmpDir('git config user.name "Test User"');
    execInTmpDir('git config user.email "test@example.com"');

    // Full commit history setup from the original test file
    createCommit('chore: Initial commit', '# Test Repository'); //0
    execInTmpDir('git tag v0.1.0'); // Tagging early for some tests

    createCommit('fix: Fix login redirect PROJ-125', 'Login fix', 'auth.js'); // for v0.2.0
    execInTmpDir('git tag v0.2.0');

    createCommit('feat: Add password reset feature PROJ-127', 'Password reset', 'reset.js'); // for v0.3.0
    execInTmpDir('git tag v0.3.0');
    
    createCommit('feat(api)!: Introduce new API version BC-BANG-001', 'api_v2.js'); // for v0.3.1
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
    execInTmpDir('git tag v0.5.0-experimental'); // This will be the latest tag for unreleased tests
  });

  test('formats unreleased header with compare link (since latest filtered tag)', async () => {
    const currentHeadBeforeUnreleasedTest = execInTmpDir('git rev-parse HEAD');
    createCommit('feat: Truly unreleased feature UNRL-001 for angular test', 'unreleased_angular.js');
    
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      unreleased: true, // tag will default to { from: <latest_tag> }
      githubRepoUrl: GITHUB_REPO_URL, 
    });

    // Default tag filter will use v0.5.0-experimental as the latest tag
    expect(changelog).toMatch(new RegExp(`^## \\[Unreleased\\]\\(${GITHUB_REPO_URL}/compare/v0\\.5\\.0-experimental\\.\\.\\.HEAD\\) ${DATE_REGEX}`));
    expect(changelog).toContain('### Features\n\n');
    expect(changelog).toMatch(new RegExp(`\\* Truly unreleased feature UNRL-001 for angular test ${COMMIT_LINK_REGEX}`));

    execInTmpDir(`git reset --hard ${currentHeadBeforeUnreleasedTest}`, true);
  });

  test('generates changelog for unreleased changes from a specific tag (v0.3.1..HEAD)', async () => {
    const currentHeadBeforeUnreleasedTest = execInTmpDir('git rev-parse HEAD');
    // Commits after v0.3.1 are: JDTA-1, PROJ-131, PROJ-132, CF-001, CF-002, CF-003
    // Then this new one:
    createCommit('feat: Another unreleased from v0.3.1 SPECIFIC-UNRL-002', 'specific_unreleased_final.js');

    const changelog = await generateChangelog({
      repoPath: tmpDir,
      tag: { from: 'v0.3.1' }, 
      unreleased: true,
      githubRepoUrl: GITHUB_REPO_URL,
    });
    expect(changelog).toMatch(new RegExp(`^## \\[Unreleased\\]\\(${GITHUB_REPO_URL}/compare/v0\\.3\\.1\\.\\.\\.HEAD\\) ${DATE_REGEX}`));
    
    expect(changelog).toContain('### Features\n\n');
    expect(changelog).toMatch(new RegExp(`\\* Important feature JDTA-1 ${COMMIT_LINK_REGEX}`));
    expect(changelog).toMatch(new RegExp(`\\* Add new dashboard PROJ-132 ${COMMIT_LINK_REGEX}`));
    expect(changelog).toMatch(new RegExp(`\\* Beta feature CF-001 ${COMMIT_LINK_REGEX}`));
    expect(changelog).toMatch(new RegExp(`\\* Another feature CF-003 ${COMMIT_LINK_REGEX}`));
    expect(changelog).toMatch(new RegExp(`\\* Another unreleased from v0.3.1 SPECIFIC-UNRL-002 ${COMMIT_LINK_REGEX}`));
    
    expect(changelog).toContain('### Bug Fixes\n\n');
    expect(changelog).toMatch(new RegExp(`\\* Fix critical security issue PROJ-131 ${COMMIT_LINK_REGEX}`));
    expect(changelog).toMatch(new RegExp(`\\* RC fix CF-002 ${COMMIT_LINK_REGEX}`));
    
    execInTmpDir(`git reset --hard ${currentHeadBeforeUnreleasedTest}`, true); 
  });

  test('saves changelog to file and prepends correctly', async () => {
    const changelogFileName = 'MY_CHANGELOG.md';
    const changelogFilePath = path.join(tmpDir, changelogFileName);
    if (fs.existsSync(changelogFilePath)) fs.unlinkSync(changelogFilePath);

    const headBeforeSave = execInTmpDir('git rev-parse HEAD');
    // This commit will be part of the "Unreleased" section based on v0.5.0-experimental
    createCommit('feat: unreleased for save test SAVE-001', 'save_test.js');

    await generateChangelog({
      repoPath: tmpDir,
      unreleased: true, // tag: undefined (defaults to latest tag as 'from' for unreleased)
      save: true,
      changelogFile: changelogFileName,
      githubRepoUrl: GITHUB_REPO_URL,
    });

    expect(fs.existsSync(changelogFilePath)).toBe(true);
    let fileContent = fs.readFileSync(changelogFilePath, 'utf8');
    expect(fileContent).toMatch(new RegExp(`^## \\[Unreleased\\]\\(${GITHUB_REPO_URL}/compare/v0\\.5\\.0-experimental\\.\\.\\.HEAD\\) ${DATE_REGEX}`));
    expect(fileContent).toContain('unreleased for save test SAVE-001');

    // Now generate for a specific tag range (v0.2.0 to v0.3.0)
    // Commits for v0.3.0 (since v0.2.0) is "feat: Add password reset feature PROJ-127"
    await generateChangelog({
      repoPath: tmpDir,
      tag: { from: 'v0.2.0', to: 'v0.3.0'},
      save: true,
      changelogFile: changelogFileName,
      githubRepoUrl: GITHUB_REPO_URL,
    });
    
    fileContent = fs.readFileSync(changelogFilePath, 'utf8');
    // The v0.3.0 section should be at the top
    expect(fileContent).toMatch(new RegExp(`^## \\[v0\\.3\\.0\\]\\(${GITHUB_REPO_URL}/compare/v0\\.2\\.0\\.\\.\\.v0\\.3\\.0\\) ${DATE_REGEX}`));
    expect(fileContent).toContain('Add password reset feature PROJ-127');
    // The previously saved "Unreleased" section should follow
    expect(fileContent).toMatch(new RegExp(`## \\[Unreleased\\]\\(${GITHUB_REPO_URL}/compare/v0\\.5\\.0-experimental\\.\\.\\.HEAD\\) ${DATE_REGEX}`));
    expect(fileContent).toContain('unreleased for save test SAVE-001');
    expect(fileContent.indexOf('## [v0.3.0]')).toBeLessThan(fileContent.indexOf('## [Unreleased]'));

    execInTmpDir(`git reset --hard ${headBeforeSave}`, true); 
  });
});
