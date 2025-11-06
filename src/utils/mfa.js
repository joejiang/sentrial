const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

class MFAManager {
  constructor() {
    this.pendingSetups = new Map(); // 临时存储待设置的 MFA 密钥
    this.userSecrets = new Map(); // 存储用户的 MFA 密钥 (生产环境应使用数据库)

    // 从环境变量加载已有的 MFA 密钥
    this.loadUserSecrets();
  }

  // 从环境变量或文件加载用户 MFA 密钥
  loadUserSecrets() {
    // 首先尝试从文件加载
    this.loadFromFile();
    
    // 然后从环境变量加载（会覆盖文件中的相同用户）
    const mfaSecrets = process.env.MFA_SECRETS;
    if (mfaSecrets) {
      try {
        const secrets = JSON.parse(mfaSecrets);
        Object.entries(secrets).forEach(([username, secret]) => {
          this.userSecrets.set(username, secret);
        });
        logger.info('Loaded MFA secrets from environment for users', {
          users: Object.keys(secrets)
        });
      } catch (error) {
        logger.error('Failed to parse MFA_SECRETS', { error: error.message });
      }
    }
  }

  // 从文件加载 MFA 密钥
  loadFromFile() {
    const fs = require('fs');
    const path = require('path');
    const dataDir = '/app/data';
    const secretsFile = path.join(dataDir, 'mfa-secrets.json');

    try {
      // 确保数据目录存在
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        logger.info('Created MFA data directory', { dataDir });
      }

      // 尝试读取密钥文件
      if (fs.existsSync(secretsFile)) {
        const fileContent = fs.readFileSync(secretsFile, 'utf8');
        const secrets = JSON.parse(fileContent);
        
        Object.entries(secrets).forEach(([username, secret]) => {
          this.userSecrets.set(username, secret);
        });
        
        logger.info('Loaded MFA secrets from file', {
          file: secretsFile,
          users: Object.keys(secrets)
        });
      } else {
        logger.info('No MFA secrets file found, starting fresh', { secretsFile });
      }
    } catch (error) {
      logger.error('Failed to load MFA secrets from file', {
        error: error.message,
        file: secretsFile
      });
    }
  }

  // 保存 MFA 密钥到文件
  saveToFile() {
    const fs = require('fs');
    const path = require('path');
    const dataDir = '/app/data';
    const secretsFile = path.join(dataDir, 'mfa-secrets.json');

    try {
      // 确保数据目录存在
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // 将 Map 转换为普通对象
      const secrets = {};
      this.userSecrets.forEach((secret, username) => {
        secrets[username] = secret;
      });

      // 写入文件
      fs.writeFileSync(secretsFile, JSON.stringify(secrets, null, 2), 'utf8');
      
      logger.info('Saved MFA secrets to file', {
        file: secretsFile,
        users: Object.keys(secrets)
      });
    } catch (error) {
      logger.error('Failed to save MFA secrets to file', {
        error: error.message,
        file: secretsFile
      });
    }
  }

  // 生成新的 MFA 密钥
  // 清理用户的旧设置会话
  cleanupUserSetups(username) {
    const toDelete = [];
    this.pendingSetups.forEach((setup, setupId) => {
      if (setup.username === username) {
        toDelete.push(setupId);
      }
    });
    
    toDelete.forEach(setupId => {
      this.pendingSetups.delete(setupId);
      logger.info('Cleaned up old MFA setup', { setupId, username });
    });
    
    return toDelete.length;
  }

  generateSecret(username) {
    logger.info('Generating MFA secret', { username });

    // 清理该用户的旧设置
    const cleanedCount = this.cleanupUserSetups(username);
    if (cleanedCount > 0) {
      logger.info('Cleaned up old setups before generating new one', { username, cleanedCount });
    }

    const secret = speakeasy.generateSecret({
      name: `HTTPS Proxy (${username})`,
      issuer: 'HTTPS Proxy Service',
      length: 32
    });

    const setupId = uuidv4();
    this.pendingSetups.set(setupId, {
      username,
      secret: secret.base32,
      timestamp: Date.now()
    });

    logger.info('MFA secret generated', {
      username,
      setupId,
      secretLength: secret.base32.length,
      otpauthUrl: secret.otpauth_url
    });

    // 清理过期的设置请求 (30分钟)
    setTimeout(() => {
      this.pendingSetups.delete(setupId);
      logger.info('Auto-cleaned expired MFA setup', { setupId, username });
    }, 30 * 60 * 1000);

    return {
      setupId,
      secret: secret.base32,
      qrCodeUrl: secret.otpauth_url
    };
  }

  // 生成 QR 码
  async generateQRCode(otpauthUrl) {
    try {
      return await QRCode.toDataURL(otpauthUrl);
    } catch (error) {
      logger.error('Failed to generate QR code', { error: error.message });
      throw error;
    }
  }

  // 验证 TOTP 令牌
  verifyToken(username, token) {
    const secret = this.userSecrets.get(username);
    if (!secret) {
      logger.warn('No MFA secret found for user', { username });
      return false;
    }

    // 清理输入的令牌（移除空格和非数字字符）
    const cleanToken = token.replace(/\D/g, '');

    if (cleanToken.length !== 6) {
      logger.warn('Invalid token length', { username, tokenLength: cleanToken.length });
      return false;
    }

    // 使用 UTC 时间进行 TOTP 验证
    const utcTime = Math.floor(Date.now() / 1000);

    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: cleanToken,
      window: 2, // 前后2个时间窗口（1分钟容差）
      step: 30, // 30秒步长
      time: utcTime // 明确使用 UTC 时间戳
    });

    // 生成当前期望的令牌用于调试
    const expectedToken = speakeasy.totp({
      secret: secret,
      encoding: 'base32',
      step: 30,
      time: utcTime
    });

    logger.info('MFA token verification', {
      username,
      providedToken: cleanToken,
      expectedToken: expectedToken,
      verified,
      utcTimestamp: utcTime,
      utcTime: new Date(utcTime * 1000).toISOString(),
      timeStep: Math.floor(utcTime / 30),
      timeRemaining: 30 - (utcTime % 30),
      secretExists: !!secret,
      secretLength: secret ? secret.length : 0
    });

    return verified;
  }

  // 完成 MFA 设置
  completeMFASetup(setupId, token) {
    logger.info('Completing MFA setup', { setupId, tokenProvided: token });

    const setup = this.pendingSetups.get(setupId);
    if (!setup) {
      logger.warn('Invalid or expired MFA setup ID', {
        setupId,
        availableSetups: Array.from(this.pendingSetups.keys())
      });
      return { success: false, error: 'Invalid or expired setup' };
    }

    // 清理输入的令牌
    const cleanToken = token.replace(/\D/g, '');

    if (cleanToken.length !== 6) {
      logger.warn('Invalid token length during setup', {
        username: setup.username,
        tokenLength: cleanToken.length,
        setupId
      });
      return { success: false, error: 'Token must be 6 digits' };
    }

    // 使用 UTC 时间进行 TOTP 验证
    const utcTime = Math.floor(Date.now() / 1000);

    const verified = speakeasy.totp.verify({
      secret: setup.secret,
      encoding: 'base32',
      token: cleanToken,
      window: 2, // 前后2个时间窗口（1分钟容差）
      step: 30, // 30秒步长
      time: utcTime // 明确使用 UTC 时间戳
    });

    if (!verified) {
      // 添加调试信息 - 也使用 UTC 时间
      const currentToken = speakeasy.totp({
        secret: setup.secret,
        encoding: 'base32',
        step: 30,
        time: utcTime
      });

      logger.warn('Invalid MFA token during setup', {
        username: setup.username,
        setupId,
        providedToken: cleanToken,
        expectedToken: currentToken,
        utcTimestamp: utcTime,
        utcTime: new Date(utcTime * 1000).toISOString(),
        localTime: new Date().toISOString()
      });
      return { success: false, error: 'Invalid token - please check your authenticator app time sync' };
    }

    // 保存用户的 MFA 密钥
    this.userSecrets.set(setup.username, setup.secret);
    this.pendingSetups.delete(setupId);

    // 持久化到文件
    this.saveToFile();

    logger.info('MFA setup completed', {
      username: setup.username,
      setupId
    });

    return { success: true };
  }

  // 检查用户是否已设置 MFA
  hasMFAEnabled(username) {
    return this.userSecrets.has(username);
  }

  // 获取用户的 MFA 状态
  getMFAStatus(username) {
    return {
      enabled: this.hasMFAEnabled(username),
      setupRequired: !this.hasMFAEnabled(username)
    };
  }

  // 重置用户的 MFA (管理员功能)
  resetMFA(username) {
    const hadMFA = this.userSecrets.has(username);
    this.userSecrets.delete(username);

    // 持久化更改到文件
    this.saveToFile();

    logger.info('MFA reset for user', { username, hadMFA });
    return hadMFA;
  }

  // 导出所有用户的 MFA 密钥 (用于持久化)
  exportSecrets() {
    const secrets = {};
    this.userSecrets.forEach((secret, username) => {
      secrets[username] = secret;
    });
    return JSON.stringify(secrets);
  }

  // 获取当前 UTC 时间信息 (调试用)
  getTimeInfo() {
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
      stepDuration: 30,
      timezone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }

  // 生成当前时间的 TOTP 令牌 (调试用)
  generateCurrentToken(secret) {
    const utcTime = Math.floor(Date.now() / 1000);
    return speakeasy.totp({
      secret: secret,
      encoding: 'base32',
      step: 30,
      time: utcTime
    });
  }
}

module.exports = new MFAManager();