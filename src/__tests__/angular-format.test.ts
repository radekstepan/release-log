import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { generateChangelog } from '../index';

describe('Changelog Generation - Angular Preset Formatting and Breaking Changes', () => {
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-angular-test-'));
    execInTmpDir('git init');
    execInTmpDir('git config commit.gpgsign false');
    try { execInTmpDir('git checkout -b main', true); } catch (e) { /* Branch main likely exists */ }
    execInTmpDir('git config user.name "Test User"');
    execInTmpDir('git config user.email "test@example.com"');

    createCommit('chore: Initial commit', '# Test Repository'); //0
    createCommit('feat: Add user authentication', 'Auth feature', 'auth.js'); //1
    createCommit('feat(api): Add user endpoints PROJ-123', 'User API', 'api.js'); //2
    createCommit('feat(ui): Implement login form PROJ-124', 'Login UI', 'login.js'); //3
    execInTmpDir('git tag v0.1.0');

    createCommit('fix: Fix login redirect PROJ-125', 'Login fix', 'auth.js'); //4
    createCommit('fix(api): Fix authentication token validation PROJ-126', 'Token fix', 'api.js'); //5
    createCommit('docs: Update README with setup instructions', 'README update', 'README.md'); //6
    execInTmpDir('git tag v0.2.0');

    createCommit('feat: Add password reset feature PROJ-127', 'Password reset', 'reset.js'); //7
    createCommit('feat(email): Add email templates PROJ-128 [WIP]', 'Email templates', 'emails/'); //8
    execInTmpDir('git tag v0.2.1-schema');
    createCommit('fix: Fix URL parsing PROJ-129', 'URL parsing fix', 'router.js'); //9
    createCommit('perf: Optimize database queries PROJ-130', 'DB optimization', 'db.js'); //10
    execInTmpDir('git tag v0.3.0');

    createCommit('feat(api)!: Introduce new API version, old one deprecated BC-BANG-001', 'api_v2.js'); // 11
    createCommit('fix(ui): Adjust layout due to API changes BC-NOTE-001\n\nBREAKING CHANGE: The user profile layout has changed significantly. Users need to update their settings.\nAnother line for the note.', 'ui_bc_note.js'); // 12
    createCommit('perf(db): Optimize another user query PERF-002', 'db_perf2.js'); // 13
    createCommit('revert: Revert "feat: Add password reset feature PROJ-127" RVT-001\n\nThis reverts commit abc123xyz.', 'revert_reset.js'); // 14
    createCommit('feat(module)!: Complete rewrite of module X BC-BOTH-001\n\nBREAKING CHANGE: Module X API is entirely new.\n\nSee migration guide at https://example.com/migrate', 'module_x_rewrite.js'); //15
    execInTmpDir('git tag v0.3.1');

    createCommit('feat: Important feature JDTA-1', 'first commit JDTA-1', 'jira_a1.js'); //16
    createCommit('chore: Setup for JDTA-1', 'chore commit for JDTA-1', 'jira_a2.js'); // 17
    createCommit('fix: Bugfix for JDTA-1', 'second commit JDTA-1, should appear', 'jira_a3.js'); // 18

    createCommit('fix: Fix critical security issue PROJ-131', 'security.js'); //19
    createCommit('fix: Address security vulnerability PROJ-131 (follow-up)', 'Applied security fix, should be ignored by dedupe', 'other.js'); //20
    createCommit('feat: Add new dashboard PROJ-132', 'New dashboard', 'dashboard.js'); //21
    
    execInTmpDir('git tag v0.4.0-beta');
    createCommit('feat: Beta feature (for custom filter test) CF-001', 'beta_cf.js'); //22
    execInTmpDir('git tag v0.4.0-rc');
    createCommit('fix: RC fix (for custom filter test) CF-002', 'rc_fix_cf.js'); //23
    execInTmpDir('git tag v0.4.0-release'); 
    createCommit('feat: Another feature (for custom filter test) CF-003', 'another_cf.js'); //24
    execInTmpDir('git tag v0.5.0-experimental');
  });

  test('formats changelog for specific tag range (v0.2.0..v0.3.0) with Angular preset style', async () => {
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      tag: { from: 'v0.2.0', to: 'v0.3.0' },
      githubRepoUrl: GITHUB_REPO_URL,
    });

    expect(changelog).toMatch(new RegExp(`^## \\[v0\\.3\\.0\\]\\(${GITHUB_REPO_URL}/compare/v0\\.2\\.0\\.\\.\\.v0\\.3\\.0\\) ${DATE_REGEX}`));
    expect(changelog).toContain('### Features\n\n');
    expect(changelog).toMatch(new RegExp(`\\* Add password reset feature PROJ-127 ${COMMIT_LINK_REGEX}`)); // commit 7
    expect(changelog).toMatch(new RegExp(`\\* \\*\\*email:\\*\\* Add email templates PROJ-128 \\[WIP\\] ${COMMIT_LINK_REGEX}`)); // commit 8
    
    expect(changelog).toContain('### Bug Fixes\n\n');
    expect(changelog).toMatch(new RegExp(`\\* Fix URL parsing PROJ-129 ${COMMIT_LINK_REGEX}`)); // commit 9
    
    expect(changelog).toContain('### Performance Improvements\n\n');
    expect(changelog).toMatch(new RegExp(`\\* Optimize database queries PROJ-130 ${COMMIT_LINK_REGEX}`)); // commit 10
    
    expect(changelog).not.toContain('Fix login redirect PROJ-125'); 
    expect(changelog).not.toContain('BC-BANG-001'); 
  });

  test('generates changelog with BREAKING CHANGES, section order, and formatting for v0.3.0..v0.3.1', async () => {
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      tag: { from: 'v0.3.0', to: 'v0.3.1' },
      githubRepoUrl: GITHUB_REPO_URL,
    });
    // Commits for this range are 11, 12, 13, 14, 15
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
      tag: 'v0.1.0',
      githubRepoUrl: GITHUB_REPO_URL,
    });
    // Commits for v0.1.0 are 0, 1, 2, 3
    expect(changelog).toMatch(new RegExp(`^## \\[v0\\.1\\.0\\]\\(${GITHUB_REPO_URL}/tree/v0\\.1\\.0\\) ${DATE_REGEX}`));
    expect(changelog).toContain('### Features\n\n');
    expect(changelog).toMatch(new RegExp(`\\* Add user authentication ${COMMIT_LINK_REGEX}`));
    expect(changelog).toMatch(new RegExp(`\\* \\*\\*api:\\*\\* Add user endpoints PROJ-123 ${COMMIT_LINK_REGEX}`));
    expect(changelog).toMatch(new RegExp(`\\* \\*\\*ui:\\*\\* Implement login form PROJ-124 ${COMMIT_LINK_REGEX}`));
    expect(changelog).toContain('### Chores\n\n');
    expect(changelog).toMatch(new RegExp(`\\* Initial commit ${COMMIT_LINK_REGEX}`));
    expect(changelog).not.toContain('Fix login redirect PROJ-125');
  });
});
