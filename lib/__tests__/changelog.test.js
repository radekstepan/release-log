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
    execInTmpDir('git tag v0.2.1-schema');
    createCommit('fix: Fix URL parsing PROJ-129', 'URL parsing fix', 'router.js'); //9
    createCommit('perf: Optimize database queries PROJ-130', 'DB optimization', 'db.js'); //10
    execInTmpDir('git tag v0.3.0');

    // JIRA ID PROJ-131: First commit (oldest in log order for range) should be kept
    createCommit('fix: Fix critical security issue PROJ-131', 'XSS fix', 'security.js'); //11
    createCommit('fix: Address security vulnerability PROJ-131 (follow-up)', 'Applied security fix, should be ignored by dedupe', 'other.js'); //12
    
    createCommit('feat: Add new dashboard PROJ-132', 'New dashboard', 'dashboard.js'); //13
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

  test('generates changelog for unreleased changes (since latest tag v0.3.0)', async () => {
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      unreleased: true,
      githubRepoUrl: GITHUB_REPO_URL,
    });
    expect(changelog).toContain('# Unreleased');
    expect(changelog).toContain('Add new dashboard PROJ-132');
    
    // JIRA Deduplication: PROJ-131 - oldest message (critical issue) should be kept
    expect(changelog).toContain('Fix critical security issue PROJ-131');
    expect(changelog).not.toContain('Address security vulnerability PROJ-131 (follow-up)');
    const proj131Entries = changelog.split('\n').filter(line => line.includes('PROJ-131') && line.trim().startsWith('-'));
    expect(proj131Entries.length).toBe(1);
  });
  
  test('generates changelog for unreleased changes from a specific tag (v0.2.0..HEAD)', async () => {
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      fromTag: 'v0.2.0', 
      unreleased: true,
      githubRepoUrl: GITHUB_REPO_URL,
    });
    expect(changelog).toContain('# Unreleased');
    expect(changelog).toContain('Add password reset feature PROJ-127');
    expect(changelog).toContain('Fix URL parsing PROJ-129');
    expect(changelog).toContain('Add new dashboard PROJ-132');
    // JIRA Deduplication PROJ-131
    expect(changelog).toContain('Fix critical security issue PROJ-131');
    expect(changelog).not.toContain('Address security vulnerability PROJ-131 (follow-up)');

    expect(changelog).not.toContain('Fix login redirect PROJ-125'); 
    expect(changelog).not.toContain('Add user endpoints PROJ-123');
  });

  test('saves changelog to file and prepends correctly', async () => {
    const changelogFileName = 'MY_CHANGELOG.md';
    const changelogFilePath = path.join(tmpDir, changelogFileName);
    if (fs.existsSync(changelogFilePath)) fs.unlinkSync(changelogFilePath);

    await generateChangelog({
      repoPath: tmpDir,
      unreleased: true,
      save: true,
      changelogFile: changelogFileName,
      githubRepoUrl: GITHUB_REPO_URL,
    });

    expect(fs.existsSync(changelogFilePath)).toBe(true);
    let fileContent = fs.readFileSync(changelogFilePath, 'utf8');
    expect(fileContent).toContain('# Unreleased');
    expect(fileContent).toContain('Add new dashboard PROJ-132');

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
    expect(fileContent).toContain('# Unreleased');
    expect(fileContent.indexOf('# v0.3.0 ')).toBeLessThan(fileContent.indexOf('# Unreleased'));
  });

  test('ignores schema tags for versioning (implicitly uses latest non-schema tag)', async () => {
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      githubRepoUrl: GITHUB_REPO_URL,
    });
    // Expects content for v0.3.0 release (commits between v0.2.0 and v0.3.0)
    expect(changelog).toContain('# v0.3.0 ');
    expect(changelog).toContain('Add password reset feature PROJ-127');
    expect(changelog).toContain('Fix URL parsing PROJ-129');
    expect(changelog).not.toContain('v0.2.1-schema');
    expect(changelog).not.toContain('Add new dashboard PROJ-132'); // Unreleased
    expect(changelog).not.toContain('Fix login redirect PROJ-125'); // Belongs to v0.2.0 release
  });

  test('generates changelog for the first tag (all commits up to v0.1.0)', async () => {
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      toTag: 'v0.1.0',
      githubRepoUrl: GITHUB_REPO_URL,
    });
    expect(changelog).toContain('# v0.1.0 ');
    expect(changelog).toContain('Add user authentication');
    expect(changelog).toContain('Add user endpoints PROJ-123');
    expect(changelog).toContain('Implement login form PROJ-124');

    // Chores are displayed by default if they are conventional commits
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

    const customConfig = {
      repoPath: tmpDir, 
      fromTag: 'v0.3.0', 
      unreleased: true, 
      commitTypes: {
        feat: 'Awesome New Features', 
        improvement: 'Enhancements', 
      },
      githubRepoUrl: GITHUB_REPO_URL,
    };

    // These commits are after v0.3.0 and will be part of "Unreleased"
    createCommit('feat: A super cool new thing!', 'new_thing.js');
    createCommit('improvement: Made something better IMP-001', 'improvement.js');
    createCommit('fix: A normal fix (should use default title) FIX-002', 'fix_normal.js');
    createCommit('chore: A chore for custom types test CSTM-CHR-01', 'chore_file_custom.js');
    
    const changelog = await generateChangelog(customConfig);

    expect(changelog).toContain('## Awesome New Features'); // Custom title
    expect(changelog).toContain('A super cool new thing!');
    expect(changelog).toContain('## Enhancements'); // Custom type and title
    expect(changelog).toContain('Made something better IMP-001');
    expect(changelog).toContain('## Bug Fixes'); // Default title for 'fix'
    expect(changelog).toContain('A normal fix (should use default title) FIX-002');
    
    // Chores are displayed by default if they are conventional commits and 'chore' is in effective commitTypes
    expect(changelog).toContain('## Chores'); 
    expect(changelog).toContain('A chore for custom types test CSTM-CHR-01');

    execInTmpDir(`git reset --hard ${currentHead}`, true);
    try { execInTmpDir('git checkout main', true); } catch(e) { /* ignore */ }
  });
});
