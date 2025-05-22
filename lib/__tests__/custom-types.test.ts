import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { generateChangelog, ChangelogConfig } from '../../index';

describe('Changelog Generation - Custom Commit Types', () => {
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-customtypes-test-'));
    execInTmpDir('git init');
    execInTmpDir('git config commit.gpgsign false');
    try { execInTmpDir('git checkout -b main', true); } catch (e) { /* Branch main likely exists */ }
    execInTmpDir('git config user.name "Test User"');
    execInTmpDir('git config user.email "test@example.com"');
    
    // Base tag for unreleased custom types test
    createCommit('chore: Base for custom types test');
    execInTmpDir('git tag v0.9.0-custom-base');
  });

  test('uses custom commit types, merging with defaults, and respects Angular preset formatting', async () => {
    const headBeforeTest = execInTmpDir('git rev-parse HEAD');
    
    const customConfig: ChangelogConfig = {
      repoPath: tmpDir, 
      fromTag: 'v0.9.0-custom-base', // Use the base tag created in beforeAll
      unreleased: true, 
      commitTypes: {
        feat: 'Awesome New Features', 
        improvement: 'Enhancements', // Custom type
      },
      githubRepoUrl: GITHUB_REPO_URL,
    };

    createCommit('feat: A super cool new thing! CSTM-001', 'new_thing.js');
    createCommit('improvement: Made something better IMP-001', 'improvement.js');
    createCommit('fix: A normal fix (should use default title) FIX-002', 'fix_normal.js');
    createCommit('chore: A chore for custom types test CSTM-CHR-01', 'chore_file_custom.js');
    
    const changelog = await generateChangelog(customConfig);

    expect(changelog).toMatch(new RegExp(`^## \\[Unreleased\\]\\(${GITHUB_REPO_URL}/compare/v0\\.9\\.0-custom-base\\.\\.\\.HEAD\\) ${DATE_REGEX}`));
    
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

    // Standard sections order based on ANGULAR_PRESET_CATEGORY_TITLES_ORDER
    expect(fixesIdx).toBeLessThan(choresIdx); // Bug Fixes before Chores

    // Custom titled sections should appear after all standard sections
    expect(awesomeIdx).toBeGreaterThan(choresIdx); 
    expect(enhanceIdx).toBeGreaterThan(choresIdx); 
    
    // Custom titled sections should be sorted alphabetically
    expect(awesomeIdx).toBeLessThan(enhanceIdx); // 'Awesome New Features' before 'Enhancements'

    execInTmpDir(`git reset --hard ${headBeforeTest}`, true); // Clean up commits made in this test
  });
});
