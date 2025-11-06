const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const logger = require('../utils/logger');
const mfa = require('../utils/mfa');

const router = express.Router();

// 解析用户凭据
function parseUserCredentials() {
  const credentials = process.env.USER_CREDENTIALS;
  if (!credentials) {
    logger.error('USER_CREDENTIALS environment variable not set');
    process.exit(1);
  }

  const [username, passwordHash] = credentials.split(':');
  if (!username || !passwordHash) {
    logger.error('Invalid USER_CREDENTIALS format. Expected: username:password_hash');
    process.exit(1);
  }

  return { username, passwordHash };
}

const { username: validUsername, passwordHash: validPasswordHash } = parseUserCredentials();

// 登录页面
router.get('/login', (req, res) => {
  if (req.session.authenticated) {
    return res.redirect('/');
  }

  // 检查是否需要 MFA
  if (req.session.passwordVerified && req.session.username) {
    const mfaStatus = mfa.getMFAStatus(req.session.username);
    if (mfaStatus.setupRequired) {
      return res.redirect('/auth/mfa-setup');
    } else {
      return res.redirect('/auth/mfa-verify');
    }
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Secure Login - MFA Required</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                margin: 0;
                padding: 0;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .login-container {
                background: white;
                padding: 2rem;
                border-radius: 10px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                width: 100%;
                max-width: 400px;
            }
            .logo {
                text-align: center;
                margin-bottom: 2rem;
            }
            .logo h1 {
                color: #333;
                margin: 0;
                font-size: 1.8rem;
            }
            .form-group {
                margin-bottom: 1rem;
            }
            label {
                display: block;
                margin-bottom: 0.5rem;
                color: #555;
                font-weight: 500;
            }
            input[type="text"], input[type="password"] {
                width: 100%;
                padding: 0.75rem;
                border: 2px solid #ddd;
                border-radius: 5px;
                font-size: 1rem;
                transition: border-color 0.3s;
                box-sizing: border-box;
            }
            input[type="text"]:focus, input[type="password"]:focus {
                outline: none;
                border-color: #667eea;
            }
            .btn {
                width: 100%;
                padding: 0.75rem;
                background: #667eea;
                color: white;
                border: none;
                border-radius: 5px;
                font-size: 1rem;
                cursor: pointer;
                transition: background 0.3s;
            }
            .btn:hover {
                background: #5a6fd8;
            }
            .error {
                color: #e74c3c;
                margin-top: 1rem;
                text-align: center;
            }
            .mfa-info {
                background: #f8f9fa;
                padding: 1rem;
                border-radius: 5px;
                margin-bottom: 1rem;
                border-left: 4px solid #667eea;
            }
            .mfa-info h3 {
                margin: 0 0 0.5rem 0;
                color: #333;
                font-size: 1rem;
            }
            .mfa-info p {
                margin: 0;
                color: #666;
                font-size: 0.9rem;
            }
        </style>
    </head>
    <body>
        <div class="login-container">
            <div class="logo">
                <h1>🔐 Secure Access</h1>
            </div>
            
            <div class="mfa-info">
                <h3>Multi-Factor Authentication Required</h3>
                <p>This service is protected by MFA. Please enter your credentials to continue.</p>
            </div>
            
            <form method="POST" action="/auth/login" autocomplete="on">
                <div class="form-group">
                    <label for="username">Username</label>
                    <input 
                        type="text" 
                        id="username" 
                        name="username" 
                        autocomplete="username"
                        autocapitalize="none"
                        spellcheck="false"
                        required
                        autofocus>
                </div>
                
                <div class="form-group">
                    <label for="password">Password</label>
                    <input 
                        type="password" 
                        id="password" 
                        name="password" 
                        autocomplete="current-password"
                        required>
                </div>
                
                <button type="submit" class="btn" id="login-btn">Sign In</button>
                
                ${req.query.error ? '<div class="error">Invalid credentials. Please try again.</div>' : ''}
            </form>
        </div>
        
        <script>
            // Enhanced keyboard support for login form
            document.addEventListener('DOMContentLoaded', function() {
                const form = document.querySelector('form');
                const usernameInput = document.getElementById('username');
                const passwordInput = document.getElementById('password');
                const submitBtn = document.getElementById('login-btn');
                
                // Handle Enter key on any input field
                function handleEnterKey(event) {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        
                        // If on username field and it's filled, move to password
                        if (event.target === usernameInput && usernameInput.value.trim()) {
                            passwordInput.focus();
                            return;
                        }
                        
                        // If on password field or username is complete, submit form
                        if (event.target === passwordInput || 
                            (event.target === usernameInput && usernameInput.value.trim())) {
                            if (form.checkValidity()) {
                                submitBtn.click();
                            } else {
                                // Focus first invalid field
                                const firstInvalid = form.querySelector(':invalid');
                                if (firstInvalid) firstInvalid.focus();
                            }
                        }
                    }
                }
                
                // Add Enter key listeners
                usernameInput.addEventListener('keydown', handleEnterKey);
                passwordInput.addEventListener('keydown', handleEnterKey);
                
                // Visual feedback for submit button
                submitBtn.addEventListener('click', function() {
                    if (form.checkValidity()) {
                        submitBtn.textContent = 'Signing In...';
                        submitBtn.disabled = true;
                    }
                });
                
                // Prevent double submission
                form.addEventListener('submit', function(e) {
                    if (submitBtn.disabled) {
                        e.preventDefault();
                        return false;
                    }
                    submitBtn.textContent = 'Signing In...';
                    submitBtn.disabled = true;
                });
            });
        </script>
    </body>
    </html>
  `);
});

// 处理登录 (第一步：密码验证)
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  logger.info('Login attempt', {
    username,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  try {
    // 验证用户名和密码
    if (username === validUsername && await bcrypt.compare(password, validPasswordHash)) {
      req.session.passwordVerified = true;
      req.session.username = username;

      logger.info('Password verification successful', {
        username,
        ip: req.ip,
        sessionId: req.sessionID
      });

      // 检查 MFA 状态
      const mfaStatus = mfa.getMFAStatus(username);
      if (mfaStatus.setupRequired) {
        res.redirect('/auth/mfa-setup');
      } else {
        res.redirect('/auth/mfa-verify');
      }
    } else {
      logger.warn('Failed login attempt', {
        username,
        ip: req.ip
      });

      res.redirect('/auth/login?error=1');
    }
  } catch (error) {
    logger.error('Login error', {
      error: error.message,
      username,
      ip: req.ip
    });

    res.redirect('/auth/login?error=1');
  }
});

// MFA 设置页面
router.get('/mfa-setup', async (req, res) => {
  if (!req.session.passwordVerified) {
    return res.redirect('/auth/login');
  }

  try {
    let setupId, qrCodeUrl;

    // 检查是否已有活跃的设置会话
    if (req.session.mfaSetupId && mfa.pendingSetups.has(req.session.mfaSetupId)) {
      // 使用现有的设置
      setupId = req.session.mfaSetupId;
      const setup = mfa.pendingSetups.get(setupId);
      qrCodeUrl = `otpauth://totp/HTTPS%20Proxy%20(${setup.username})?secret=${setup.secret}&issuer=HTTPS%20Proxy%20Service`;
      logger.info('Reusing existing MFA setup', { setupId, username: req.session.username });
    } else {
      // 生成新的设置
      const result = mfa.generateSecret(req.session.username);
      setupId = result.setupId;
      qrCodeUrl = result.qrCodeUrl;
      req.session.mfaSetupId = setupId;
      logger.info('Generated new MFA setup', { setupId, username: req.session.username });
    }

    const qrCodeImage = await mfa.generateQRCode(qrCodeUrl);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
          <title>Setup Multi-Factor Authentication</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
              body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  margin: 0;
                  padding: 0;
                  min-height: 100vh;
                  display: flex;
                  align-items: center;
                  justify-content: center;
              }
              .setup-container {
                  background: white;
                  padding: 2rem;
                  border-radius: 10px;
                  box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                  width: 100%;
                  max-width: 500px;
                  text-align: center;
              }
              .logo h1 {
                  color: #333;
                  margin: 0 0 2rem 0;
                  font-size: 1.8rem;
              }
              .qr-code {
                  margin: 2rem 0;
                  padding: 1rem;
                  background: #f8f9fa;
                  border-radius: 10px;
              }
              .qr-code img {
                  max-width: 200px;
                  height: auto;
              }
              .instructions {
                  text-align: left;
                  background: #e3f2fd;
                  padding: 1.5rem;
                  border-radius: 8px;
                  margin: 1rem 0;
                  border-left: 4px solid #2196f3;
              }
              .instructions h3 {
                  margin: 0 0 1rem 0;
                  color: #1976d2;
              }
              .instructions ol {
                  margin: 0;
                  padding-left: 1.2rem;
              }
              .instructions li {
                  margin-bottom: 0.5rem;
                  color: #333;
              }
              .form-group {
                  margin: 1.5rem 0;
                  text-align: left;
              }
              label {
                  display: block;
                  margin-bottom: 0.5rem;
                  color: #555;
                  font-weight: 500;
              }
              input[type="text"] {
                  width: 100%;
                  padding: 0.75rem;
                  border: 2px solid #ddd;
                  border-radius: 5px;
                  font-size: 1rem;
                  text-align: center;
                  letter-spacing: 0.2em;
                  box-sizing: border-box;
              }
              input[type="text"]:focus {
                  outline: none;
                  border-color: #667eea;
              }
              .btn {
                  width: 100%;
                  padding: 0.75rem;
                  background: #667eea;
                  color: white;
                  border: none;
                  border-radius: 5px;
                  font-size: 1rem;
                  cursor: pointer;
                  transition: background 0.3s;
              }
              .btn:hover {
                  background: #5a6fd8;
              }
              .error {
                  color: #e74c3c;
                  margin-top: 1rem;
                  text-align: center;
              }
          </style>
      </head>
      <body>
          <div class="setup-container">
              <div class="logo">
                  <h1>🔐 Setup Multi-Factor Authentication</h1>
              </div>
              
              <div class="instructions">
                  <h3>📱 Setup Instructions</h3>
                  <ol>
                      <li>Install an authenticator app (Google Authenticator, Authy, etc.)</li>
                      <li>Scan the QR code below with your authenticator app</li>
                      <li><strong>Wait for the code to refresh</strong> in your app (codes change every 30 seconds)</li>
                      <li>Enter the current 6-digit code from your app to complete setup</li>
                  </ol>
                  <div style="background: #fff3cd; padding: 0.75rem; border-radius: 4px; margin-top: 1rem; border: 1px solid #ffeaa7;">
                      <strong>⏰ Important:</strong> Make sure your device time is synchronized. If setup fails, wait for the next code (30 seconds) and try again.
                  </div>
              </div>
              
              <div class="qr-code">
                  <img src="${qrCodeImage}" alt="QR Code for MFA Setup">
                  <div style="margin-top: 1rem; padding: 1rem; background: #f8f9fa; border-radius: 5px; border: 1px solid #dee2e6;">
                      <details>
                          <summary style="cursor: pointer; color: #667eea; font-weight: 500;">Can't scan QR code? Click for manual setup</summary>
                          <div style="margin-top: 1rem; font-family: monospace; word-break: break-all; background: white; padding: 0.5rem; border-radius: 3px; border: 1px solid #ddd;">
                              ${setupId ? mfa.pendingSetups.get(setupId)?.secret || 'Secret not found' : 'No setup session'}
                          </div>
                          <small style="color: #666; display: block; margin-top: 0.5rem;">
                              Copy this secret key into your authenticator app manually
                          </small>
                      </details>
                  </div>
              </div>
              
              <form method="POST" action="/auth/mfa-setup" autocomplete="on">
                  <div class="form-group">
                      <label for="token">Enter 6-digit code from your authenticator app:</label>
                      <input 
                          type="text" 
                          id="token" 
                          name="token" 
                          maxlength="6" 
                          pattern="[0-9]{6}"
                          autocomplete="one-time-code"
                          autocapitalize="none"
                          spellcheck="false"
                          inputmode="numeric"
                          required
                          autofocus>
                  </div>
                  
                  <button type="submit" class="btn" id="setup-btn">Complete Setup</button>
                  
                  ${req.query.error ? '<div class="error">Invalid code. Please try again.</div>' : ''}
              </form>
          </div>
          
          <script>
              // Enhanced keyboard support for MFA setup form
              document.addEventListener('DOMContentLoaded', function() {
                  const form = document.querySelector('form');
                  const tokenInput = document.getElementById('token');
                  const submitBtn = document.getElementById('setup-btn');
                  
                  // Handle Enter key submission
                  tokenInput.addEventListener('keydown', function(event) {
                      if (event.key === 'Enter') {
                          event.preventDefault();
                          if (tokenInput.value.length === 6 && /^[0-9]{6}$/.test(tokenInput.value)) {
                              submitBtn.click();
                          } else {
                              // Visual feedback for invalid input
                              tokenInput.style.borderColor = '#e74c3c';
                              setTimeout(() => {
                                  tokenInput.style.borderColor = '';
                              }, 1000);
                          }
                      }
                  });
                  
                  // Auto-format token input (remove non-digits, limit to 6)
                  tokenInput.addEventListener('input', function(event) {
                      let value = event.target.value.replace(/\D/g, '');
                      if (value.length > 6) value = value.slice(0, 6);
                      event.target.value = value;
                      
                      // Auto-submit when 6 digits are entered
                      if (value.length === 6) {
                          setTimeout(() => {
                              if (document.activeElement === tokenInput) {
                                  submitBtn.click();
                              }
                          }, 500); // Small delay for user to see the complete code
                      }
                  });
                  
                  // Visual feedback for submit button
                  submitBtn.addEventListener('click', function() {
                      if (form.checkValidity() && tokenInput.value.length === 6) {
                          submitBtn.textContent = 'Verifying...';
                          submitBtn.disabled = true;
                      }
                  });
                  
                  // Prevent double submission
                  form.addEventListener('submit', function(e) {
                      if (submitBtn.disabled) {
                          e.preventDefault();
                          return false;
                      }
                      if (tokenInput.value.length === 6) {
                          submitBtn.textContent = 'Verifying...';
                          submitBtn.disabled = true;
                      }
                  });
                  
                  // Focus token input on page load
                  tokenInput.focus();
              });
          </script>
      </body>
      </html>
    `);
  } catch (error) {
    logger.error('MFA setup error', { error: error.message, username: req.session.username });
    res.status(500).send('Internal Server Error');
  }
});

// 处理 MFA 设置
router.post('/mfa-setup', (req, res) => {
  logger.info('MFA setup POST request', {
    passwordVerified: req.session.passwordVerified,
    mfaSetupId: req.session.mfaSetupId,
    username: req.session.username,
    body: req.body
  });

  if (!req.session.passwordVerified || !req.session.mfaSetupId) {
    logger.warn('MFA setup: missing session data', {
      passwordVerified: req.session.passwordVerified,
      mfaSetupId: req.session.mfaSetupId
    });
    return res.redirect('/auth/login');
  }

  const { token } = req.body;
  logger.info('Attempting MFA setup completion', {
    setupId: req.session.mfaSetupId,
    token: token,
    username: req.session.username
  });

  const result = mfa.completeMFASetup(req.session.mfaSetupId, token);

  if (result.success) {
    req.session.authenticated = true;
    req.session.user = req.session.username;
    delete req.session.passwordVerified;
    delete req.session.mfaSetupId;

    logger.info('MFA setup completed and user authenticated', {
      username: req.session.username,
      ip: req.ip
    });

    res.redirect('/');
  } else {
    logger.warn('MFA setup failed', {
      username: req.session.username,
      error: result.error,
      ip: req.ip
    });

    res.redirect('/auth/mfa-setup?error=1');
  }
});

// MFA 验证页面
router.get('/mfa-verify', (req, res) => {
  if (!req.session.passwordVerified) {
    return res.redirect('/auth/login');
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Multi-Factor Authentication</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                margin: 0;
                padding: 0;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .verify-container {
                background: white;
                padding: 2rem;
                border-radius: 10px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                width: 100%;
                max-width: 400px;
            }
            .logo {
                text-align: center;
                margin-bottom: 2rem;
            }
            .logo h1 {
                color: #333;
                margin: 0;
                font-size: 1.8rem;
            }
            .mfa-info {
                background: #f8f9fa;
                padding: 1rem;
                border-radius: 5px;
                margin-bottom: 2rem;
                border-left: 4px solid #28a745;
                text-align: center;
            }
            .mfa-info h3 {
                margin: 0 0 0.5rem 0;
                color: #333;
                font-size: 1rem;
            }
            .mfa-info p {
                margin: 0;
                color: #666;
                font-size: 0.9rem;
            }
            .form-group {
                margin-bottom: 1rem;
            }
            label {
                display: block;
                margin-bottom: 0.5rem;
                color: #555;
                font-weight: 500;
            }
            input[type="text"] {
                width: 100%;
                padding: 0.75rem;
                border: 2px solid #ddd;
                border-radius: 5px;
                font-size: 1.2rem;
                text-align: center;
                letter-spacing: 0.3em;
                box-sizing: border-box;
            }
            input[type="text"]:focus {
                outline: none;
                border-color: #667eea;
            }
            .btn {
                width: 100%;
                padding: 0.75rem;
                background: #28a745;
                color: white;
                border: none;
                border-radius: 5px;
                font-size: 1rem;
                cursor: pointer;
                transition: background 0.3s;
            }
            .btn:hover {
                background: #218838;
            }
            .error {
                color: #e74c3c;
                margin-top: 1rem;
                text-align: center;
            }
            .back-link {
                text-align: center;
                margin-top: 1rem;
            }
            .back-link a {
                color: #667eea;
                text-decoration: none;
                font-size: 0.9rem;
            }
        </style>
    </head>
    <body>
        <div class="verify-container">
            <div class="logo">
                <h1>🔐 Two-Factor Authentication</h1>
            </div>
            
            <div class="mfa-info">
                <h3>✅ Password Verified</h3>
                <p>Please enter the 6-digit code from your authenticator app</p>
                <p><small>Codes change every 30 seconds</small></p>
            </div>
            
            <form method="POST" action="/auth/mfa-verify" autocomplete="on">
                <div class="form-group">
                    <label for="token">Authentication Code:</label>
                    <input 
                        type="text" 
                        id="token" 
                        name="token" 
                        maxlength="6" 
                        pattern="[0-9]{6}"
                        autocomplete="one-time-code"
                        autocapitalize="none"
                        spellcheck="false"
                        inputmode="numeric"
                        required 
                        autofocus>
                </div>
                
                <button type="submit" class="btn" id="verify-btn">Verify & Sign In</button>
                
                ${req.query.error ? '<div class="error">Invalid or expired code. Please try again.</div>' : ''}
            </form>
            
            <div class="back-link">
                <a href="/auth/login">← Back to login</a>
            </div>
        </div>
        
        <script>
            // Enhanced keyboard support for MFA verification form
            document.addEventListener('DOMContentLoaded', function() {
                const form = document.querySelector('form');
                const tokenInput = document.getElementById('token');
                const submitBtn = document.getElementById('verify-btn');
                
                // Handle Enter key submission
                tokenInput.addEventListener('keydown', function(event) {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        if (tokenInput.value.length === 6 && /^[0-9]{6}$/.test(tokenInput.value)) {
                            submitBtn.click();
                        } else {
                            // Visual feedback for invalid input
                            tokenInput.style.borderColor = '#e74c3c';
                            setTimeout(() => {
                                tokenInput.style.borderColor = '';
                            }, 1000);
                        }
                    }
                });
                
                // Auto-format token input (remove non-digits, limit to 6)
                tokenInput.addEventListener('input', function(event) {
                    let value = event.target.value.replace(/\D/g, '');
                    if (value.length > 6) value = value.slice(0, 6);
                    event.target.value = value;
                    
                    // Auto-submit when 6 digits are entered
                    if (value.length === 6) {
                        setTimeout(() => {
                            if (document.activeElement === tokenInput) {
                                submitBtn.click();
                            }
                        }, 500); // Small delay for user to see the complete code
                    }
                });
                
                // Visual feedback for submit button
                submitBtn.addEventListener('click', function() {
                    if (form.checkValidity() && tokenInput.value.length === 6) {
                        submitBtn.textContent = 'Verifying...';
                        submitBtn.disabled = true;
                    }
                });
                
                // Prevent double submission
                form.addEventListener('submit', function(e) {
                    if (submitBtn.disabled) {
                        e.preventDefault();
                        return false;
                    }
                    if (tokenInput.value.length === 6) {
                        submitBtn.textContent = 'Verifying...';
                        submitBtn.disabled = true;
                    }
                });
                
                // Auto-refresh page every 30 seconds to get new expected token time
                let refreshTimer = setTimeout(function() {
                    if (!submitBtn.disabled) { // Only refresh if not currently submitting
                        window.location.reload();
                    }
                }, 30000);
                
                // Clear timer if user interacts with form
                tokenInput.addEventListener('input', function() {
                    clearTimeout(refreshTimer);
                });
                
                // Focus token input on page load
                tokenInput.focus();
            });
        </script>
    </body>
    </html>
  `);
});

// 处理 MFA 验证
router.post('/mfa-verify', (req, res) => {
  logger.info('MFA verify POST request', {
    passwordVerified: req.session.passwordVerified,
    username: req.session.username,
    body: req.body
  });

  if (!req.session.passwordVerified) {
    logger.warn('MFA verify: not password verified');
    return res.redirect('/auth/login');
  }

  const { token } = req.body;
  const username = req.session.username;

  logger.info('Attempting MFA token verification', {
    username,
    token: token,
    ip: req.ip
  });

  if (mfa.verifyToken(username, token)) {
    req.session.authenticated = true;
    req.session.user = username;
    delete req.session.passwordVerified;

    logger.info('Successful MFA authentication', {
      username,
      ip: req.ip,
      sessionId: req.sessionID
    });

    res.redirect('/');
  } else {
    logger.warn('Failed MFA verification', {
      username,
      ip: req.ip
    });

    res.redirect('/auth/mfa-verify?error=1');
  }
});

// MFA 调试信息 (仅开发环境)
router.get('/mfa-debug', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).send('Not Found');
  }

  const debugInfo = {
    session: {
      passwordVerified: req.session.passwordVerified,
      username: req.session.username,
      mfaSetupId: req.session.mfaSetupId,
      authenticated: req.session.authenticated
    },
    mfaManager: {
      pendingSetupsCount: mfa.pendingSetups.size,
      userSecretsCount: mfa.userSecrets.size,
      availableUsers: Array.from(mfa.userSecrets.keys())
    }
  };

  if (req.session.mfaSetupId) {
    const setup = mfa.pendingSetups.get(req.session.mfaSetupId);
    if (setup) {
      const utcTime = Math.floor(Date.now() / 1000);
      const currentToken = require('speakeasy').totp({
        secret: setup.secret,
        encoding: 'base32',
        step: 30,
        time: utcTime
      });

      debugInfo.currentSetup = {
        setupId: req.session.mfaSetupId,
        username: setup.username,
        currentExpectedToken: currentToken,
        utcTimestamp: utcTime,
        utcTime: new Date(utcTime * 1000).toISOString(),
        localTime: new Date().toISOString(),
        timeRemaining: 30 - (utcTime % 30),
        stepDuration: 30,
        secretLength: setup.secret.length
      };
    } else {
      debugInfo.currentSetup = { error: 'Setup session expired' };
    }
  }

  res.json(debugInfo);
});

// MFA 清理端点 (仅开发环境)
router.post('/mfa-cleanup', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).send('Not Found');
  }

  const username = req.session.username || req.body.username;
  if (!username) {
    return res.json({ error: 'No username provided' });
  }

  const cleanedCount = mfa.cleanupUserSetups(username);

  // 也清理会话中的 MFA 设置 ID
  if (req.session.mfaSetupId) {
    delete req.session.mfaSetupId;
  }

  res.json({
    success: true,
    username: username,
    cleanedSetups: cleanedCount,
    sessionCleared: true
  });
});

// MFA 重置端点 (仅开发环境)
router.post('/mfa-reset', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).send('Not Found');
  }

  const username = req.session.username || req.body.username;
  if (!username) {
    return res.json({ error: 'No username provided' });
  }

  const hadMFA = mfa.resetMFA(username);
  
  // 清理会话
  if (req.session.mfaSetupId) {
    delete req.session.mfaSetupId;
  }
  if (req.session.authenticated) {
    delete req.session.authenticated;
  }

  res.json({
    success: true,
    username: username,
    hadMFA: hadMFA,
    message: hadMFA ? 'MFA reset successfully' : 'User had no MFA setup'
  });
});

// 登出
router.post('/logout', (req, res) => {
  const username = req.session.user;

  req.session.destroy((err) => {
    if (err) {
      logger.error('Logout error', { error: err.message, username });
    } else {
      logger.info('User logged out', { username, ip: req.ip });
    }
    res.redirect('/auth/login');
  });
});

module.exports = router;