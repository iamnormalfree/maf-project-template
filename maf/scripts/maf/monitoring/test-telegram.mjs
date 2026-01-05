#!/usr/bin/env node
// ABOUTME: Test script for Telegram notification infrastructure.

import { TelegramNotifier } from './telegram-notifier.mjs';
import { TelegramIntegration } from './telegram-integration.mjs';

async function runTests() {
  console.log('🧪 Testing Telegram Notification Infrastructure\n');

  // Test 1: Telegram Notifier Health Check
  console.log('1. Testing Telegram Notifier Health...');
  const notifier = new TelegramNotifier();
  const notifierHealth = await notifier.healthCheck();
  console.log('✅ Notifier Health:', JSON.stringify(notifierHealth, null, 2));
  console.log('');

  // Test 2: Telegram Integration Health Check  
  console.log('2. Testing Telegram Integration Health...');
  const integration = new TelegramIntegration();
  const integrationHealth = await integration.healthCheck();
  console.log('✅ Integration Health:', JSON.stringify(integrationHealth, null, 2));
  console.log('');

  // Test 3: Test Message (will fallback to console/log)
  console.log('3. Testing Notification Send (with fallback)...');
  const testResult = await notifier.sendNotification('Test notification from MAF', {
    severity: 'info',
    title: '🧪 Test Notification',
    bypassRateLimit: true
  });
  console.log('✅ Test Result:', JSON.stringify(testResult, null, 2));
  console.log('');

  // Test 4: Test Integration Hook
  console.log('4. Testing Integration Hook...');
  const integrationResult = await integration.handleSystemAlert(
    'Test System Alert', 
    'This is a test system alert from integration hooks', 
    'info',
    { component: 'test-suite' }
  );
  console.log('✅ Integration Test Result:', JSON.stringify(integrationResult, null, 2));
  console.log('');

  console.log('🎉 All tests completed! Check console/log output for fallback notifications.');
  console.log('\n📝 Setup Instructions:');
  console.log('1. Set your actual Telegram chat ID in .maf/credentials/telegram.env');
  console.log('2. Start a chat with your bot and send /start');
  console.log('3. Get your chat ID and replace the placeholder');
  console.log('4. Run: npm run maf:notify --test');
}

runTests().catch(error => {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
});
