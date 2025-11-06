#!/usr/bin/env node

// 用于导出 MFA 密钥的脚本，便于备份和迁移

const mfa = require('../src/utils/mfa');

console.log('🔐 MFA Secrets Export Tool');
console.log('===========================\n');

try {
  const secrets = mfa.exportSecrets();
  
  if (secrets === '{}') {
    console.log('❌ No MFA secrets found.');
    console.log('Users need to set up MFA first by logging in.');
  } else {
    console.log('✅ Current MFA secrets:');
    console.log('======================');
    console.log(`MFA_SECRETS=${secrets}`);
    console.log('\n📋 Copy the above line to your .env file or docker-compose.yml');
    console.log('⚠️  Keep these secrets secure - they provide access to your accounts!');
  }
} catch (error) {
  console.error('❌ Error exporting MFA secrets:', error.message);
  process.exit(1);
}