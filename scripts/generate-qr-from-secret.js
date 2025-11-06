#!/usr/bin/env node

const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

async function generateQRFromSecret() {
  console.log('🔐 Generate QR Code from Existing Secret');
  console.log('=====================================\n');

  // Read the MFA secrets file
  const secretsFile = path.join(__dirname, '../data/mfa-secrets.json');
  
  if (!fs.existsSync(secretsFile)) {
    console.error('❌ MFA secrets file not found:', secretsFile);
    process.exit(1);
  }

  try {
    const secrets = JSON.parse(fs.readFileSync(secretsFile, 'utf8'));
    const username = process.argv[2] || 'dpa_cn';
    
    if (!secrets[username]) {
      console.error(`❌ No MFA secret found for user: ${username}`);
      console.log('Available users:', Object.keys(secrets));
      process.exit(1);
    }

    const secret = secrets[username];
    console.log(`📱 User: ${username}`);
    console.log(`🔑 Secret: ${secret}\n`);

    // Generate OTPAUTH URL
    const otpauthUrl = `otpauth://totp/HTTPS%20Proxy%20(${encodeURIComponent(username)})?secret=${secret}&issuer=HTTPS%20Proxy%20Service`;
    
    console.log('🔗 OTPAUTH URL:');
    console.log(otpauthUrl);
    console.log('');

    // Generate QR code
    const qrString = await QRCode.toString(otpauthUrl, {
      type: 'terminal',
      small: true,
      width: 60
    });

    console.log('📊 QR Code (scan with your authenticator app):');
    console.log('==============================================');
    console.log(qrString);

    console.log('📋 Manual Setup Instructions:');
    console.log('=============================');
    console.log('1. Open your authenticator app');
    console.log('2. Choose "Enter a setup key" or "Manual entry"');
    console.log(`3. Account name: HTTPS Proxy (${username})`);
    console.log(`4. Secret key: ${secret}`);
    console.log('5. Time-based: Yes (30 seconds)');
    console.log('6. Save the entry');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  generateQRFromSecret().catch(console.error);
}

module.exports = { generateQRFromSecret };