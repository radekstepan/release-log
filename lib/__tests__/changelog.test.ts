import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { generateChangelog, ChangelogConfig } from '../../index'; 

describe('changelog', () => {
  let tmpDir: string;
  const GITHUB_REPO_URL = 'https://github.com/test-org/test-repo';
  const DATE_REGEX = `\\(\\d{4}-\\d{2}-\\d{2}\\)`; // Matches (YYYY-MM-DD)
  const COMMIT_LINK_REGEX = `\\(\\[([a-f0-9]{7})\\]\\(${GITHUB_REPO_URL}/commit/\\1\\)\\)`; // Matches ([abcdefg](github_url/commit/abcdefg))

  const execInTmpDir = (command: string, silent = false): string => {
    try {
      const options: ExecSyncOptionsWithStringEncoding = { encoding: 'utf8', cwd: tmpDir, stdio: 'pipe' };
      const output = execSync(command, options);
      return output ? output.trim() : '';
    } catch (error: any) {
      // if (!silent && !(error instanceof Error && error.message.toLowerCase().includes('no commits yet'))) {
      //   const stderrMessage = error.stderr ? error.stderr.toString().trim() : 'N/A';
      //   console.error(`Error executing command in tmpDir: ${command}\nStderr: ${stderrMessage}\nStdout: ${error.stdout ? error.stdout.toString().trim() : 'N/A'}`);
      // }
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-lib-test-'));
    
    execInTmpDir('git init');
    execInTmpDir('git config commit.gpgsign false');
    try {
      execInTmpDir('git checkout -b main', true); 
    } catch (e) { /* Branch main likely exists */ }
    execInTmpDir('git config user.name "Test User"');
    execInTmpDir('git config user.email "test@example.com"');
    
    createCommit('chore: Initial commit', '# Test Repository'); 
    createCommit('feat: Add user authentication', 'Auth feature', 'auth.js'); 
    createCommit('feat(api): Add user endpoints PROJ-123', 'User API', 'api.js'); 
    createCommit('feat(ui): Implement login form PROJ-124', 'Login UI', 'login.js'); 
    execInTmpDir('git tag v0.1.0');

    createCommit('fix: Fix login redirect PROJ-125', 'Login fix', 'auth.js'); 
    createCommit('fix(api): Fix authentication token validation PROJ-126', 'Token fix', 'api.js'); 
    createCommit('docs: Update README with setup instructions', 'README update', 'README.md'); 
    execInTmpDir('git tag v0.2.0');

    createCommit('feat: Add password reset feature PROJ-127', 'Password reset', 'reset.js'); 
    createCommit('feat(email): Add email templates PROJ-128', 'Email templates', 'emails/'); 
    execInTmpDir('git tag v0.2.1-schema'); 
    createCommit('fix: Fix URL parsing PROJ-129', 'URL parsing fix', 'router.js'); 
    createCommit('perf: Optimize database queries PROJ-130', 'DB optimization', 'db.js'); 
    execInTmpDir('git tag v0.3.0');

    createCommit('feat(api)!: Introduce new API version, old one deprecated BC-BANG-001', 'api_v2.js'); 
    createCommit('fix(ui): Adjust layout due to API changes BC-NOTE-001\n\nBREAKING CHANGE: The user profile layout has changed significantly. Users need to update their settings.\nAnother line for the note.', 'ui_bc_note.js'); 
    createCommit('perf(db): Optimize another user query PERF-002', 'db_perf2.js'); 
    createCommit('revert: Revert "feat: Add password reset feature PROJ-127" RVT-001\n\nThis reverts commit abc123xyz.', 'revert_reset.js'); 
    createCommit('feat(module)!: Complete rewrite of module X BC-BOTH-001\n\nBREAKING CHANGE: Module X API is entirely new.\n\nSee migration guide at https://example.com/migrate', 'module_x_rewrite.js');
    execInTmpDir('git tag v0.3.1'); 

    createCommit('fix: Fix critical security issue PROJ-131', 'security.js'); 
    createCommit('fix: Address security vulnerability PROJ-131 (follow-up)', 'Applied security fix, should be ignored by dedupe', 'other.js'); 
    createCommit('feat: Add new dashboard PROJ-132', 'New dashboard', 'dashboard.js'); 
    
    execInTmpDir('git tag v0.4.0-beta');
    createCommit('feat: Beta feature (for custom filter test) CF-001', 'beta_cf.js'); 
    execInTmpDir('git tag v0.4.0-rc');
    createCommit('fix: RC fix (for custom filter test) CF-002', 'rc_fix_cf.js'); 
    execInTmpDir('git tag v0.4.0-release'); 
    createCommit('feat: Another feature (for custom filter test) CF-003', 'another_cf.js'); 
    execInTmpDir('git tag v0.5.0-experimental'); 
  });

  afterAll(() => {
    // fs.rmSync(tmpDir, { recursive: true, force: true }); 
    console.log(`Test repository available for inspection at: ${tmpDir}`);
  });

  describe('Angular Preset Formatting and Breaking Changes', () => {
    test('formats changelog for specific tag range (v0.2.0..v0.3.0) with Angular preset style', async () => {
      const changelog = await generateChangelog({
        repoPath: tmpDir,
        fromTag: 'v0.2.0',
        toTag: 'v0.3.0',
        githubRepoUrl: GITHUB_REPO_URL,
      });

      expect(changelog).toMatch(new RegExp(`^## \\[v0\\.3\\.0\\]\\(${GITHUB_REPO_URL}/compare/v0\\.2\\.0\\.\\.\\.v0\\.3\\.0\\) ${DATE_REGEX}`));
      expect(changelog).toContain('### Features\n\n');
      expect(changelog).toMatch(new RegExp(`\\* Add password reset feature PROJ-127 ${COMMIT_LINK_REGEX}`));
      expect(changelog).toMatch(new RegExp(`\\* \\*\\*email:\\*\\* Add email templates PROJ-128 ${COMMIT_LINK_REGEX}`));
      
      expect(changelog).toContain('### Bug Fixes\n\n');
      expect(changelog).toMatch(new RegExp(`\\* Fix URL parsing PROJ-129 ${COMMIT_LINK_REGEX}`));
      
      expect(changelog).toContain('### Performance Improvements\n\n');
      expect(changelog).toMatch(new RegExp(`\\* Optimize database queries PROJ-130 ${COMMIT_LINK_REGEX}`));
      
      expect(changelog).not.toContain('Fix login redirect PROJ-125'); 
      expect(changelog).not.toContain('BC-BANG-001'); 
    });

    test('generates changelog with BREAKING CHANGES, section order, and formatting for v0.3.0..v0.3.1', async () => {
      const changelog = await generateChangelog({
        repoPath: tmpDir,
        fromTag: 'v0.3.0',
        toTag: 'v0.3.1',
        githubRepoUrl: GITHUB_REPO_URL,
      });
      
      expect(changelog).toMatch(new RegExp(`^## \\[v0\\.3\\.1\\]\\(${GITHUB_REPO_URL}/compare/v0\\.3\\.0\\.\\.\\.v0\\.3\\.1\\) ${DATE_REGEX}`));

      expect(changelog).toContain('### BREAKING CHANGES\n\n');
      expect(changelog).toMatch(new RegExp(`\\* \\*\\*api:\\*\\* Introduce new API version, old one deprecated BC-BANG-001 ${COMMIT_LINK_REGEX}`));
      expect(changelog).toMatch(new RegExp(`\\* \\*\\*ui:\\*\\* Adjust layout due to API changes BC-NOTE-001 ${COMMIT_LINK_REGEX}\n` +
                                         `  \\* The user profile layout has changed significantly\\. Users need to update their settings\\.\n` +
                                         `  \\* Another line for the note\\.`, 'm'));
      expect(changelog).toMatch(new RegExp(`\\* \\*\\*module:\\*\\* Complete rewrite of module X BC-BOTH-001 ${COMMIT_LINK_REGEX}\n` +
                                         `  \\* Module X API is entirely new\\.\n` +
                                         `  \\* See migration guide at https://example.com/migrate`, 'm'));

      const featuresIndex = changelog.indexOf('### Features');
      const bugFixesIndex = changelog.indexOf('### Bug Fixes');
      const perfIndex = changelog.indexOf('### Performance Improvements');
      const revertsIndex = changelog.indexOf('### Reverts');
      const breakingChangesIndex = changelog.indexOf('### BREAKING CHANGES');

      expect(breakingChangesIndex).toBeGreaterThan(-1);
      expect(featuresIndex).toBeGreaterThan(breakingChangesIndex);
      expect(bugFixesIndex).toBeGreaterThan(featuresIndex);
      expect(perfIndex).toBeGreaterThan(bugFixesIndex);
      expect(revertsIndex).toBeGreaterThan(perfIndex);

      expect(changelog).toContain('### Features\n\n');
      expect(changelog).toMatch(new RegExp(`\\* \\*\\*api:\\*\\* Introduce new API version, old one deprecated BC-BANG-001 ${COMMIT_LINK_REGEX}`));
      expect(changelog).toMatch(new RegExp(`\\* \\*\\*module:\\*\\* Complete rewrite of module X BC-BOTH-001 ${COMMIT_LINK_REGEX}`));
      
      expect(changelog).toContain('### Bug Fixes\n\n');
      expect(changelog).toMatch(new RegExp(`\\* \\*\\*ui:\\*\\* Adjust layout due to API changes BC-NOTE-001 ${COMMIT_LINK_REGEX}`));

      expect(changelog).toContain('### Performance Improvements\n\n');
      expect(changelog).toMatch(new RegExp(`\\* \\*\\*db:\\*\\* Optimize another user query PERF-002 ${COMMIT_LINK_REGEX}`));

      expect(changelog).toContain('### Reverts\n\n');
      expect(changelog).toMatch(new RegExp(`\\* Revert "feat: Add password reset feature PROJ-127" RVT-001 ${COMMIT_LINK_REGEX}`));
    });

    test('formats release header with tree link for the first tag (v0.1.0)', async () => {
      const changelog = await generateChangelog({
        repoPath: tmpDir,
        toTag: 'v0.1.0',
        githubRepoUrl: GITHUB_REPO_URL,
      });
      expect(changelog).toMatch(new RegExp(`^## \\[v0\\.1\\.0\\]\\(${GITHUB_REPO_URL}/tree/v0\\.1\\.0\\) ${DATE_REGEX}`));
      expect(changelog).toContain('### Features\n\n');
      expect(changelog).toMatch(new RegExp(`\\* Add user authentication ${COMMIT_LINK_REGEX}`));
      expect(changelog).toMatch(new RegExp(`\\* \\*\\*api:\\*\\* Add user endpoints PROJ-123 ${COMMIT_LINK_REGEX}`));
      expect(changelog).toMatch(new RegExp(`\\* \\*\\*ui:\\*\\* Implement login form PROJ-124 ${COMMIT_LINK_REGEX}`));
      expect(changelog).toContain('### Chores\n\n');
      expect(changelog).toMatch(new RegExp(`\\* Initial commit ${COMMIT_LINK_REGEX}`));
      expect(changelog).not.toContain('Fix login redirect PROJ-125');
    });

    test('formats unreleased header with compare link (since latest filtered tag)', async () => {
      const currentHeadBeforeUnreleasedTest = execInTmpDir('git rev-parse HEAD');
      createCommit('feat: Truly unreleased feature UNRL-001 for angular test', 'unreleased_angular.js');
      
      const changelog = await generateChangelog({
        repoPath: tmpDir,
        unreleased: true,
        githubRepoUrl: GITHUB_REPO_URL, 
      });

      expect(changelog).toMatch(new RegExp(`^## \\[Unreleased\\]\\(${GITHUB_REPO_URL}/compare/v0\\.5\\.0-experimental\\.\\.\\.HEAD\\) ${DATE_REGEX}`));
      expect(changelog).toContain('### Features\n\n');
      expect(changelog).toMatch(new RegExp(`\\* Truly unreleased feature UNRL-001 for angular test ${COMMIT_LINK_REGEX}`));

      execInTmpDir(`git reset --hard ${currentHeadBeforeUnreleasedTest}`, true);
    });
  });


  test('generates changelog for unreleased changes from a specific tag (v0.3.1..HEAD)', async () => {
    const currentHeadBeforeUnreleasedTest = execInTmpDir('git rev-parse HEAD');
    createCommit('feat: Another unreleased from v0.3.1 SPECIFIC-UNRL-002', 'specific_unreleased_final.js');

    const changelog = await generateChangelog({
      repoPath: tmpDir,
      fromTag: 'v0.3.1', 
      unreleased: true,
      githubRepoUrl: GITHUB_REPO_URL,
    });
    expect(changelog).toMatch(new RegExp(`^## \\[Unreleased\\]\\(${GITHUB_REPO_URL}/compare/v0\\.3\\.1\\.\\.\\.HEAD\\) ${DATE_REGEX}`));
    
    expect(changelog).toContain('### Features\n\n');
    expect(changelog).toMatch(new RegExp(`\\* Add new dashboard PROJ-132 ${COMMIT_LINK_REGEX}`));
    expect(changelog).toMatch(new RegExp(`\\* Beta feature \\(for custom filter test\\) CF-001 ${COMMIT_LINK_REGEX}`));
    expect(changelog).toMatch(new RegExp(`\\* Another feature \\(for custom filter test\\) CF-003 ${COMMIT_LINK_REGEX}`));
    expect(changelog).toMatch(new RegExp(`\\* Another unreleased from v0.3.1 SPECIFIC-UNRL-002 ${COMMIT_LINK_REGEX}`));
    
    expect(changelog).toContain('### Bug Fixes\n\n');
    expect(changelog).toMatch(new RegExp(`\\* Fix critical security issue PROJ-131 ${COMMIT_LINK_REGEX}`)); 
    expect(changelog).not.toContain('Address security vulnerability PROJ-131 (follow-up)');
    expect(changelog).toMatch(new RegExp(`\\* RC fix \\(for custom filter test\\) CF-002 ${COMMIT_LINK_REGEX}`));

    expect(changelog).not.toContain('Fix login redirect PROJ-125'); 
    expect(changelog).not.toContain('BC-BANG-001'); 
    
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
    expect(fileContent).toMatch(new RegExp(`^## \\[Unreleased\\]\\(${GITHUB_REPO_URL}/compare/v0\\.5\\.0-experimental\\.\\.\\.HEAD\\) ${DATE_REGEX}`));
    expect(fileContent).toContain('unreleased for save test SAVE-001');

    await generateChangelog({
      repoPath: tmpDir,
      fromTag: 'v0.2.0',
      toTag: 'v0.3.0',
      save: true,
      changelogFile: changelogFileName,
      githubRepoUrl: GITHUB_REPO_URL,
    });
    
    fileContent = fs.readFileSync(changelogFilePath, 'utf8');
    expect(fileContent).toMatch(new RegExp(`^## \\[v0\\.3\\.0\\]\\(${GITHUB_REPO_URL}/compare/v0\\.2\\.0\\.\\.\\.v0\\.3\\.0\\) ${DATE_REGEX}`));
    expect(fileContent).toContain('Add password reset feature PROJ-127');
    expect(fileContent).toMatch(new RegExp(`## \\[Unreleased\\]\\(${GITHUB_REPO_URL}/compare/v0\\.5\\.0-experimental\\.\\.\\.HEAD\\) ${DATE_REGEX}`));
    expect(fileContent).toContain('unreleased for save test SAVE-001');
    expect(fileContent.indexOf('## [v0.3.0]')).toBeLessThan(fileContent.indexOf('## [Unreleased]'));

    execInTmpDir(`git reset --hard ${headBeforeSave}`, true); 
  });

  test('ignores schema tags for versioning (implicitly uses default tagFilter)', async () => {
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      githubRepoUrl: GITHUB_REPO_URL,
    });
    expect(changelog).toMatch(new RegExp(`^## \\[v0\\.5\\.0-experimental\\]\\(${GITHUB_REPO_URL}/compare/v0\\.4\\.0-release\\.\\.\\.v0\\.5\\.0-experimental\\) ${DATE_REGEX}`));
    expect(changelog).toContain('### Features');
    expect(changelog).toMatch(new RegExp(`\\* Another feature \\(for custom filter test\\) CF-003 ${COMMIT_LINK_REGEX}`));
    
    expect(changelog).not.toContain('v0.2.1-schema'); 
    expect(changelog).not.toContain('Add password reset feature PROJ-127'); 
  });

  test('uses custom tagFilter function to select specific tags', async () => {
    const customTagFilter = (tag: string): boolean => tag.endsWith('-release') || tag === 'v0.3.1' || tag === 'v0.3.0' || tag === 'v0.2.0';

    const changelog = await generateChangelog({
      repoPath: tmpDir,
      tagFilter: customTagFilter,
      githubRepoUrl: GITHUB_REPO_URL,
    });

    expect(changelog).toMatch(new RegExp(`^## \\[v0\\.4\\.0-release\\]\\(${GITHUB_REPO_URL}/compare/v0\\.3\\.1\\.\\.\\.v0\\.4\\.0-release\\) ${DATE_REGEX}`));
    expect(changelog).toContain('### Features');
    expect(changelog).toMatch(new RegExp(`\\* Add new dashboard PROJ-132 ${COMMIT_LINK_REGEX}`));
    expect(changelog).toMatch(new RegExp(`\\* Beta feature \\(for custom filter test\\) CF-001 ${COMMIT_LINK_REGEX}`));
    
    expect(changelog).toContain('### Bug Fixes');
    expect(changelog).toMatch(new RegExp(`\\* Fix critical security issue PROJ-131 ${COMMIT_LINK_REGEX}`));
    expect(changelog).toMatch(new RegExp(`\\* RC fix \\(for custom filter test\\) CF-002 ${COMMIT_LINK_REGEX}`));

    expect(changelog).not.toContain('v0.5.0-experimental');
    expect(changelog).not.toContain('v0.1.0');

    const headBeforeCustomUnreleased = execInTmpDir('git rev-parse HEAD');
    createCommit('feat: Unreleased for custom filter CUST-UNRL-001', 'cust_unrl.js');

    const unreleasedChangelog = await generateChangelog({
        repoPath: tmpDir,
        unreleased: true,
        tagFilter: customTagFilter,
        githubRepoUrl: GITHUB_REPO_URL,
    });
    expect(unreleasedChangelog).toMatch(new RegExp(`^## \\[Unreleased\\]\\(${GITHUB_REPO_URL}/compare/v0\\.4\\.0-release\\.\\.\\.HEAD\\) ${DATE_REGEX}`));
    expect(unreleasedChangelog).toContain('### Features');
    expect(unreleasedChangelog).toMatch(new RegExp(`\\* Another feature \\(for custom filter test\\) CF-003 ${COMMIT_LINK_REGEX}`));
    expect(unreleasedChangelog).toMatch(new RegExp(`\\* Unreleased for custom filter CUST-UNRL-001 ${COMMIT_LINK_REGEX}`));
    
    execInTmpDir(`git reset --hard ${headBeforeCustomUnreleased}`, true);
  });

  test('generates changelog for all commits if no tags exist', async () => {
    const noTagsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-notags-'));
    try {
      execSync('git init', { cwd: noTagsTmpDir, stdio: 'pipe' } as ExecSyncOptionsWithStringEncoding);
      execSync('git config commit.gpgsign false', { cwd: noTagsTmpDir } as ExecSyncOptionsWithStringEncoding);
      try { execSync('git checkout -b main', { cwd: noTagsTmpDir, stdio: 'pipe' } as ExecSyncOptionsWithStringEncoding); } catch (e) {/* ignore */}
      execSync('git config user.name "Test User"', { cwd: noTagsTmpDir, stdio: 'pipe' } as ExecSyncOptionsWithStringEncoding);
      execSync('git config user.email "test@example.com"', { cwd: noTagsTmpDir, stdio: 'pipe' } as ExecSyncOptionsWithStringEncoding);

      const localCreateCommit = (msg: string, dir: string) => {
        fs.writeFileSync(path.join(dir, 'file.txt'), `${msg}\n`, { flag: 'a' });
        execSync('git add file.txt', { cwd: dir, stdio: 'pipe' } as ExecSyncOptionsWithStringEncoding);
        const parts = msg.split('\n\n');
        const subject = parts[0].replace(/"/g, '\\"');
        let commitCmd = `git commit --no-verify -m "${subject}"`;
        if (parts.length > 1) {
            const body = parts.slice(1).join('\n\n').replace(/"/g, '\\"');
            commitCmd += ` -m "${body}"`;
        }
        execSync(commitCmd, { cwd: dir, stdio: 'pipe' } as ExecSyncOptionsWithStringEncoding);
      };
      localCreateCommit('feat: First feature in no-tag repo AA-100', noTagsTmpDir);
      localCreateCommit('fix: A bug BB-200', noTagsTmpDir);

      const changelog = await generateChangelog({
        repoPath: noTagsTmpDir,
        githubRepoUrl: GITHUB_REPO_URL,
      });
      expect(changelog).toMatch(new RegExp(`^## Changelog ${DATE_REGEX}`));
      expect(changelog).toContain('### Features');
      expect(changelog).toMatch(new RegExp(`\\* First feature in no-tag repo AA-100 ${COMMIT_LINK_REGEX}`));
      expect(changelog).toContain('### Bug Fixes');
      expect(changelog).toMatch(new RegExp(`\\* A bug BB-200 ${COMMIT_LINK_REGEX}`));
    } finally {
      console.log(`No-tags test repository available at: ${noTagsTmpDir}`);
    }
  });
  
  test('handles empty repository (no commits)', async () => {
    const emptyTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-empty-'));
    try {
      execSync('git init', { cwd: emptyTmpDir, stdio: 'pipe' } as ExecSyncOptionsWithStringEncoding);
      execSync('git config commit.gpgsign false', { cwd: emptyTmpDir } as ExecSyncOptionsWithStringEncoding);
      try { execSync('git checkout -b main', { cwd: emptyTmpDir, stdio: 'pipe' } as ExecSyncOptionsWithStringEncoding); } catch (e) {/* ignore */}
      execSync('git config user.name "Test User"', { cwd: emptyTmpDir, stdio: 'pipe' } as ExecSyncOptionsWithStringEncoding); 
      execSync('git config user.email "test@example.com"', { cwd: emptyTmpDir, stdio: 'pipe' } as ExecSyncOptionsWithStringEncoding);

      const changelog = await generateChangelog({
        repoPath: emptyTmpDir,
        githubRepoUrl: GITHUB_REPO_URL,
      });
      expect(changelog).toMatch(new RegExp(`^## Changelog ${DATE_REGEX}`));
      const significantLines = changelog.split('\n').filter(line => line.trim().length > 0 && !line.startsWith('## Changelog'));
      expect(significantLines.length).toBe(0); 
    } finally {
      console.log(`Empty test repository available at: ${emptyTmpDir}`);
    }
  });

  test('handles repository with commits but no conventional commits in range', async () => {
    const nonConvTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-nonconv-'));
    try {
      execSync('git init', { cwd: nonConvTmpDir, stdio: 'pipe' } as ExecSyncOptionsWithStringEncoding);
      execSync('git config commit.gpgsign false', { cwd: nonConvTmpDir } as ExecSyncOptionsWithStringEncoding);
      try { execSync('git checkout -b main', { cwd: nonConvTmpDir, stdio: 'pipe' } as ExecSyncOptionsWithStringEncoding); } catch (e) {/* ignore */}
      execSync('git config user.name "Test User"', { cwd: nonConvTmpDir, stdio: 'pipe' } as ExecSyncOptionsWithStringEncoding);
      execSync('git config user.email "test@example.com"', { cwd: nonConvTmpDir, stdio: 'pipe' } as ExecSyncOptionsWithStringEncoding);

      const localCreateCommit = (msg: string, dir: string) => {
        fs.writeFileSync(path.join(dir, 'file.txt'), `${msg}\n`, { flag: 'a' });
        execSync('git add file.txt', { cwd: dir, stdio: 'pipe' } as ExecSyncOptionsWithStringEncoding);
        const parts = msg.split('\n\n');
        const subject = parts[0].replace(/"/g, '\\"');
        let commitCmd = `git commit --no-verify -m "${subject}"`;
        if (parts.length > 1) {
            const body = parts.slice(1).join('\n\n').replace(/"/g, '\\"');
            commitCmd += ` -m "${body}"`;
        }
        execSync(commitCmd, { cwd: dir, stdio: 'pipe' } as ExecSyncOptionsWithStringEncoding);
      };
      localCreateCommit('Just a regular commit', nonConvTmpDir);
      localCreateCommit('Another regular commit', nonConvTmpDir);
      execSync('git tag v1.0.0', { cwd: nonConvTmpDir, stdio: 'pipe' } as ExecSyncOptionsWithStringEncoding);

      const changelog = await generateChangelog({
        repoPath: nonConvTmpDir,
        toTag: 'v1.0.0',
        githubRepoUrl: GITHUB_REPO_URL,
      });
      expect(changelog).toMatch(new RegExp(`^## \\[v1\\.0\\.0\\]\\(${GITHUB_REPO_URL}/tree/v1\\.0\\.0\\) ${DATE_REGEX}`));
      expect(changelog).not.toContain('### Features');
      expect(changelog).not.toContain('### Bug Fixes');
      const significantLines = changelog.split('\n').filter(line => line.trim().length > 0 && !line.match(/^## \[[^\]]+\]/));
      expect(significantLines.length).toBe(0);
    } finally {
      console.log(`Non-conventional commit test repository available at: ${nonConvTmpDir}`);
    }
  });

  test('uses custom commit types, merging with defaults, and respects Angular preset formatting', async () => {
    const currentHead = execInTmpDir('git rev-parse HEAD');
    const customConfig: ChangelogConfig = {
      repoPath: tmpDir, 
      fromTag: 'v0.5.0-experimental',
      unreleased: true, 
      commitTypes: {
        feat: 'Awesome New Features', 
        improvement: 'Enhancements', 
      },
      githubRepoUrl: GITHUB_REPO_URL,
    };

    createCommit('feat: A super cool new thing! CSTM-001', 'new_thing.js');
    createCommit('improvement: Made something better IMP-001', 'improvement.js');
    createCommit('fix: A normal fix (should use default title) FIX-002', 'fix_normal.js');
    createCommit('chore: A chore for custom types test CSTM-CHR-01', 'chore_file_custom.js');
    
    const changelog = await generateChangelog(customConfig);

    expect(changelog).toMatch(new RegExp(`^## \\[Unreleased\\]\\(${GITHUB_REPO_URL}/compare/v0\\.5\\.0-experimental\\.\\.\\.HEAD\\) ${DATE_REGEX}`));
    
    expect(changelog).toContain('### Awesome New Features\n\n');
    expect(changelog).toMatch(new RegExp(`\\* A super cool new thing! CSTM-001 ${COMMIT_LINK_REGEX}`));
    
    expect(changelog).toContain('### Enhancements\n\n'); 
    expect(changelog).toMatch(new RegExp(`\\* Made something better IMP-001 ${COMMIT_LINK_REGEX}`));
    
    expect(changelog).toContain('### Bug Fixes\n\n'); 
    expect(changelog).toMatch(new RegExp(`\\* A normal fix \\(should use default title\\) FIX-002 ${COMMIT_LINK_REGEX}`));

    expect(changelog).toContain('### Chores\n\n'); 
    expect(changelog).toMatch(new RegExp(`\\* A chore for custom types test CSTM-CHR-01 ${COMMIT_LINK_REGEX}`));

    const fixesIdx = changelog.indexOf('### Bug Fixes');
    const choresIdx = changelog.indexOf('### Chores');
    const awesomeIdx = changelog.indexOf('### Awesome New Features');
    const enhanceIdx = changelog.indexOf('### Enhancements');

    expect(fixesIdx).toBeGreaterThan(-1);
    expect(choresIdx).toBeGreaterThan(-1);
    expect(awesomeIdx).toBeGreaterThan(-1);
    expect(enhanceIdx).toBeGreaterThan(-1);

    expect(fixesIdx).toBeLessThan(choresIdx);
    expect(awesomeIdx).toBeGreaterThan(choresIdx); 
    expect(enhanceIdx).toBeGreaterThan(choresIdx); 
    expect(awesomeIdx).toBeLessThan(enhanceIdx); 

    execInTmpDir(`git reset --hard ${currentHead}`, true);
  });
});
