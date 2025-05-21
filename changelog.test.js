// changelog.test.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Path to the changelog generator script to test
const CHANGELOG_GENERATOR_PATH = path.resolve(__dirname, 'changelog.js');

describe('Changelog Generator', () => {
  // Temp directory for Git repository
  let tmpDir;
  
  // Store original working directory
  const originalDir = process.cwd();
  
  // Helper function to execute commands
  const exec = (command, silent = false) => {
    try {
      const output = execSync(command, { encoding: 'utf8', cwd: tmpDir });
      if (!silent) {
        // console.log(`Command: ${command}`);
        // console.log(`Output: ${output}`);
      }
      return output.trim();
    } catch (error) {
      console.error(`Error executing command: ${command}`);
      console.error(error.message);
      throw error;
    }
  };
  
  /**
   * Create a commit in the test repository
   * @param {string} message - Commit message
   * @param {string} content - File content
   * @param {string} fileName - File name
   */
  const createCommit = (message, content, fileName = 'README.md') => {
    const filePath = path.join(tmpDir, fileName);
    
    // Handle directory paths
    if (fileName.endsWith('/')) {
      // Create directory if it doesn't exist
      if (!fs.existsSync(filePath)) {
        fs.mkdirSync(filePath, { recursive: true });
      }
      
      // Create a file inside the directory
      const sampleFilePath = path.join(filePath, 'index.js');
      fs.writeFileSync(sampleFilePath, content);
      
      exec(`git add ${fileName}`);
    } else {
      const dirPath = path.dirname(filePath);
      
      // Create directories if needed
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      // Create or append to file
      if (fs.existsSync(filePath)) {
        fs.appendFileSync(filePath, `\n${content}`);
      } else {
        fs.writeFileSync(filePath, content);
      }
      
      exec(`git add ${fileName}`);
    }
    
    exec(`git commit -m "${message}"`, true);
  };
  
  /**
   * Run the changelog generator with specified options
   * @param {string[]} options - Command line options
   * @returns {string} - Output of the changelog generator
   */
  const runChangelogGenerator = (options = []) => {
    const optionsStr = options.join(' ');
    return exec(`node ${path.join(tmpDir, 'generate-changelog.js')} ${optionsStr}`);
  };
  
  beforeAll(() => {
    // Create a temporary directory for the test repository
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-test-'));
    
    // Copy the changelog generator to the temp directory
    const generatorContent = fs.readFileSync(CHANGELOG_GENERATOR_PATH, 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'generate-changelog.js'), generatorContent);
    exec('chmod +x generate-changelog.js');
    
    // Initialize Git repository
    process.chdir(tmpDir);
    exec('git init');
    exec('git config user.name "Test User"');
    exec('git config user.email "test@example.com"');
    
    // Create initial commit
    createCommit('chore: Initial commit', '# Test Repository\n\nThis is a test repository for changelog generation.');
    
    // Feature commits
    createCommit('feat: Add user authentication', 'Added user authentication functionality', 'auth.js');
    createCommit('feat(api): Add user endpoints PROJ-123', 'Added REST API endpoints for user management', 'api.js');
    createCommit('feat(ui): Implement login form PROJ-124', 'Added login form with validation', 'login.js');
    
    // Create first tag
    exec('git tag v0.1.0');
    
    // Bug fixes
    createCommit('fix: Fix login redirect PROJ-125', 'Fixed redirect after login', 'auth.js');
    createCommit('fix(api): Fix authentication token validation PROJ-126', 'Fixed JWT validation logic', 'api.js');
    
    // Documentation
    createCommit('docs: Update README with setup instructions', 'Added setup instructions to README', 'README.md');
    
    // Create second tag
    exec('git tag v0.2.0');
    
    // More features
    createCommit('feat: Add password reset feature PROJ-127', 'Implemented password reset functionality', 'reset.js');
    createCommit('feat(email): Add email templates PROJ-128', 'Added HTML email templates for notifications', 'emails/');
    
    // Create a schema tag that should be ignored
    exec('git tag v0.2.1-schema');
    
    // Bug fixes and improvements
    createCommit('fix: Fix URL parsing PROJ-129', 'Fixed URL parsing in routing module', 'router.js');
    createCommit('perf: Optimize database queries PROJ-130', 'Optimized database queries for better performance', 'db.js');
    
    // Create third tag
    exec('git tag v0.3.0');
    
    // Create duplicate commits with same JIRA ticket (simulating cherry-picks)
    createCommit('fix: Fix critical security issue PROJ-131', 'Fixed XSS vulnerability', 'security.js');
    createCommit('fix: Fixed security issue in another branch PROJ-131', 'Applied security fix from main branch', 'other.js');
    
    // Additional commits for testing unreleased changes
    createCommit('feat: Add new dashboard PROJ-132', 'Implemented new user dashboard', 'dashboard.js');
  });
  
  afterAll(() => {
    // Change back to original directory
    process.chdir(originalDir);
    
    // Optionally, clean up the temp directory
    // fs.rmSync(tmpDir, { recursive: true, force: true });
    
    // Or just log its location for inspection
    console.log(`Test repository available at: ${tmpDir}`);
  });
  
  // Test for specific tag range
  test('generates changelog for specific tag range', () => {
    const changelog = runChangelogGenerator(['--from=v0.2.0', '--to=v0.3.0']);

    // Verify that the changelog contains expected features
    expect(changelog).toContain('Add password reset feature PROJ-127');
    expect(changelog).toContain('Add email templates PROJ-128');
    
    // Verify that the changelog contains expected fixes
    expect(changelog).toContain('Fix URL parsing PROJ-129');
    
    // Verify that the changelog contains performance improvements
    expect(changelog).toContain('Optimize database queries PROJ-130');
    
    // Verify that the changelog does NOT contain older commits
    expect(changelog).not.toContain('Fix login redirect PROJ-125');
    
    // Verify that the changelog does NOT contain later commits
    expect(changelog).not.toContain('Add new dashboard PROJ-132');
  });
  
  // Test for unreleased changes
  test('generates changelog for unreleased changes', () => {
    const changelog = runChangelogGenerator(['--unreleased']);
    
    // Verify that unreleased changes are included
    expect(changelog).toContain('Add new dashboard PROJ-132');
    
    // Check which security fixes are included
    // Test that both fixes are included (current behavior)
    expect(changelog).toContain('Fix critical security issue PROJ-131');
    expect(changelog).toContain('Fixed security issue in another branch PROJ-131');
    
    // Verify both tickets are included
    const commitLines = changelog.split('\n').filter(line => line.includes('PROJ-131'));
    expect(commitLines.length).toBe(2); // Current behavior shows both
  });
  
  // Test for saving to file
  test('saves changelog to file', () => {
    // Run with save flag
    runChangelogGenerator(['--unreleased', '--save']);
    
    // Verify that the file exists
    const changelogPath = path.join(tmpDir, 'CHANGELOG.md');
    expect(fs.existsSync(changelogPath)).toBe(true);
    
    // Verify file contents
    const fileContent = fs.readFileSync(changelogPath, 'utf8');
    expect(fileContent).toContain('Unreleased');
    expect(fileContent).toContain('Add new dashboard PROJ-132');
  });
  
  // Test that schema tags are ignored
  test('ignores schema tags', () => {
    const allTags = exec('git tag');
    const tagsList = allTags.split('\n');
    
    const changelog = runChangelogGenerator();
    
    // Verify schema tag exists physically
    expect(tagsList).toContain('v0.2.1-schema');
    
    // Verify schema tag is ignored in the changelog logic
    expect(changelog).not.toContain('v0.2.1-schema');
  });
  
  // Test tickets repeated in multiple commits (documenting current behavior)
  test('includes all commits with the same JIRA ticket', () => {
    // Create a new branch for isolation
    exec('git checkout -b test-deduplication');
    
    // Add two commits with the same JIRA ticket
    createCommit('feat: Add feature A PROJ-200', 'Feature A implementation', 'feature-a.js');
    createCommit('feat: Add feature B PROJ-200', 'Feature B implementation', 'feature-b.js');
    
    // Run changelog generator
    const changelog = runChangelogGenerator(['--unreleased']);
    
    // Count lines containing the ticket
    const commitLines = changelog.split('\n').filter(line => line.includes('PROJ-200'));
    
    // Current behavior: both commits are included
    expect(commitLines.length).toBe(2);
    
    // Clean up
    exec('git checkout master 2>/dev/null || git checkout main 2>/dev/null');
  });
});
