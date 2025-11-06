#!/usr/bin/env node

const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const readline = require('readline');

// ASCII Art QR Code generation
async function generateConsoleQR(text) {
  try {
    // Generate QR code as ASCII art
    const qrString = await QRCode.toString(text, {
      type: 'terminal',
      small: true,
      width: 60
    });
    return qrString;
  } catch (error) {
    console.error('Failed to generate QR code:', error.message);
    return null;
  }
}

// Format time remaining display
function formatTimeRemaining(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Get current time info
function getTimeInfo() {
  const now = Date.now();
  const utcTime = Math.floor(now / 1000);
  const timeStep = Math.floor(utcTime / 30);
  const timeRemaining = 30 - (utcTime % 30);
  
  return {
    utcTimestamp: utcTime,
    utcTime: new Date(utcTime * 1000).toISOString(),
    localTime: new Date(now).toISOString(),
    timeStep: timeStep,
    timeRemaining: timeRemaining,
    stepDuration: 30
  };
}

// Generate current TOTP token
function generateToken(secret) {
  const utcTime = Math.floor(Date.now() / 1000);
  return speakeasy.totp({
    secret: secret,
    encoding: 'base32',
    step: 30,
    time: utcTime
  });
}

// Verify TOTP token
function verifyToken(secret, token) {
  const utcTime = Math.floor(Date.now() / 1000);
  const cleanToken = token.replace(/\D/g, '');
  
  return speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: cleanToken,
    window: 2,
    step: 30,
    time: utcTime
  });
}

// Main testing function
async function testMFA() {
  console.log('🔐 MFA Testing Script');
  console.log('=====================\n');

  // Generate a test secret
  const secret = speakeasy.generateSecret({
    name: 'MFA Test (testuser)',
    issuer: 'HTTPS Proxy Test',
    length: 32
  });

  console.log('📱 Generated Test Secret:');
  console.log('========================');
  console.log(`Secret (Base32): ${secret.base32}`);
  console.log(`OTPAUTH URL: ${secret.otpauth_url}\n`);

  // Generate and display QR code
  console.log('📊 QR Code (ASCII):');
  console.log('==================');
  const qrCode = await generateConsoleQR(secret.otpauth_url);
  if (qrCode) {
    console.log(qrCode);
  } else {
    console.log('❌ Failed to generate QR code\n');
  }

  console.log('⚠️  Note: This QR code uses standard 30-second intervals');
  console.log('   Compatible with all standard authenticator apps.\n');

  // Display current time info
  const timeInfo = getTimeInfo();
  console.log('⏰ Current Time Information:');
  console.log('===========================');
  console.log(`UTC Time: ${timeInfo.utcTime}`);
  console.log(`Local Time: ${timeInfo.localTime}`);
  console.log(`Time Step: ${timeInfo.timeStep}`);
  console.log(`Time Remaining: ${formatTimeRemaining(timeInfo.timeRemaining)}`);
  console.log(`Step Duration: ${timeInfo.stepDuration} seconds (30 seconds)\n`);

  // Generate current token
  const currentToken = generateToken(secret.base32);
  console.log('🔢 Current Expected Token:');
  console.log('==========================');
  console.log(`Token: ${currentToken}`);
  console.log(`Valid for: ${formatTimeRemaining(timeInfo.timeRemaining)} more\n`);

  // Interactive testing
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('🧪 Interactive Testing:');
  console.log('=======================');
  console.log('Enter tokens to test verification (type "exit" to quit):');

  const askForToken = () => {
    const timeInfo = getTimeInfo();
    const currentToken = generateToken(secret.base32);
    
    console.log(`\n⏰ Current time: ${new Date().toLocaleTimeString()}`);
    console.log(`🔢 Expected token: ${currentToken}`);
    console.log(`⏳ Time remaining: ${formatTimeRemaining(timeInfo.timeRemaining)}`);
    
    rl.question('\nEnter token to verify: ', (input) => {
      if (input.toLowerCase() === 'exit') {
        console.log('\n👋 Goodbye!');
        rl.close();
        return;
      }

      if (input.toLowerCase() === 'refresh') {
        askForToken();
        return;
      }

      const isValid = verifyToken(secret.base32, input);
      const cleanInput = input.replace(/\D/g, '');
      
      console.log(`\n📝 Test Results:`);
      console.log(`   Input: "${input}" → Cleaned: "${cleanInput}"`);
      console.log(`   Expected: "${currentToken}"`);
      console.log(`   Result: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
      
      if (isValid) {
        console.log('   🎉 Token verification successful!');
      } else {
        console.log('   💡 Tip: Make sure you\'re using the current token');
        console.log('   💡 Tokens are valid for ±6 minutes (window tolerance)');
      }

      console.log('\n📋 Commands: "refresh" to update, "exit" to quit');
      askForToken();
    });
  };

  askForToken();
}

// Auto-refresh demo
async function autoRefreshDemo() {
  console.log('\n🔄 Auto-Refresh Demo (Press Ctrl+C to stop):');
  console.log('============================================');

  const secret = speakeasy.generateSecret({
    name: 'Auto Demo',
    issuer: 'MFA Test',
    length: 32
  });

  let lastToken = '';
  
  const showStatus = () => {
    const timeInfo = getTimeInfo();
    const currentToken = generateToken(secret.base32);
    const changed = currentToken !== lastToken;
    
    console.clear();
    console.log('🔄 MFA Auto-Refresh Demo');
    console.log('========================\n');
    
    console.log(`⏰ UTC Time: ${timeInfo.utcTime}`);
    console.log(`🔢 Current Token: ${currentToken} ${changed ? '🆕 NEW!' : ''}`);
    console.log(`⏳ Time Remaining: ${formatTimeRemaining(timeInfo.timeRemaining)}`);
    console.log(`📊 Progress: ${'█'.repeat(Math.floor((180 - timeInfo.timeRemaining) / 6))}${'░'.repeat(30 - Math.floor((180 - timeInfo.timeRemaining) / 6))}`);
    
    if (changed && lastToken) {
      console.log(`\n🔄 Token changed from ${lastToken} to ${currentToken}`);
    }
    
    lastToken = currentToken;
    console.log('\nPress Ctrl+C to stop...');
  };

  showStatus();
  const interval = setInterval(showStatus, 1000);

  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('\n\n👋 Demo stopped!');
    process.exit(0);
  });
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--demo') || args.includes('-d')) {
    autoRefreshDemo();
  } else {
    testMFA().catch(console.error);
  }
}

module.exports = {
  generateConsoleQR,
  generateToken,
  verifyToken,
  getTimeInfo
};