import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { generateChangelog } from '../index';

// Store original Date before mocking
const ACTUAL_SYSTEM_DATE = global.Date;

describe('Changelog Generation - Tag Filtering', () => {
  let tmpDir: string;
  const GITHUB_REPO_URL = 'https://github.com/test-org/test-repo';
  const MOCK_DATE_STR = '2023-10-30';
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-tagfilter-test-'));
    execInTmpDir('git init');
    execInTmpDir('git config commit.gpgsign false');
    try { execInTmpDir('git checkout -b main', true); } catch (e) { /* Branch main likely exists */ }
    execInTmpDir('git config user.name "Test User"');
    execInTmpDir('git config user.email "test@example.com"');

    createCommit('chore: Initial commit'); //0
    createCommit('feat: Add user authentication PROJ-123'); //1
    execInTmpDir('git tag v0.1.0'); 

    createCommit('fix: Fix login redirect PROJ-125'); //2
    execInTmpDir('git tag v0.2.0'); 

    createCommit('feat: Add password reset feature PROJ-127'); //3
    execInTmpDir('git tag v0.2.1-schema'); 
    createCommit('fix: Fix URL parsing PROJ-129'); //4
    execInTmpDir('git tag v0.3.0'); 
    
    createCommit('feat(api)!: Introduce new API version BC-BANG-001'); //5
    execInTmpDir('git tag v0.3.1'); 

    createCommit('feat: Important feature JDTA-1'); //6
    createCommit('fix: Fix critical security issue PROJ-131'); //7
    createCommit('feat: Add new dashboard PROJ-132'); //8
    
    execInTmpDir('git tag v0.4.0-beta'); 
    createCommit('feat: Beta feature CF-001'); //9
    execInTmpDir('git tag v0.4.0-rc'); 
    createCommit('fix: RC fix CF-002'); //10
    execInTmpDir('git tag v0.4.0-release'); 
    createCommit('feat: Another feature CF-003'); //11
    execInTmpDir('git tag v0.5.0-experimental'); 
  });

  test('ignores schema tags for versioning (implicitly uses default tagFilter)', async () => {
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      githubRepoUrl: GITHUB_REPO_URL,
    });
    expect(changelog).toMatch(new RegExp(`^# \\[0\\.5\\.0-experimental\\]\\(${GITHUB_REPO_URL}/compare/v0\\.4\\.0-release\\.\\.\\.v0\\.5\\.0-experimental\\) \\(${DATE_REGEX_ESCAPED}\\)\n\n\n`));
    expect(changelog).toContain('### Features\n\n');
    expect(changelog).toMatch(new RegExp(`\\* Another feature CF-003 ${COMMIT_LINK_REGEX}\n`));
    
    expect(changelog).not.toContain('v0.2.1-schema'); 
    expect(changelog).not.toContain('Add password reset feature PROJ-127');
    expect(changelog.endsWith('\n\n')).toBe(true);
  });

  test('uses custom tagFilter function to select specific tags', async () => {
    const customTagFilter = (tag: string): boolean => tag.endsWith('-release') || tag === 'v0.3.1' || tag === 'v0.3.0' || tag === 'v0.2.0';
    const changelog = await generateChangelog({
      repoPath: tmpDir,
      tagFilter: customTagFilter,
      githubRepoUrl: GITHUB_REPO_URL,
    });

    expect(changelog).toMatch(new RegExp(`^# \\[0\\.4\\.0-release\\]\\(${GITHUB_REPO_URL}/compare/v0\\.3\\.1\\.\\.\\.v0\\.4\\.0-release\\) \\(${DATE_REGEX_ESCAPED}\\)\n\n\n`));
    expect(changelog).toContain('### Features\n\n');
    expect(changelog).toMatch(new RegExp(`\\* Important feature JDTA-1 ${COMMIT_LINK_REGEX}\n`));
    expect(changelog).toMatch(new RegExp(`\\* Add new dashboard PROJ-132 ${COMMIT_LINK_REGEX}\n`));
    expect(changelog).toMatch(new RegExp(`\\* Beta feature CF-001 ${COMMIT_LINK_REGEX}\n`));
    
    expect(changelog).toContain('### Bug Fixes\n\n');
    expect(changelog).toMatch(new RegExp(`\\* Fix critical security issue PROJ-131 ${COMMIT_LINK_REGEX}\n`));
    expect(changelog).toMatch(new RegExp(`\\* RC fix CF-002 ${COMMIT_LINK_REGEX}\n`));

    expect(changelog).not.toContain('0.5.0-experimental'); 
    expect(changelog).not.toContain('0.1.0'); 

    const headBeforeCustomUnreleased = execInTmpDir('git rev-parse HEAD');
    createCommit('feat: Unreleased for custom filter CUST-UNRL-001', 'cust_unrl.js');

    const unreleasedChangelog = await generateChangelog({
        repoPath: tmpDir,
        unreleased: true,
        tagFilter: customTagFilter, 
        githubRepoUrl: GITHUB_REPO_URL,
    });
    expect(unreleasedChangelog).toMatch(new RegExp(`^## \\[Unreleased\\]\\(${GITHUB_REPO_URL}/compare/v0\\.4\\.0-release\\.\\.\\.HEAD\\) \\(${DATE_REGEX_ESCAPED}\\)\n\n\n`));
    expect(unreleasedChangelog).toContain('### Features\n\n');
    expect(unreleasedChangelog).toMatch(new RegExp(`\\* Another feature CF-003 ${COMMIT_LINK_REGEX}\n`));
    expect(unreleasedChangelog).toMatch(new RegExp(`\\* Unreleased for custom filter CUST-UNRL-001 ${COMMIT_LINK_REGEX}\n`));
    expect(unreleasedChangelog.endsWith('\n\n')).toBe(true);
    
    execInTmpDir(`git reset --hard ${headBeforeCustomUnreleased}`, true);
  });
});
