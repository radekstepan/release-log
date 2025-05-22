// lib/__tests__/changelog.test.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { generateChangelog } = require('../../index'); 

describe('changelog', () => {
  let tmpDir;
  const GITHUB_REPO_URL = 'https://github.com/test-org/test-repo';

  const execInTmpDir = (command, silent = false) => {
    try {
      const output = execSync(command, { encoding: 'utf8', cwd: tmpDir, stdio: 'pipe' });
      return output ? output.trim() : '';
    } catch (error) {
      // Suppress console.error for expected git errors in tests (like on empty repo)
      // if (!silent) {
      //   const stderrMessage = error.stderr ? error.stderr.toString().trim() : 'N/A';
      //   console.error(`Error executing command in tmpDir: ${command}\nStderr: ${stderrMessage}`);
      // }
      throw error;
    }
  };

  const createCommit = (message, content, fileName = 'README.md') => {
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
    execInTmpDir(`git commit --no-verify -m "${message}" --allow-empty`, true); 
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
    createCommit('feat(email): Add email templates PROJ-128', 'Email templates', 'emails/'); //8
    execInTmpDir('git tag v0.2.1-schema'); // Will be ignored by default tagFilter
    createCommit('fix: Fix URL parsing PROJ-129', 'URL parsing fix', 'router.js'); //9
    createCommit('perf: Optimize database queries PROJ-130', 'DB optimization', 'db.js'); //10
    execInTmpDir('git tag v0.3.0');

    // JIRA ID PROJ-131: First commit (oldest in log order for range) should be kept
    createCommit('fix: Fix critical security issue PROJ-131', 'XSS fix', 'security.js'); //11
    createCommit('fix: Address security vulnerability PROJ-131 (follow-up)', 'Applied security fix, should be ignored by dedupe', 'other.js'); //12
    
    createCommit('feat: Add new dashboard PROJ-132', 'New dashboard', 'dashboard.js'); //13

    // Tags for custom tagFilter test
    execInTmpDir('git tag v0.4.0-beta');
    createCommit('feat: Beta feature (for custom filter test) CF-001', 'beta_cf.js');
    execInTmpDir('git tag v0.4.0-rc');
    createCommit('fix: RC fix (for custom filter test) CF-002', 'rc_fix_cf.js');
    execInTmpDir('git tag v0.4.0-release'); // This tag should be picked up by custom filter
    createCommit('feat: Another feature (for custom filter test) CF-003', 'another_cf.js');
    execInTmpDir('git tag v0.5.0-experimental'); // This tag should be ignored by custom filter
  });

  afterAll(() => {
    // fs.rmSync(tmpDir, { recursive: true, force: true }); 
    console.log(`Test repository available for inspection at: ${tmpDir}`);
  });

  test('generates changelog for specific tag range (v0.2.0..v0.3.0)', async () => {
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      fromTag: 'v0.2.0',
      toTag: 'v0.3.0',
      githubRepoUrl: GITHUB_REPO_URL,
    });
    expect(changelog).toContain('# v0.3.0 ');
    expect(changelog).toContain('## Features');
    expect(changelog).toContain('Add password reset feature PROJ-127');
    // Check for the presence of any commit link structure
    expect(changelog).toMatch(/\[[a-f0-9]{7}\]\(https:\/\/github\.com\/test-org\/test-repo\/commit\/[a-f0-9]{7}\)/);
    expect(changelog).toContain('## Bug Fixes');
    expect(changelog).toContain('Fix URL parsing PROJ-129');
    expect(changelog).toContain('## Performance Improvements');
    expect(changelog).toContain('Optimize database queries PROJ-130');
    
    expect(changelog).not.toContain('Fix login redirect PROJ-125');
    expect(changelog).not.toContain('Add new dashboard PROJ-132');
    expect(changelog).not.toContain('v0.2.1-schema');
  });

  test('generates changelog for unreleased changes (since latest tag v0.4.0-release, due to setup)', async () => {
    // Note: default tag filter ignores v0.5.0-experimental, so latest "valid" tag before unreleased commits is v0.4.0-release
    // However, the unreleased commits are PROJ-131, PROJ-132 (after v0.3.0) and CF-003 (after v0.4.0-release)
    // The unreleased logic uses getLatestTag which uses the *provided* tagFilter.
    // If no tagFilter is provided, default filter makes v0.4.0-release the latest for "unreleased from latest" context.
    // The commits relevant are PROJ-131, PROJ-132, CF-001, CF-002, CF-003.
    // Wait, no, beforeAll sets up commits, then tags.
    // Commits after v0.3.0:
    // - PROJ-131, PROJ-131-followup, PROJ-132 (these are truly unreleased if default filter is used, as v0.4.0-beta etc are not schema tags)
    // - Then v0.4.0-beta, CF-001, v0.4.0-rc, CF-002, v0.4.0-release, CF-003, v0.5.0-experimental
    // If default filter used: latest tag is v0.4.0-release. Commits after it: CF-003.
    // Plus, commits after v0.3.0 but before any v0.4.0 tags are PROJ-131, PROJ-131-followup, PROJ-132.
    // This is tricky. Let's simplify the unreleased test for default.
    // The 'unreleased' logic should pick the latest tag considering the filter.
    // With default filter: v0.1.0, v0.2.0, v0.3.0, v0.4.0-beta, v0.4.0-rc, v0.4.0-release, v0.5.0-experimental are all valid.
    // So latest is v0.5.0-experimental.
    // Commits after v0.5.0-experimental: none.
    // Let's re-tag `v0.5.0-experimental` to `v0.5.0` to make it simpler for default filter.
    // I'll adjust the beforeAll.
    
    // Re-evaluating unreleased state based on beforeAll structure:
    // Tags in order (desc by version sort): v0.5.0-experimental, v0.4.0-release, v0.4.0-rc, v0.4.0-beta, v0.3.0, v0.2.1-schema, v0.2.0, v0.1.0
    // With default tagFilter (ignores only *-schema):
    // Valid tags (desc): v0.5.0-experimental, v0.4.0-release, v0.4.0-rc, v0.4.0-beta, v0.3.0, v0.2.0, v0.1.0
    // Latest tag is v0.5.0-experimental. Commits after this: none.
    // So 'unreleased' would be empty. This is not testing much.

    // To make 'unreleased' test meaningful with default filter, I need commits after the "latest valid tag".
    // Let's add a commit after all tags in beforeAll.
    const currentHeadBeforeUnreleasedTest = execInTmpDir('git rev-parse HEAD');
    createCommit('feat: Truly unreleased feature UNRL-001', 'unreleased_final.js');
    
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      unreleased: true,
      githubRepoUrl: GITHUB_REPO_URL,
      // Uses default tagFilter: (tag) => !tag.endsWith('-schema')
    });

    // Default filter: latest tag is v0.5.0-experimental (as v0.2.1-schema is filtered)
    // So unreleased should contain 'Truly unreleased feature UNRL-001'
    expect(changelog).toContain('# Unreleased');
    expect(changelog).toContain('Truly unreleased feature UNRL-001');

    // Check that commits between v0.3.0 and first v0.4.0 tag are not in "Unreleased" if we consider v0.3.0 the fromTag
    // (they would be part of v0.4.0-beta or similar if that was a release)
    // The test `generates changelog for unreleased changes from a specific tag (v0.3.0..HEAD)` handles this more directly.
    // This specific test just checks "unreleased since latest tag according to filter".

    // JIRA Deduplication for PROJ-131 and PROJ-132 are tested in their respective release sections or other unreleased tests.
    // Let's verify PROJ-131/132 are NOT here as they are part of "unreleased from v0.3.0"
    // PROJ-131/132 are before v0.4.0-beta.
    expect(changelog).not.toContain('Add new dashboard PROJ-132');
    expect(changelog).not.toContain('Fix critical security issue PROJ-131');

    execInTmpDir(`git reset --hard ${currentHeadBeforeUnreleasedTest}`, true); // Clean up commit
  });
  
  test('generates changelog for unreleased changes from a specific tag (v0.3.0..HEAD)', async () => {
    // Commits after v0.3.0 are:
    // PROJ-131, PROJ-131-followup, PROJ-132
    // then v0.4.0-beta tag
    // CF-001
    // then v0.4.0-rc tag
    // CF-002
    // then v0.4.0-release tag
    // CF-003
    // then v0.5.0-experimental tag
    // (and the temporary UNRL-001 if not reset)
    // So, unreleased from v0.3.0 should contain all of these.
    
    const currentHeadBeforeUnreleasedTest = execInTmpDir('git rev-parse HEAD');
    createCommit('feat: Another unreleased from v0.3.0 SPECIFIC-UNRL-002', 'specific_unreleased_final.js');

    const changelog = await generateChangelog({
      repoPath: tmpDir,
      fromTag: 'v0.3.0', 
      unreleased: true,
      githubRepoUrl: GITHUB_REPO_URL,
      // Uses default tagFilter
    });
    expect(changelog).toContain('# Unreleased');
    // Commits right after v0.3.0
    expect(changelog).toContain('Add new dashboard PROJ-132');
    expect(changelog).toContain('Fix critical security issue PROJ-131'); // Deduplicated
    expect(changelog).not.toContain('Address security vulnerability PROJ-131 (follow-up)');
    // Commits related to v0.4.0-series tags
    expect(changelog).toContain('Beta feature (for custom filter test) CF-001');
    expect(changelog).toContain('RC fix (for custom filter test) CF-002');
    expect(changelog).toContain('Another feature (for custom filter test) CF-003');
    // The very last commit
    expect(changelog).toContain('Another unreleased from v0.3.0 SPECIFIC-UNRL-002');

    expect(changelog).not.toContain('Fix login redirect PROJ-125'); 
    expect(changelog).not.toContain('Add user endpoints PROJ-123');
    
    execInTmpDir(`git reset --hard ${currentHeadBeforeUnreleasedTest}`, true); // Clean up commit
  });

  test('saves changelog to file and prepends correctly', async () => {
    const changelogFileName = 'MY_CHANGELOG.md';
    const changelogFilePath = path.join(tmpDir, changelogFileName);
    if (fs.existsSync(changelogFilePath)) fs.unlinkSync(changelogFilePath);

    // Add a commit to make unreleased section non-empty with default filter
    const headBeforeSave = execInTmpDir('git rev-parse HEAD');
    createCommit('feat: unreleased for save test SAVE-001', 'save_test.js');

    await generateChangelog({
      repoPath: tmpDir,
      unreleased: true, // Will be unreleased since v0.5.0-experimental (latest by default filter)
      save: true,
      changelogFile: changelogFileName,
      githubRepoUrl: GITHUB_REPO_URL,
    });

    expect(fs.existsSync(changelogFilePath)).toBe(true);
    let fileContent = fs.readFileSync(changelogFilePath, 'utf8');
    expect(fileContent).toContain('# Unreleased');
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
    expect(fileContent).toContain('# v0.3.0 ');
    expect(fileContent).toContain('Add password reset feature PROJ-127');
    expect(fileContent).toContain('# Unreleased'); // Previous unreleased section
    expect(fileContent).toContain('unreleased for save test SAVE-001');
    expect(fileContent.indexOf('# v0.3.0 ')).toBeLessThan(fileContent.indexOf('# Unreleased'));

    execInTmpDir(`git reset --hard ${headBeforeSave}`, true); // Clean up commit
  });

  test('ignores schema tags for versioning (implicitly uses default tagFilter)', async () => {
    // This test relies on v0.2.1-schema existing and being ignored by default filter.
    // If no options are given, it generates for latest tag.
    // Default filter: v0.5.0-experimental is latest. Prev is v0.4.0-release.
    // So this should be changelog for v0.5.0-experimental
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      githubRepoUrl: GITHUB_REPO_URL,
    });
    // Latest tag by default filter is v0.5.0-experimental. Previous is v0.4.0-release.
    // Commits between v0.4.0-release and v0.5.0-experimental: "Another feature (for custom filter test) CF-003"
    expect(changelog).toContain('# v0.5.0-experimental');
    expect(changelog).toContain('Another feature (for custom filter test) CF-003');
    
    expect(changelog).not.toContain('v0.2.1-schema'); // Schema tag should not be a title
    // Ensure commits from v0.3.0 (which is after v0.2.1-schema) are not here
    expect(changelog).not.toContain('Add password reset feature PROJ-127'); 
  });

  test('uses custom tagFilter function to select specific tags', async () => {
    // Custom filter: only tags ending with '-release' or exactly 'v0.3.0' or 'v0.2.0'
    const customTagFilter = (tag) => tag.endsWith('-release') || tag === 'v0.3.0' || tag === 'v0.2.0';

    // With this filter, the valid tags are (in descending version sort):
    // v0.4.0-release, v0.3.0, v0.2.0
    // So, latest tag is v0.4.0-release. Previous tag is v0.3.0.
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      tagFilter: customTagFilter,
      // No from/toTag, so should generate for latest tag according to filter (v0.4.0-release)
      githubRepoUrl: GITHUB_REPO_URL,
    });

    expect(changelog).toContain('# v0.4.0-release');
    // Commits between v0.3.0 and v0.4.0-release:
    // PROJ-131, PROJ-131-followup, PROJ-132 (after v0.3.0, before v0.4.0-beta)
    // CF-001 (after v0.4.0-beta, before v0.4.0-rc)
    // CF-002 (after v0.4.0-rc, before v0.4.0-release)
    expect(changelog).toContain('Add new dashboard PROJ-132');
    expect(changelog).toContain('Fix critical security issue PROJ-131');
    expect(changelog).toContain('Beta feature (for custom filter test) CF-001');
    expect(changelog).toContain('RC fix (for custom filter test) CF-002');

    // Ensure tags filtered out are not considered
    expect(changelog).not.toContain('v0.5.0-experimental');
    expect(changelog).not.toContain('v0.4.0-beta');
    expect(changelog).not.toContain('v0.4.0-rc');
    expect(changelog).not.toContain('v0.1.0'); // Filtered out by this custom filter

    // Test unreleased with custom filter
    const headBeforeCustomUnreleased = execInTmpDir('git rev-parse HEAD');
    createCommit('feat: Unreleased for custom filter CUST-UNRL-001', 'cust_unrl.js');

    const unreleasedChangelog = await generateChangelog({
        repoPath: tmpDir,
        unreleased: true,
        tagFilter: customTagFilter,
        githubRepoUrl: GITHUB_REPO_URL,
    });
    // Latest tag by custom filter is v0.4.0-release.
    // Commits after v0.4.0-release:
    // CF-003 (before v0.5.0-experimental)
    // CUST-UNRL-001 (the one just added)
    expect(unreleasedChangelog).toContain('# Unreleased');
    expect(unreleasedChangelog).toContain('Another feature (for custom filter test) CF-003');
    expect(unreleasedChangelog).toContain('Unreleased for custom filter CUST-UNRL-001');
    
    execInTmpDir(`git reset --hard ${headBeforeCustomUnreleased}`, true);
  });


  test('generates changelog for the first tag (all commits up to v0.1.0)', async () => {
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      toTag: 'v0.1.0',
      githubRepoUrl: GITHUB_REPO_URL,
      // Uses default tagFilter, v0.1.0 is valid
    });
    expect(changelog).toContain('# v0.1.0 ');
    expect(changelog).toContain('Add user authentication');
    expect(changelog).toContain('Add user endpoints PROJ-123');
    expect(changelog).toContain('Implement login form PROJ-124');
    expect(changelog).toContain('## Chores');
    expect(changelog).toContain('Initial commit');
    expect(changelog).not.toContain('Fix login redirect PROJ-125');
  });

  test('generates changelog for all commits if no tags exist', async () => {
    const noTagsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-notags-'));
    try {
      execSync('git init', { cwd: noTagsTmpDir, stdio: 'pipe' });
      execSync('git config commit.gpgsign false', { cwd: noTagsTmpDir });
      try { execSync('git checkout -b main', { cwd: noTagsTmpDir, stdio: 'pipe' }); } catch (e) {/* ignore */}
      execSync('git config user.name "Test User"', { cwd: noTagsTmpDir, stdio: 'pipe' });
      execSync('git config user.email "test@example.com"', { cwd: noTagsTmpDir, stdio: 'pipe' });

      const localCreateCommit = (msg, dir) => {
        fs.writeFileSync(path.join(dir, 'file.txt'), `${msg}\n`, { flag: 'a' });
        execSync('git add file.txt', { cwd: dir, stdio: 'pipe' });
        execSync(`git commit --no-verify -m "${msg}"`, { cwd: dir, stdio: 'pipe' });
      };
      localCreateCommit('feat: First feature in no-tag repo AA-100', noTagsTmpDir);
      localCreateCommit('fix: A bug BB-200', noTagsTmpDir);

      const changelog = await generateChangelog({
        repoPath: noTagsTmpDir,
        githubRepoUrl: GITHUB_REPO_URL,
      });
      expect(changelog).toMatch(/# Changelog \(\d{4}-\d{2}-\d{2}\)/);
      expect(changelog).toContain('First feature in no-tag repo AA-100');
      expect(changelog).toContain('A bug BB-200');
    } finally {
      // fs.rmSync(noTagsTmpDir, { recursive: true, force: true });
      console.log(`No-tags test repository available at: ${noTagsTmpDir}`);
    }
  });
  
  test('handles empty repository (no commits)', async () => {
    const emptyTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-empty-'));
    try {
      execSync('git init', { cwd: emptyTmpDir, stdio: 'pipe' });
      execSync('git config commit.gpgsign false', { cwd: emptyTmpDir });
      try { execSync('git checkout -b main', { cwd: emptyTmpDir, stdio: 'pipe' }); } catch (e) {/* ignore */}
      execSync('git config user.name "Test User"', { cwd: emptyTmpDir, stdio: 'pipe' }); 
      execSync('git config user.email "test@example.com"', { cwd: emptyTmpDir, stdio: 'pipe' });

      const changelog = await generateChangelog({
        repoPath: emptyTmpDir,
        githubRepoUrl: GITHUB_REPO_URL,
      });
      expect(changelog).toMatch(/# Changelog \(\d{4}-\d{2}-\d{2}\)/);
      const significantLines = changelog.split('\n').filter(line => line.trim().length > 0 && !line.startsWith('# Changelog'));
      expect(significantLines.length).toBe(0); 
    } finally {
      // fs.rmSync(emptyTmpDir, { recursive: true, force: true });
      console.log(`Empty test repository available at: ${emptyTmpDir}`);
    }
  });

  test('handles repository with commits but no conventional commits in range', async () => {
    const nonConvTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-nonconv-'));
    try {
      execSync('git init', { cwd: nonConvTmpDir, stdio: 'pipe' });
      execSync('git config commit.gpgsign false', { cwd: nonConvTmpDir });
      try { execSync('git checkout -b main', { cwd: nonConvTmpDir, stdio: 'pipe' }); } catch (e) {/* ignore */}
      execSync('git config user.name "Test User"', { cwd: nonConvTmpDir, stdio: 'pipe' });
      execSync('git config user.email "test@example.com"', { cwd: nonConvTmpDir, stdio: 'pipe' });

      const localCreateCommit = (msg, dir) => {
        fs.writeFileSync(path.join(dir, 'file.txt'), `${msg}\n`, { flag: 'a' });
        execSync('git add file.txt', { cwd: dir, stdio: 'pipe' });
        execSync(`git commit --no-verify -m "${msg}"`, { cwd: dir, stdio: 'pipe' });
      };
      localCreateCommit('Just a regular commit', nonConvTmpDir);
      localCreateCommit('Another regular commit', nonConvTmpDir);
      execSync('git tag v1.0.0', { cwd: nonConvTmpDir, stdio: 'pipe' });

      const changelog = await generateChangelog({
        repoPath: nonConvTmpDir,
        toTag: 'v1.0.0',
        githubRepoUrl: GITHUB_REPO_URL,
      });
      expect(changelog).toContain('# v1.0.0 ');
      expect(changelog).not.toContain('## Features');
      expect(changelog).not.toContain('## Bug Fixes');
      const significantLines = changelog.split('\n').filter(line => line.trim().length > 0 && !line.startsWith('# v1.0.0'));
      expect(significantLines.length).toBe(0);
    } finally {
      // fs.rmSync(nonConvTmpDir, { recursive: true, force: true });
      console.log(`Non-conventional commit test repository available at: ${nonConvTmpDir}`);
    }
  });

  test('uses custom commit types, merging with defaults', async () => {
    const currentHead = execInTmpDir('git rev-parse HEAD');

    // Use fromTag to ensure we are in a known state for unreleased commits
    // Latest tag with default filter is v0.5.0-experimental
    const customConfig = {
      repoPath: tmpDir, 
      fromTag: 'v0.5.0-experimental', // Ensure a clear base for unreleased
      unreleased: true, 
      commitTypes: {
        feat: 'Awesome New Features', 
        improvement: 'Enhancements', 
      },
      githubRepoUrl: GITHUB_REPO_URL,
    };

    // These commits are after v0.5.0-experimental and will be part of "Unreleased"
    createCommit('feat: A super cool new thing! CSTM-001', 'new_thing.js');
    createCommit('improvement: Made something better IMP-001', 'improvement.js');
    createCommit('fix: A normal fix (should use default title) FIX-002', 'fix_normal.js');
    createCommit('chore: A chore for custom types test CSTM-CHR-01', 'chore_file_custom.js');
    
    const changelog = await generateChangelog(customConfig);

    expect(changelog).toContain('## Awesome New Features'); // Custom title
    expect(changelog).toContain('A super cool new thing! CSTM-001');
    expect(changelog).toContain('## Enhancements'); // Custom type and title
    expect(changelog).toContain('Made something better IMP-001');
    expect(changelog).toContain('## Bug Fixes'); // Default title for 'fix'
    expect(changelog).toContain('A normal fix (should use default title) FIX-002');
    expect(changelog).toContain('## Chores'); 
    expect(changelog).toContain('A chore for custom types test CSTM-CHR-01');

    execInTmpDir(`git reset --hard ${currentHead}`, true);
  });

  // New describe block for Angular Preset Functionality
  describe('Angular Preset Functionality', () => {
    const ANGULAR_PRESET_CONFIG = {
      repoPath: tmpDir, // Use the same temp git repo
      preset: 'angular',
      githubRepoUrl: GITHUB_REPO_URL,
    };

    let headAtStartOfAngularTests;

    beforeAll(() => {
      headAtStartOfAngularTests = execInTmpDir('git rev-parse HEAD');
      // Create a known tag to base "unreleased" or specific ranges on for these tests
      createCommit('chore: setup for angular tests', 'Setup commit');
      execInTmpDir('git tag v1.0.0-angular-test-base');
    });

    afterAll(() => {
      // Reset to the head before these specific tests to avoid interference
      execInTmpDir(`git reset --hard ${headAtStartOfAngularTests}`, true);
      // Potentially clean up the tag if it's not desired globally, but it's fine for now.
      // execInTmpDir('git tag -d v1.0.0-angular-test-base', true);
    });
    
    test('1. uses async/await and handles promises', async () => {
      // This is implicitly tested by all other async tests.
      // Explicitly test a simple case.
      const promise = generateChangelog({ ...ANGULAR_PRESET_CONFIG, unreleased: true });
      expect(promise).toBeInstanceOf(Promise);
      const changelog = await promise;
      expect(changelog).toBeDefined();
    });

    test('2. activates Angular preset, groups commits by type, and orders sections correctly', async () => {
      const headBeforeTest = execInTmpDir('git rev-parse HEAD');
      
      createCommit('feat(scope): New feature 1 (Angular)', 'feat1 content');
      createCommit('fix(another): Bug fix 1 (Angular)', 'fix1 content');
      createCommit('perf(backend): Performance improvement (Angular)', 'perf content');
      createCommit('docs(readme): Documentation update (Angular)', 'docs content');
      createCommit('style(css): Code style change (Angular)', 'style content');
      createCommit('refactor(core): Code refactoring (Angular)', 'refactor content');
      createCommit('test(unit): Add unit tests (Angular)', 'test content');
      createCommit('chore(build): Build system change (Angular)', 'chore content');
      createCommit('feat(scope2): New feature 2 (Angular)', 'feat2 content');
      createCommit('fix(another2): Bug fix 2 (Angular)', 'fix2 content');

      const changelog = await generateChangelog({
        ...ANGULAR_PRESET_CONFIG,
        fromTag: 'v1.0.0-angular-test-base',
        unreleased: true,
      });

      // Check for section titles (exact titles depend on conventional-changelog-angular)
      // Common titles are "Features", "Bug Fixes", "Performance Improvements" etc.
      // The preset might include emojis like ✨ Features, 🐛 Bug Fixes
      expect(changelog).toMatch(/## (?:✨ )?Features/);
      expect(changelog).toMatch(/## (?:🐛 )?Bug Fixes/);
      expect(changelog).toMatch(/## (?:⚡️ )?Performance Improvements/);
      expect(changelog).toMatch(/## (?:📚 )?Documentation/);
      expect(changelog).toMatch(/## (?:💎 )?Styles/); // or Code Style Changes
      expect(changelog).toMatch(/## (?:📦 )?Code Refactoring/); // or Refactors
      expect(changelog).toMatch(/## (?:🚨 )?Tests/); // or Testing
      expect(changelog).toMatch(/## (?:⚙️ )?Chores/); // or Continuous Integration / Build System & Chores

      // Check for commit messages under their respective sections
      expect(changelog).toMatch(/## (?:✨ )?Features[\s\S]*- \*\*scope:\*\* New feature 1 \(Angular\)/);
      expect(changelog).toMatch(/## (?:✨ )?Features[\s\S]*- \*\*scope2:\*\* New feature 2 \(Angular\)/);
      expect(changelog).toMatch(/## (?:🐛 )?Bug Fixes[\s\S]*- \*\*another:\*\* Bug fix 1 \(Angular\)/);
      expect(changelog).toMatch(/## (?:🐛 )?Bug Fixes[\s\S]*- \*\*another2:\*\* Bug fix 2 \(Angular\)/);
      expect(changelog).toMatch(/## (?:⚡️ )?Performance Improvements[\s\S]*- \*\*backend:\*\* Performance improvement \(Angular\)/);
      
      // Check section order (simplified check, actual order from preset)
      // BREAKING CHANGES (if any) > Features > Bug Fixes > Performance ...
      const featuresIndex = changelog.indexOf('Features');
      const bugFixesIndex = changelog.indexOf('Bug Fixes');
      const perfIndex = changelog.indexOf('Performance Improvements');

      expect(featuresIndex).toBeLessThan(bugFixesIndex);
      expect(bugFixesIndex).toBeLessThan(perfIndex);
      // More detailed order checks can be added if specific preset order is critical to test against.

      execInTmpDir(`git reset --hard ${headBeforeTest}`, true);
    });

    test('3. parses and formats single and multi-line BREAKING CHANGES', async () => {
      const headBeforeTest = execInTmpDir('git rev-parse HEAD');

      createCommit(
        `feat(api): new data model\n\nThis is a new data model.\n\nBREAKING CHANGE: The old 'foo' field is removed. Users must migrate.`, 
        'breaking_feat.js'
      );
      createCommit(
        `fix(auth): token handling\n\nBREAKING CHANGE: Token format updated.\nClient needs to handle new JWT structure.\nThis affects all /api/protected endpoints.`, 
        'breaking_fix.js'
      );
      createCommit('feat(ui): non-breaking feature', 'non_breaking.js');

      const changelog = await generateChangelog({
        ...ANGULAR_PRESET_CONFIG,
        fromTag: 'v1.0.0-angular-test-base',
        unreleased: true,
      });
      
      expect(changelog).toContain('## BREAKING CHANGES');
      // Check for breaking change descriptions
      expect(changelog).toMatch(/## BREAKING CHANGES[\s\S]*- \*\*api:\*\* The old 'foo' field is removed. Users must migrate./);
      expect(changelog).toMatch(/## BREAKING CHANGES[\s\S]*- \*\*auth:\*\* Token format updated.\nClient needs to handle new JWT structure.\nThis affects all \/api\/protected endpoints./);
      
      // Check that original commits also appear in their type sections
      expect(changelog).toMatch(/## (?:✨ )?Features[\s\S]*- \*\*api:\*\* new data model/);
      expect(changelog).toMatch(/## (?:🐛 )?Bug Fixes[\s\S]*- \*\*auth:\*\* token handling/);
      expect(changelog).toMatch(/## (?:✨ )?Features[\s\S]*- \*\*ui:\*\* non-breaking feature/);

      // Check order: BREAKING CHANGES should be first
      expect(changelog.indexOf('## BREAKING CHANGES')).toBeLessThan(changelog.indexOf('Features'));
      
      execInTmpDir(`git reset --hard ${headBeforeTest}`, true);
    });

    test('4. formats commit messages correctly (scope, subject, hash link)', async () => {
      const headBeforeTest = execInTmpDir('git rev-parse HEAD');
      createCommit('feat(parser): add new parsing logic', 'parser.js');
      const commitHash = execInTmpDir('git rev-parse --short HEAD');

      const changelog = await generateChangelog({
        ...ANGULAR_PRESET_CONFIG,
        fromTag: 'v1.0.0-angular-test-base',
        unreleased: true,
      });
      
      const expectedCommitString = `- **parser:** add new parsing logic ([${commitHash}](${ANGULAR_PRESET_CONFIG.githubRepoUrl}/commit/${commitHash}))`;
      expect(changelog).toContain(expectedCommitString);
      
      execInTmpDir(`git reset --hard ${headBeforeTest}`, true);
    });

    test('5. interacts correctly with unreleased: true and githubRepoUrl', async () => {
      // This is implicitly tested by tests 2, 3, and 4 which use unreleased: true and githubRepoUrl.
      // We can add a specific simple case if needed.
      const headBeforeTest = execInTmpDir('git rev-parse HEAD');
      createCommit('feat(test): unreleased with preset', 'unreleased_preset.js');
      const commitHash = execInTmpDir('git rev-parse --short HEAD');

      const changelog = await generateChangelog({
        ...ANGULAR_PRESET_CONFIG,
        fromTag: 'v1.0.0-angular-test-base',
        unreleased: true, 
      });

      expect(changelog).toContain('# Unreleased');
      expect(changelog).toMatch(/## (?:✨ )?Features/);
      const expectedCommitString = `- **test:** unreleased with preset ([${commitHash}](${ANGULAR_PRESET_CONFIG.githubRepoUrl}/commit/${commitHash}))`;
      expect(changelog).toContain(expectedCommitString);
      
      execInTmpDir(`git reset --hard ${headBeforeTest}`, true);
    });

    test('6. falls back to default behavior if preset is not "angular"', async () => {
      const headBeforeTest = execInTmpDir('git rev-parse HEAD');
      createCommit('feat(xyz): A feature for default test', 'default_feat.js');
      createCommit('fix(abc): A fix for default test', 'default_fix.js');
      const featHash = execInTmpDir('git rev-parse --short HEAD'); // Actually hash of fix
      const fixCommitMsg = 'A fix for default test'; // For simpler matching

      const changelogDefault = await generateChangelog({
        repoPath: tmpDir,
        fromTag: 'v1.0.0-angular-test-base',
        unreleased: true,
        githubRepoUrl: GITHUB_REPO_URL,
        // No preset specified
      });

      expect(changelogDefault).toContain('## Features'); // Default title, no emoji
      expect(changelogDefault).toContain('## Bug Fixes');
      expect(changelogDefault).not.toContain('## BREAKING CHANGES'); // No breaking changes made here
      expect(changelogDefault).toContain(`- **xyz:** A feature for default test`);
      expect(changelogDefault).toContain(`- **abc:** ${fixCommitMsg}`); // Hash will be part of this line

      const changelogNullPreset = await generateChangelog({
        repoPath: tmpDir,
        fromTag: 'v1.0.0-angular-test-base',
        unreleased: true,
        preset: null, // Explicitly null
        githubRepoUrl: GITHUB_REPO_URL,
      });
      expect(changelogNullPreset).toEqual(changelogDefault);
      
      execInTmpDir(`git reset --hard ${headBeforeTest}`, true);
    });
  });
});
