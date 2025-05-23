import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { generateChangelog } from '../index';

// Store original Date before mocking
const ACTUAL_SYSTEM_DATE = global.Date;

// Helper to escape regex special characters in a string
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

describe('Changelog Generation - Angular Preset Formatting and Breaking Changes', () => {
  let tmpDir: string;
  const GITHUB_REPO_URL = 'https://github.com/test-org/test-repo';
  const MOCK_DATE_STR = '2023-10-27';
  const DATE_REGEX_ESCAPED = MOCK_DATE_STR.replace(/-/g, '\\-'); 
  const COMMIT_LINK_REGEX_CAPTURE = `\\(\\[([a-f0-9]{7})\\]\\(${escapeRegExp(GITHUB_REPO_URL)}/commit/\\1\\)\\)`;
  const COMMIT_LINK_REGEX_ASSERT_EXISTS = `\\(\\[[a-f0-9]{7}\\]\\(${escapeRegExp(GITHUB_REPO_URL)}/commit/[a-f0-9]{7}\\)\\)`;


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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-angular-test-'));
    execInTmpDir('git init');
    execInTmpDir('git config commit.gpgsign false');
    try { execInTmpDir('git checkout -b main', true); } catch (e) { /* Branch main likely exists */ }
    execInTmpDir('git config user.name "Test User"');
    execInTmpDir('git config user.email "test@example.com"');

    createCommit('chore: Initial commit', '# Test Repository'); //0
    createCommit('feat: Add user authentication', 'Auth feature', 'auth.js'); //1
    createCommit('feat(api): Add user endpoints PROJ-123 (#77)', 'User API', 'api.js'); //2
    createCommit('feat(ui): Implement login form PROJ-124', 'Login UI', 'login.js'); //3
    execInTmpDir('git tag v0.1.0'); 

    createCommit('fix: Fix login redirect PROJ-125', 'Login fix', 'auth.js'); //4
    createCommit('fix(api): Fix authentication token validation PROJ-126 (#78)', 'Token fix', 'api.js'); //5
    createCommit('docs: Update README with setup instructions', 'README update', 'README.md'); //6
    execInTmpDir('git tag v0.2.0'); 

    createCommit('feat: Add password reset feature PROJ-127', 'Password reset', 'reset.js'); //7
    createCommit('feat(email): Add email templates PROJ-128 [WIP]', 'Email templates', 'emails/'); //8
    execInTmpDir('git tag v0.2.1-schema'); 
    createCommit('fix: Fix URL parsing PROJ-129 (#79)', 'URL parsing fix', 'router.js'); //9
    createCommit('perf: Optimize database queries PROJ-130', 'DB optimization', 'db.js'); //10
    execInTmpDir('git tag v0.3.0'); 

    // Order of these commits for v0.3.1:
    // 11: feat(api)!: Introduce new API version, old one deprecated BC-BANG-001 (#80)
    // 12: fix(ui): Adjust layout due to API changes BC-NOTE-001\n\nBREAKING CHANGE: The user profile layout has changed...
    // 13: perf(db): Optimize another user query PERF-002
    // 14: revert: Revert "feat: Add password reset feature PROJ-127" RVT-001
    // 15: feat(module)!: Complete rewrite of module X BC-BOTH-001 (#81)\n\nBREAKING CHANGE: Module X API is entirely new...
    createCommit('feat(api)!: Introduce new API version, old one deprecated BC-BANG-001 (#80)', 'api_v2.js'); // 11
    createCommit('fix(ui): Adjust layout due to API changes BC-NOTE-001\n\nBREAKING CHANGE: The user profile layout has changed significantly. Users need to update their settings.\nAnother line for the note.', 'ui_bc_note.js'); // 12
    createCommit('perf(db): Optimize another user query PERF-002', 'db_perf2.js'); // 13
    createCommit('revert: Revert "feat: Add password reset feature PROJ-127" RVT-001\n\nThis reverts commit abc123xyz.', 'revert_reset.js'); // 14
    createCommit('feat(module)!: Complete rewrite of module X BC-BOTH-001 (#81)\n\nBREAKING CHANGE: Module X API is entirely new.\n\nSee migration guide at https://example.com/migrate', 'module_x_rewrite.js'); //15
    execInTmpDir('git tag v0.3.1'); 

    createCommit('feat: Important feature JDTA-1', 'first commit JDTA-1', 'jira_a1.js'); //16
    createCommit('chore: Setup for JDTA-1', 'chore commit for JDTA-1', 'jira_a2.js'); // 17
    createCommit('fix: Bugfix for JDTA-1', 'fix commit for JDTA-1', 'jira_a3.js'); // 18

    createCommit('fix: Fix critical security issue PROJ-131', 'security.js'); //19
    createCommit('fix: Address security vulnerability PROJ-131 (follow-up)', 'Applied security fix', 'other.js'); //20
    createCommit('feat: Add new dashboard PROJ-132', 'New dashboard', 'dashboard.js'); //21
    
    execInTmpDir('git tag v0.4.0-beta'); 
    createCommit('feat: Beta feature (for custom filter test) CF-001', 'beta_cf.js'); //22
    execInTmpDir('git tag v0.4.0-rc'); 
    createCommit('fix: RC fix (for custom filter test) CF-002', 'rc_fix_cf.js'); //23
    execInTmpDir('git tag v0.4.0-release');  
    createCommit('feat: Another feature (for custom filter test) CF-003', 'another_cf.js'); //24
    execInTmpDir('git tag v0.5.0-experimental'); 
  });

  test('formats changelog for specific tag range (v0.2.0..v0.3.0) with Angular preset style, alphabetical sections', async () => {
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      tag: { from: 'v0.2.0', to: 'v0.3.0' }, 
      githubRepoUrl: GITHUB_REPO_URL,
    });
    
    // Header is H1 for v0.3.0 (minor release from v0.2.0)
    expect(changelog).toMatch(new RegExp(`^# \\[0\\.3\\.0\\]\\(${escapeRegExp(GITHUB_REPO_URL)}/compare/v0\\.2\\.0\\.\\.\\.v0\\.3\\.0\\) \\(${DATE_REGEX_ESCAPED}\\)\n\n`));
    
    // Sections should be alphabetical: Bug Fixes, Features, Performance Improvements
    const bugFixesSectionRegex = new RegExp(
      escapeRegExp(`### Bug Fixes\n\n`) +
      escapeRegExp(`* Fix URL parsing PROJ-129 (#79) `) + COMMIT_LINK_REGEX_ASSERT_EXISTS + escapeRegExp(`\n\n`) // End of section: 2 newlines
    );
    expect(changelog).toMatch(bugFixesSectionRegex);

    const featuresSectionRegex = new RegExp(
      escapeRegExp(`### Features\n\n`) +
      escapeRegExp(`* Add password reset feature PROJ-127 `) + COMMIT_LINK_REGEX_ASSERT_EXISTS + escapeRegExp(`\n`) +
      escapeRegExp(`* **email:** Add email templates PROJ-128 [WIP] `) + COMMIT_LINK_REGEX_ASSERT_EXISTS + escapeRegExp(`\n\n`) // End of section: 2 newlines
    );
    expect(changelog).toMatch(featuresSectionRegex);
    
    const perfSectionRegex = new RegExp(
      escapeRegExp(`### Performance Improvements\n\n`) +
      escapeRegExp(`* Optimize database queries PROJ-130 `) + COMMIT_LINK_REGEX_ASSERT_EXISTS + escapeRegExp(`\n`)
      // This is the last section in this test case, so it ends with \n\n after body trim.
    );
    expect(changelog).toMatch(perfSectionRegex);
    
    // Check order
    const bugFixesIdx = changelog.indexOf('### Bug Fixes');
    const featuresIdx = changelog.indexOf('### Features');
    const perfIdx = changelog.indexOf('### Performance Improvements');

    expect(bugFixesIdx).toBeLessThan(featuresIdx);
    expect(featuresIdx).toBeLessThan(perfIdx);
    
    expect(changelog).not.toContain('Fix login redirect PROJ-125'); 
    expect(changelog).not.toContain('BC-BANG-001'); 
    expect(changelog.endsWith('\n\n')).toBe(true);
  });

  test('generates changelog with BREAKING CHANGES, alphabetical section order, and formatting for v0.3.0..v0.3.1', async () => {
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      tag: { from: 'v0.3.0', to: 'v0.3.1' }, 
      githubRepoUrl: GITHUB_REPO_URL,
    });
    // Header is H2 for v0.3.1 (patch release from v0.3.0)
    expect(changelog).toMatch(new RegExp(`^## \\[0\\.3\\.1\\]\\(${escapeRegExp(GITHUB_REPO_URL)}/compare/v0\\.3\\.0\\.\\.\\.v0\\.3\\.1\\) \\(${DATE_REGEX_ESCAPED}\\)\n\n`));

    const breakingSectionRegex = new RegExp(
      escapeRegExp(`### BREAKING CHANGES\n\n`) +
      escapeRegExp(`* **api:** Introduce new API version, old one deprecated BC-BANG-001 (#80) `) + COMMIT_LINK_REGEX_ASSERT_EXISTS + escapeRegExp(`\n`) +
      escapeRegExp(`* **module:** Complete rewrite of module X BC-BOTH-001 (#81) `) + COMMIT_LINK_REGEX_ASSERT_EXISTS + escapeRegExp(`\n`) + 
      escapeRegExp(`  * Module X API is entirely new.\n`) +
      escapeRegExp(`  * See migration guide at https://example.com/migrate\n`) +
      escapeRegExp(`* **ui:** Adjust layout due to API changes BC-NOTE-001 `) + COMMIT_LINK_REGEX_ASSERT_EXISTS + escapeRegExp(`\n`) + 
      escapeRegExp(`  * The user profile layout has changed significantly. Users need to update their settings.\n`) +
      escapeRegExp(`  * Another line for the note.\n\n`) // End of section: 2 newlines
    );
    expect(changelog).toMatch(breakingSectionRegex);

    const breakingChangesIndex = changelog.indexOf('### BREAKING CHANGES');
    const bugFixesIndex = changelog.indexOf('### Bug Fixes');
    const featuresIndex = changelog.indexOf('### Features');
    const perfIndex = changelog.indexOf('### Performance Improvements');
    const revertsIndex = changelog.indexOf('### Reverts');

    expect(breakingChangesIndex).toBeGreaterThan(-1);
    // Alphabetical order after BREAKING CHANGES: Bug Fixes, Features, Performance Improvements, Reverts
    expect(bugFixesIndex).toBeGreaterThan(breakingChangesIndex);
    expect(featuresIndex).toBeGreaterThan(bugFixesIndex);
    expect(perfIndex).toBeGreaterThan(featuresIndex);
    expect(revertsIndex).toBeGreaterThan(perfIndex);
    
    const bugFixesSectionRegex = new RegExp(
      escapeRegExp(`### Bug Fixes\n\n`) +
      escapeRegExp(`* **ui:** Adjust layout due to API changes BC-NOTE-001 `) + COMMIT_LINK_REGEX_ASSERT_EXISTS + escapeRegExp(`\n\n`)
    );
    expect(changelog).toMatch(bugFixesSectionRegex);
    
    const featuresSectionRegex = new RegExp(
      escapeRegExp(`### Features\n\n`) +
      escapeRegExp(`* **api:** Introduce new API version, old one deprecated BC-BANG-001 (#80) `) + COMMIT_LINK_REGEX_ASSERT_EXISTS + escapeRegExp(`\n`) +
      escapeRegExp(`* **module:** Complete rewrite of module X BC-BOTH-001 (#81) `) + COMMIT_LINK_REGEX_ASSERT_EXISTS + escapeRegExp(`\n\n`)
    );
    expect(changelog).toMatch(featuresSectionRegex);

    const perfSectionRegex = new RegExp(
      escapeRegExp(`### Performance Improvements\n\n`) +
      escapeRegExp(`* **db:** Optimize another user query PERF-002 `) + COMMIT_LINK_REGEX_ASSERT_EXISTS + escapeRegExp(`\n\n`)
    );
    expect(changelog).toMatch(perfSectionRegex);

    const revertsSectionRegex = new RegExp(
      escapeRegExp(`### Reverts\n\n`) +
      escapeRegExp(`* Revert "feat: Add password reset feature PROJ-127" RVT-001 `) + COMMIT_LINK_REGEX_ASSERT_EXISTS + escapeRegExp(`\n`)
    );
    expect(changelog).toMatch(revertsSectionRegex);

    expect(changelog.endsWith('\n\n')).toBe(true);
  });

  test('formats release header with tree link for the first tag (v0.1.0), alphabetical sections', async () => {
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      tag: 'v0.1.0', 
      githubRepoUrl: GITHUB_REPO_URL,
    });
    // Header is H1 for v0.1.0 (first release)
    expect(changelog).toMatch(new RegExp(`^# \\[0\\.1\\.0\\]\\(${escapeRegExp(GITHUB_REPO_URL)}/tree/v0\\.1\\.0\\) \\(${DATE_REGEX_ESCAPED}\\)\n\n`));
    
    // Alphabetical: Chores, Features
    const choresSectionRegex = new RegExp(
      escapeRegExp(`### Chores\n\n`) +
      escapeRegExp(`* Initial commit `) + COMMIT_LINK_REGEX_ASSERT_EXISTS + escapeRegExp(`\n\n`)
    );
    expect(changelog).toMatch(choresSectionRegex);

    const featuresSectionRegex = new RegExp(
      escapeRegExp(`### Features\n\n`) +
      escapeRegExp(`* Add user authentication `) + COMMIT_LINK_REGEX_ASSERT_EXISTS + escapeRegExp(`\n`) +
      escapeRegExp(`* **api:** Add user endpoints PROJ-123 (#77) `) + COMMIT_LINK_REGEX_ASSERT_EXISTS + escapeRegExp(`\n`) +
      escapeRegExp(`* **ui:** Implement login form PROJ-124 `) + COMMIT_LINK_REGEX_ASSERT_EXISTS + escapeRegExp(`\n`)
    );
    expect(changelog).toMatch(featuresSectionRegex);
    
    const choresIdx = changelog.indexOf('### Chores');
    const featuresIdx = changelog.indexOf('### Features');
    expect(choresIdx).toBeLessThan(featuresIdx);

    expect(changelog).not.toContain('Fix login redirect PROJ-125');
    expect(changelog.endsWith('\n\n')).toBe(true);
  });

  test('generates changelog for v0.4.0-beta and ensures multiple JIRA commits appear, alphabetical sections', async () => {
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      tag: 'v0.4.0-beta', 
      githubRepoUrl: GITHUB_REPO_URL,
    });

    // Header is H2 for v0.4.0-beta (pre-release)
    expect(changelog).toMatch(new RegExp(`^## \\[0\\.4\\.0-beta\\]\\(${escapeRegExp(GITHUB_REPO_URL)}/compare/v0\\.3\\.1\\.\\.\\.v0\\.4\\.0-beta\\) \\(${DATE_REGEX_ESCAPED}\\)\n\n`));

    // Alphabetical order: Bug Fixes, Chores, Features
    const bugFixesIndex = changelog.indexOf('### Bug Fixes');
    const choresIndex = changelog.indexOf('### Chores');
    const featuresIndex = changelog.indexOf('### Features');

    expect(bugFixesIndex).toBeLessThan(choresIndex);
    expect(choresIndex).toBeLessThan(featuresIndex);

    // Features
    expect(changelog).toContain('### Features\n\n');
    expect(changelog).toMatch(new RegExp(escapeRegExp('* Important feature JDTA-1 ') + COMMIT_LINK_REGEX_ASSERT_EXISTS));
    expect(changelog).toMatch(new RegExp(escapeRegExp('* Add new dashboard PROJ-132 ') + COMMIT_LINK_REGEX_ASSERT_EXISTS));
    
    // Bug Fixes
    expect(changelog).toContain('### Bug Fixes\n\n');
    expect(changelog).toMatch(new RegExp(escapeRegExp('* Bugfix for JDTA-1 ') + COMMIT_LINK_REGEX_ASSERT_EXISTS));
    expect(changelog).toMatch(new RegExp(escapeRegExp('* Fix critical security issue PROJ-131 ') + COMMIT_LINK_REGEX_ASSERT_EXISTS));
    expect(changelog).toMatch(new RegExp(escapeRegExp('* Address security vulnerability PROJ-131 (follow-up) ') + COMMIT_LINK_REGEX_ASSERT_EXISTS));

    // Chores
    expect(changelog).toContain('### Chores\n\n');
    expect(changelog).toMatch(new RegExp(escapeRegExp('* Setup for JDTA-1 ') + COMMIT_LINK_REGEX_ASSERT_EXISTS));
    
    // Ensure order within sections (example for Bug Fixes)
    const bugFixesSectionContent = changelog.substring(changelog.indexOf('### Bug Fixes'));
    expect(bugFixesSectionContent.indexOf('Bugfix for JDTA-1')).toBeLessThan(bugFixesSectionContent.indexOf('Fix critical security issue PROJ-131'));
    expect(bugFixesSectionContent.indexOf('Fix critical security issue PROJ-131')).toBeLessThan(bugFixesSectionContent.indexOf('Address security vulnerability PROJ-131 (follow-up)'));

    expect(changelog.endsWith('\n\n')).toBe(true);
  });
});
