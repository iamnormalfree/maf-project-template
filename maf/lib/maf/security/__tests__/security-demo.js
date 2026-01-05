// ABOUTME: Demonstration of MAF filesystem security effectiveness
// ABOUTME: Shows path traversal blocking and security metrics

const { createSecureWorkspace } = require('../index');

async function demonstrateSecurity() {
  console.log('=== MAF Filesystem Security Demo ===');
  
  const workspace = createSecureWorkspace('demo-task');
  await workspace.initialize();
  
  try {
    console.log('1. Workspace created at:', workspace.getWorkspacePath());
    
    // Test legitimate operations
    console.log('2. Testing legitimate file operations...');
    await workspace.writeFile('package.json', '{"name": "test", "scripts": {"test": "jest"}}');
    await workspace.writeFile('src/index.ts', 'export const test = true;');
    
    const exists = await workspace.exists('package.json');
    console.log('   package.json exists:', exists);
    
    const files = await workspace.listDirectory('src');
    console.log('   Files in src:', files);
    
    // Test security violations
    console.log('3. Testing security violations...');
    
    const tests = [
      { name: 'Path traversal attempt (../../../etc/passwd)', file: '../../../etc/passwd' },
      { name: 'Absolute path attempt (/etc/shadow)', file: '/etc/shadow' },
      { name: 'Windows path attempt (C:/Windows/System32)', file: 'C:/Windows/System32/config' },
      { name: 'Dot dot traversal (../../root/.ssh)', file: '../../root/.ssh/id_rsa' }
    ];
    
    for (const test of tests) {
      try {
        await workspace.readFile(test.file);
        console.log('   SECURITY BREACH:', test.name);
      } catch (error) {
        console.log('   BLOCKED:', test.name);
      }
    }
    
    // Show metrics
    const metrics = workspace.getSecurityMetrics();
    console.log('4. Security Metrics:');
    console.log('   Total operations:', metrics.totalOperations);
    console.log('   Blocked operations:', metrics.blockedOperations);
    const successRate = ((metrics.totalOperations - metrics.blockedOperations) / metrics.totalOperations * 100).toFixed(1);
    console.log('   Success rate:', successRate + '%');
    
    console.log('=== Security Demo Complete ===');
    
  } finally {
    await workspace.cleanup();
  }
}

if (require.main === module) {
  demonstrateSecurity().catch(console.error);
}

module.exports = { demonstrateSecurity };
