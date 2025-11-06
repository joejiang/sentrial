#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

class MFAManager {
  constructor() {
    this.secretsFile = path.join(__dirname, '../data/mfa-secrets.json');
  }

  loadSecrets() {
    if (!fs.existsSync(this.secretsFile)) {
      return {};
    }
    try {
      return JSON.parse(fs.readFileSync(this.secretsFile, 'utf8'));
    } catch (error) {
      console.error('Failed to load secrets:', error.message);
      return {};
    }
  }

  saveSecrets(secrets) {
    const dir = path.dirname(this.secretsFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.secretsFile, JSON.stringify(secrets, null, 2));
  }

  async listUsers() {
    const secrets = this.loadSecrets();
    console.log('👥 MFA Users:');
    console.log('=============');
    
    if (Object.keys(secrets).length === 0) {
      console.log('No users with MFA setup found.');
      return;
    }

    for (const [username, secret] of Object.entries(secrets)) {
      const currentToken = speakeasy.totp({
        secret: secret,
        encoding: 'base32',
        step: 30
      });
      console.log(`📱 ${username}: Current token = ${currentToken}`);
    }
  }

  async generateQR(username) {
    const secrets = this.loadSecrets();
    
    if (!secrets[username]) {
      console.error(`❌ User ${username} not found`);
      return;
    }

    const secret = secrets[username];
    const otpauthUrl = `otpauth://totp/HTTPS%20Proxy%20(${encodeURIComponent(username)})?secret=${secret}&issuer=HTTPS%20Proxy%20Service`;
    
    console.log(`🔐 QR Code for ${username}:`);
    console.log('========================');
    
    const qrString = await QRCode.toString(otpauthUrl, {
      type: 'terminal',
      small: true,
      width: 60
    });
    
    console.log(qrString);
    console.log(`\n🔑 Secret: ${secret}`);
    console.log(`🔗 OTPAUTH URL: ${otpauthUrl}`);
  }

  async addUser(username, secret = null) {
    const secrets = this.loadSecrets();
    
    if (!secret) {
      // Generate new secret
      const generated = speakeasy.generateSecret({
        name: `HTTPS Proxy (${username})`,
        issuer: 'HTTPS Proxy Service',
        length: 32
      });
      secret = generated.base32;
    }

    secrets[username] = secret;
    this.saveSecrets(secrets);
    
    console.log(`✅ Added MFA for user: ${username}`);
    console.log(`🔑 Secret: ${secret}`);
    
    // Generate QR code
    await this.generateQR(username);
  }

  removeUser(username) {
    const secrets = this.loadSecrets();
    
    if (!secrets[username]) {
      console.error(`❌ User ${username} not found`);
      return;
    }

    delete secrets[username];
    this.saveSecrets(secrets);
    
    console.log(`✅ Removed MFA for user: ${username}`);
  }

  async testToken(username, token) {
    const secrets = this.loadSecrets();
    
    if (!secrets[username]) {
      console.error(`❌ User ${username} not found`);
      return;
    }

    const secret = secrets[username];
    const isValid = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 2,
      step: 30
    });

    const expectedToken = speakeasy.totp({
      secret: secret,
      encoding: 'base32',
      step: 30
    });

    console.log(`🧪 Token Test for ${username}:`);
    console.log('============================');
    console.log(`Provided token: ${token}`);
    console.log(`Expected token: ${expectedToken}`);
    console.log(`Result: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
  }
}

async function main() {
  const manager = new MFAManager();
  const command = process.argv[2];
  const username = process.argv[3];
  const token = process.argv[4];

  switch (command) {
    case 'list':
      await manager.listUsers();
      break;
    
    case 'qr':
      if (!username) {
        console.error('Usage: node mfa-manager.js qr <username>');
        process.exit(1);
      }
      await manager.generateQR(username);
      break;
    
    case 'add':
      if (!username) {
        console.error('Usage: node mfa-manager.js add <username> [secret]');
        process.exit(1);
      }
      await manager.addUser(username, token); // token is used as secret here
      break;
    
    case 'remove':
      if (!username) {
        console.error('Usage: node mfa-manager.js remove <username>');
        process.exit(1);
      }
      manager.removeUser(username);
      break;
    
    case 'test':
      if (!username || !token) {
        console.error('Usage: node mfa-manager.js test <username> <token>');
        process.exit(1);
      }
      await manager.testToken(username, token);
      break;
    
    default:
      console.log('🔐 MFA Manager');
      console.log('==============');
      console.log('');
      console.log('Commands:');
      console.log('  list                     - List all users with MFA');
      console.log('  qr <username>           - Generate QR code for user');
      console.log('  add <username> [secret] - Add MFA for user (generates secret if not provided)');
      console.log('  remove <username>       - Remove MFA for user');
      console.log('  test <username> <token> - Test a token for user');
      console.log('');
      console.log('Examples:');
      console.log('  node mfa-manager.js list');
      console.log('  node mfa-manager.js qr dpa_cn');
      console.log('  node mfa-manager.js test dpa_cn 123456');
      break;
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = MFAManager;