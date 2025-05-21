#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Path to the changelog generator script
const CHANGELOG_GENERATOR_PATH = path.resolve(__dirname, 'changelog.js');

// Create a temporary directory
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-test-'));
console.log(`Created temporary directory: ${tmpDir}`);

// Change to the temporary directory
process.chdir(tmpDir);

/**
 * Execute a shell command
 * @param {string} command - Command to execute
 * @param {boolean} silent - Whether to suppress console output
 * @returns {string} - Command output
 */
function exec(command, silent = false) {
  try {
    const output = execSync(command, { encoding: 'utf8' });
    if (!silent) {
      console.log(`Command: ${command}`);
      console.log(`Output: ${output}`);
    }
    return output;
  } catch (error) {
    console.error(`Error executing command: ${command}`);
    console.error(error.message);
    process.exit(1);
  }
}

/**
 * Create a commit
 * @param {string} message - Commit message
 * @param {string} content - File content to commit
 * @param {string} fileName - Name of the file or directory to modify
 */
function createCommit(message, content, fileName = 'README.md') {
  const filePath = path.join(tmpDir, fileName);
  
  // Check if the path ends with a slash (indicating a directory)
  if (fileName.endsWith('/')) {
    // Create directory if it doesn't exist
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(filePath, { recursive: true });
    }
    
    // Create a file inside the directory
    const sampleFilePath = path.join(filePath, 'index.js');
    fs.writeFileSync(sampleFilePath, content);
    
    // Add the entire directory
    exec(`git add ${fileName}`);
  } else {
    const dirPath = path.dirname(filePath);
    
    // Create directory structure if needed
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    if (fs.existsSync(filePath)) {
      // Append to file if it exists
      fs.appendFileSync(filePath, `\n${content}`);
    } else {
      // Create file if it doesn't exist
      fs.writeFileSync(filePath, content);
    }
    
    // Add the file
    exec(`git add ${fileName}`);
  }
  
  exec(`git commit -m "${message}"`, true);
  console.log(`Created commit with message: ${message}`);
}

// Initialize the test repository
console.log('Initializing test repository...');
exec('git init');
exec('git config user.name "Test User"');
exec('git config user.email "test@example.com"');

// Create initial commit
createCommit('chore: Initial commit', '# Test Repository\n\nThis is a test repository for changelog generation.');

// Create a variety of commits with different conventional commit types and JIRA tickets
// Feature commits
createCommit('feat: Add user authentication', 'Added user authentication functionality', 'auth.js');
createCommit('feat(api): Add user endpoints PROJ-123', 'Added REST API endpoints for user management', 'api.js');
createCommit('feat(ui): Implement login form PROJ-124', 'Added login form with validation', 'login.js');

// Create first tag
exec('git tag v0.1.0');
console.log('Created tag: v0.1.0');

// Bug fixes
createCommit('fix: Fix login redirect PROJ-125', 'Fixed redirect after login', 'auth.js');
createCommit('fix(api): Fix authentication token validation PROJ-126', 'Fixed JWT validation logic', 'api.js');

// Documentation
createCommit('docs: Update README with setup instructions', 'Added setup instructions to README', 'README.md');

// Create second tag
exec('git tag v0.2.0');
console.log('Created tag: v0.2.0');

// More features
createCommit('feat: Add password reset feature PROJ-127', 'Implemented password reset functionality', 'reset.js');
createCommit('feat(email): Add email templates PROJ-128', 'Added HTML email templates for notifications', 'emails/');

// Create a schema tag that should be ignored
exec('git tag v0.2.1-schema');
console.log('Created tag: v0.2.1-schema (should be ignored)');

// Bug fixes and improvements
createCommit('fix: Fix URL parsing PROJ-129', 'Fixed URL parsing in routing module', 'router.js');
createCommit('perf: Optimize database queries PROJ-130', 'Optimized database queries for better performance', 'db.js');

// Create third tag
exec('git tag v0.3.0');
console.log('Created tag: v0.3.0');

// Create duplicate commits with same JIRA ticket (simulating cherry-picks)
createCommit('fix: Fix critical security issue PROJ-131', 'Fixed XSS vulnerability', 'security.js');
createCommit('fix: Fixed security issue in another branch PROJ-131', 'Applied security fix from main branch', 'other.js');

// Additional commits for testing unreleased changes
createCommit('feat: Add new dashboard PROJ-132', 'Implemented new user dashboard', 'dashboard.js');

// Copy the generator script to the tmp directory
console.log('\nCopying changelog generator to test directory...');
const generatorContent = fs.readFileSync(CHANGELOG_GENERATOR_PATH, 'utf8');
fs.writeFileSync(path.join(tmpDir, 'generate-changelog.js'), generatorContent);
exec('chmod +x generate-changelog.js');

// Run changelog for specific ranges to ensure we're testing correctly
console.log('\n=== Testing changelog for specific tag range (v0.2.0...v0.3.0) ===\n');
exec('git log v0.2.0..v0.3.0 --oneline');
exec('node generate-changelog.js --from=v0.2.0 --to=v0.3.0');

console.log('\n=== Testing changelog for latest tag (v0.3.0) ===\n');
exec('node generate-changelog.js');

console.log('\n=== Testing changelog for unreleased changes ===\n');
exec('node generate-changelog.js --unreleased');

console.log('\n=== Testing with --save flag ===\n');
exec('node generate-changelog.js --unreleased --save');

// Check if CHANGELOG.md was created
if (fs.existsSync(path.join(tmpDir, 'CHANGELOG.md'))) {
  console.log('\n=== Content of generated CHANGELOG.md file ===\n');
  const changelog = fs.readFileSync(path.join(tmpDir, 'CHANGELOG.md'), 'utf8');
  console.log(changelog);
} else {
  console.error('\nERROR: CHANGELOG.md file was not created.');
}

// Print information about the repository state
console.log('\n=== Repository Information ===');
console.log('All tags:');
exec('git tag -l');
console.log('\nAll commits:');
exec('git log --oneline');

console.log(`\nTest completed! Temporary directory: ${tmpDir}`);
console.log('You can inspect the directory and then delete it manually.');
// exec(`rm -rf ${tmpDir}`);
// console.log('Cleaned up temporary directory');
