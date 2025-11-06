const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const https = require('https');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const logger = require('./utils/logger');
const auth = require('./middleware/auth');
const config = require('./config');

const app = express();

// 信任代理设置 - 支持反向代理
app.set('trust proxy', true);

// 配置
const { HTTP_PORT, HTTPS_PORT, getProxyTarget, getBindAddress } = config;
const SESSION_SECRET = process.env.SESSION_SECRET || require('crypto').randomBytes(32).toString('hex');

// 安全中间件
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:"]
        }
    }
}));

// 速率限制 (已禁用)
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15分钟
//   max: 100, // 限制每个IP 100次请求
//   message: 'Too many requests from this IP'
// });
// app.use(limiter);

// 会话配置
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true, // HTTPS only
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24小时
    }
}));

// 请求解析中间件 - 只对非代理路径解析
app.use('/auth', express.json({ limit: '10mb' }));
app.use('/auth', express.urlencoded({ extended: true, limit: '10mb' }));

// 对于代理路径，我们需要特殊处理以保持原始请求体
app.use((req, res, next) => {
  // 跳过已经处理的路径
  if (req.path.startsWith('/auth/') || req.path === '/health' || req.path === '/proxy-status') {
    return next();
  }
  
  // 对于需要代理的路径，解析请求体但保持原始数据
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const contentType = req.get('Content-Type') || '';
    
    if (contentType.includes('application/json')) {
      express.json({ limit: '10mb' })(req, res, next);
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      express.urlencoded({ extended: true, limit: '10mb' })(req, res, next);
    } else {
      // 对于其他类型，直接继续
      next();
    }
  } else {
    next();
  }
});

// 静态文件服务 (仅用于认证页面资源)
app.use('/auth/static', express.static('public'));

// 健康检查端点 (无需认证)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: require('../package.json').version
  });
});

// 代理状态端点 (无需认证)
app.get('/proxy-status', async (req, res) => {
  const proxyTarget = getProxyTarget();
  
  // 检查目标服务连接状态
  let targetStatus = 'unknown';
  let targetError = null;
  
  try {
    const http = require('http');
    const url = require('url');
    const targetUrl = new url.URL(proxyTarget);
    
    await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: targetUrl.hostname,
        port: targetUrl.port,
        path: '/health', // 尝试健康检查端点
        method: 'GET',
        timeout: 5000
      }, (res) => {
        targetStatus = res.statusCode < 400 ? 'healthy' : 'unhealthy';
        resolve();
      });
      
      req.on('error', (err) => {
        targetStatus = 'unreachable';
        targetError = err.message;
        resolve(); // 不要 reject，我们想要返回状态
      });
      
      req.on('timeout', () => {
        targetStatus = 'timeout';
        req.destroy();
        resolve();
      });
      
      req.end();
    });
  } catch (error) {
    targetStatus = 'error';
    targetError = error.message;
  }
  
  res.json({
    proxy: {
      target: proxyTarget,
      status: 'active',
      targetHealth: {
        status: targetStatus,
        error: targetError,
        checkedAt: new Date().toISOString()
      }
    },
    authentication: {
      required: true,
      mfa: true
    },
    features: ['WebSocket', 'HTTP/HTTPS', 'MFA'],
    publicPaths: publicPaths
  });
});

// 认证路由
app.use('/auth', auth);

// 代理中间件 - 需要认证
app.use('/', (req, res, next) => {
    if (!req.session.authenticated && !req.path.startsWith('/auth')) {
        return res.redirect('/auth/login');
    }
    next();
});

// 智能代理中间件配置
const createSmartProxy = () => {
  const proxyTarget = getProxyTarget();
  
  return createProxyMiddleware({
    target: proxyTarget,
    changeOrigin: true,
    ws: true, // 启用 WebSocket 支持
    
    // 路径过滤 - 只排除本地认证路径
    pathFilter: (pathname, req) => {
      // 不代理本地认证相关路径
      if (pathname.startsWith('/auth/')) {
        return false;
      }
      // 不代理健康检查和状态端点
      if (pathname === '/health' || pathname === '/proxy-status') {
        return false;
      }
      // 其他所有路径都代理到目标服务
      return true;
    },
    
    // 连接和超时设置
    timeout: 30000, // 30秒超时
    proxyTimeout: 30000, // 代理超时
    
    // 高级选项
    secure: false, // 允许自签名证书
    followRedirects: true, // 跟随重定向
    
    // 代理选项
    agent: false, // 禁用连接池，每次创建新连接
    headers: {
      'Connection': 'close' // 强制关闭连接，避免连接重用问题
    },
    
    // HTTP 请求处理
    onProxyReq: (proxyReq, req, res) => {
      // 设置连接超时
      proxyReq.setTimeout(30000, () => {
        logger.warn('Proxy request timeout', {
          url: req.url,
          method: req.method,
          target: proxyTarget,
          ip: req.ip
        });
        proxyReq.destroy();
      });
      
      // 保留重要的原始头部
      const importantHeaders = [
        'authorization',
        'content-type',
        'content-length',
        'accept',
        'accept-language',
        'accept-encoding',
        'cache-control',
        'user-agent',
        'referer',
        'origin',
        'cookie'
      ];
      
      // 移除可能干扰的代理头部
      proxyReq.removeHeader('x-forwarded-for');
      proxyReq.removeHeader('x-forwarded-host');
      proxyReq.removeHeader('x-forwarded-proto');
      
      // 设置代理头部
      proxyReq.setHeader('X-Real-IP', req.ip);
      proxyReq.setHeader('X-Forwarded-For', req.ip);
      proxyReq.setHeader('X-Forwarded-Proto', req.protocol);
      proxyReq.setHeader('X-Forwarded-Host', req.get('host'));
      
      // 处理 POST/PUT 请求体
      if (req.body && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
        let bodyData;
        
        if (req.get('Content-Type')?.includes('application/json')) {
          bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Type', 'application/json');
        } else if (req.get('Content-Type')?.includes('application/x-www-form-urlencoded')) {
          bodyData = new URLSearchParams(req.body).toString();
          proxyReq.setHeader('Content-Type', 'application/x-www-form-urlencoded');
        } else {
          bodyData = req.body;
        }
        
        if (bodyData) {
          const bodyBuffer = Buffer.from(bodyData);
          proxyReq.setHeader('Content-Length', bodyBuffer.length);
          proxyReq.write(bodyBuffer);
        }
      }
      
      // 记录详细的代理请求信息
      const logData = {
        method: req.method,
        url: req.url,
        target: proxyTarget,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        user: req.session?.user,
        contentType: req.get('Content-Type'),
        contentLength: req.get('Content-Length'),
        headers: {}
      };
      
      // 记录重要头部
      importantHeaders.forEach(header => {
        const value = req.get(header);
        if (value) {
          logData.headers[header] = header === 'authorization' ? '[REDACTED]' : value;
        }
      });
      
      // 记录请求体信息 (敏感信息脱敏)
      if (req.body && Object.keys(req.body).length > 0) {
        const sanitizedBody = { ...req.body };
        
        // 脱敏敏感字段
        const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
        sensitiveFields.forEach(field => {
          if (sanitizedBody[field]) {
            sanitizedBody[field] = '[REDACTED]';
          }
        });
        
        logData.body = sanitizedBody;
        logData.bodySize = JSON.stringify(req.body).length;
      }
      
      // 记录查询参数
      if (req.query && Object.keys(req.query).length > 0) {
        logData.query = req.query;
      }
      
      logger.info('Proxy HTTP request', logData);
    },
    
    // WebSocket 升级处理
    onProxyReqWs: (proxyReq, req, socket, options, head) => {
      // 设置 WebSocket 头部
      proxyReq.setHeader('X-Real-IP', req.connection.remoteAddress);
      
      logger.info('WebSocket upgrade', {
        url: req.url,
        target: proxyTarget,
        ip: req.connection.remoteAddress,
        origin: req.headers.origin,
        protocols: req.headers['sec-websocket-protocol']
      });
    },
    
    // HTTP 响应处理
    onProxyRes: (proxyRes, req, res) => {
      // 移除可能的缓存头部，确保实时性
      proxyRes.headers['cache-control'] = 'no-cache, no-store, must-revalidate';
      proxyRes.headers['pragma'] = 'no-cache';
      proxyRes.headers['expires'] = '0';
      
      // 记录详细响应信息
      const responseInfo = {
        statusCode: proxyRes.statusCode,
        statusMessage: proxyRes.statusMessage,
        url: req.url,
        method: req.method,
        contentType: proxyRes.headers['content-type'],
        contentLength: proxyRes.headers['content-length'],
        responseTime: Date.now() - req.startTime,
        headers: {}
      };
      
      // 记录重要的响应头部
      const importantResponseHeaders = [
        'content-type',
        'content-length',
        'set-cookie',
        'location',
        'cache-control',
        'etag',
        'last-modified'
      ];
      
      importantResponseHeaders.forEach(header => {
        if (proxyRes.headers[header]) {
          responseInfo.headers[header] = header === 'set-cookie' ? '[REDACTED]' : proxyRes.headers[header];
        }
      });
      
      // 根据状态码选择日志级别
      if (proxyRes.statusCode >= 400) {
        logger.warn('Proxy HTTP response (error)', responseInfo);
      } else {
        logger.info('Proxy HTTP response', responseInfo);
      }
    },
    
    // HTTP 错误处理
    onError: (err, req, res) => {
      const errorInfo = {
        error: err.message,
        code: err.code,
        url: req.url,
        method: req.method,
        target: proxyTarget,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      };
      
      // 根据错误类型提供不同的日志级别和响应
      if (err.code === 'ECONNRESET') {
        logger.warn('Target service connection reset', errorInfo);
      } else if (err.code === 'ECONNREFUSED') {
        logger.error('Target service connection refused', errorInfo);
      } else if (err.code === 'ETIMEDOUT') {
        logger.warn('Target service timeout', errorInfo);
      } else {
        logger.error('Proxy HTTP error', errorInfo);
      }
      
      if (res && !res.headersSent) {
        let statusCode = 502;
        let errorMessage = 'Unable to connect to target service';
        
        // 根据错误类型返回更具体的错误信息
        switch (err.code) {
          case 'ECONNRESET':
            statusCode = 502;
            errorMessage = 'Target service closed the connection unexpectedly';
            break;
          case 'ECONNREFUSED':
            statusCode = 503;
            errorMessage = 'Target service is not available';
            break;
          case 'ETIMEDOUT':
            statusCode = 504;
            errorMessage = 'Target service timeout';
            break;
          default:
            statusCode = 502;
            errorMessage = 'Proxy error occurred';
        }
        
        // 对于 API 请求返回 JSON
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
          res.status(statusCode).json({
            error: 'Proxy Error',
            message: errorMessage,
            code: err.code,
            timestamp: new Date().toISOString()
          });
        } else {
          // 对于浏览器请求返回 HTML 错误页面
          res.status(statusCode).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Service Unavailable</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .error { color: #e74c3c; }
                    .code { background: #f8f9fa; padding: 10px; border-radius: 5px; margin: 20px 0; }
                </style>
            </head>
            <body>
                <h1 class="error">Service Unavailable</h1>
                <p>${errorMessage}</p>
                <div class="code">Error Code: ${err.code}</div>
                <p><a href="/auth/login">Return to Login</a></p>
            </body>
            </html>
          `);
        }
      }
    },
    
    // WebSocket 错误处理
    onProxyReqWsError: (err, req, socket) => {
      logger.error('WebSocket proxy error', {
        error: err.message,
        code: err.code,
        url: req.url,
        target: proxyTarget,
        ip: req.connection.remoteAddress
      });
      
      // 优雅关闭 WebSocket 连接
      if (socket && !socket.destroyed) {
        socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        socket.end();
      }
    },
    
    // WebSocket 关闭处理
    onClose: (res, socket, head) => {
      logger.debug('WebSocket connection closed', {
        ip: socket.remoteAddress
      });
    }
  });
};

const proxyMiddleware = createSmartProxy();

// 配置哪些路径不需要认证就可以代理
const defaultPublicPaths = [
  '/api/auth',
  '/login',
  '/register',
  '/public',
  '/assets',
  '/static',
  '/favicon.ico',
  '/robots.txt'
];

// 从环境变量加载公开路径配置
const getPublicPaths = () => {
  const envPaths = process.env.PUBLIC_PATHS;
  if (envPaths) {
    try {
      const customPaths = JSON.parse(envPaths);
      logger.info('Using custom public paths from environment', { paths: customPaths });
      return customPaths;
    } catch (error) {
      logger.warn('Invalid PUBLIC_PATHS format, using defaults', { error: error.message });
    }
  }
  return defaultPublicPaths;
};

const publicPaths = getPublicPaths();

// 检查路径是否为公开路径
function isPublicPath(path) {
  return publicPaths.some(publicPath => 
    path === publicPath || path.startsWith(publicPath + '/')
  );
}

// 智能代理路由 - 区分公开和私有路径
app.use('/', (req, res, next) => {
  // 添加请求开始时间用于计算响应时间
  req.startTime = Date.now();
  
  // 跳过本地认证路径
  if (req.path.startsWith('/auth/') || req.path === '/health' || req.path === '/proxy-status') {
    return next();
  }
  
  // 公开路径无需认证直接代理
  if (isPublicPath(req.path)) {
    logger.info('Proxying public path', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      contentType: req.get('Content-Type'),
      hasBody: !!(req.body && Object.keys(req.body).length > 0)
    });
    return next();
  }
  
  // 私有路径需要认证
  if (!req.session || !req.session.authenticated) {
    logger.warn('Unauthorized access attempt', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    // 对于 API 请求返回 JSON 错误
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        redirectTo: '/auth/login'
      });
    }
    
    // 对于 WebSocket 升级请求
    if (req.headers.upgrade === 'websocket') {
      logger.warn('WebSocket upgrade without authentication', {
        url: req.url,
        ip: req.ip,
        origin: req.headers.origin
      });
      return res.status(401).end();
    }
    
    // 普通 HTTP 请求重定向到登录页
    return res.redirect('/auth/login');
  }
  
  // 已认证，继续代理
  logger.debug('Proxying authenticated request', {
    path: req.path,
    method: req.method,
    user: req.session.user,
    ip: req.ip
  });
  next();
}, proxyMiddleware);

// SSL 证书加载
function loadSSLCertificates() {
    try {
        const certPath = '/app/certs/cert.pem';
        const keyPath = '/app/certs/key.pem';

        if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
            logger.error('SSL certificates not found in /app/certs/');
            process.exit(1);
        }

        return {
            cert: fs.readFileSync(certPath),
            key: fs.readFileSync(keyPath)
        };
    } catch (error) {
        logger.error('Failed to load SSL certificates', { error: error.message });
        process.exit(1);
    }
}

// 启动 HTTPS 服务器
const sslOptions = loadSSLCertificates();
const server = https.createServer(sslOptions, app);
const bindAddress = getBindAddress();

// WebSocket 升级处理
server.on('upgrade', (request, socket, head) => {
  logger.info('WebSocket upgrade request', {
    url: request.url,
    ip: socket.remoteAddress,
    origin: request.headers.origin
  });
  
  // 让 http-proxy-middleware 处理 WebSocket 升级
  proxyMiddleware.upgrade(request, socket, head);
});

// 服务器错误处理
server.on('error', (error) => {
  logger.error('HTTPS server error', {
    error: error.message,
    code: error.code
  });
});

// 客户端错误处理
server.on('clientError', (err, socket) => {
  logger.warn('Client error', {
    error: err.message,
    ip: socket.remoteAddress
  });
  
  if (socket.writable) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  }
});

server.listen(HTTPS_PORT, bindAddress, () => {
  const proxyTarget = getProxyTarget();
  logger.info(`HTTPS Proxy Server started`, {
    httpsPort: HTTPS_PORT,
    proxyTarget: proxyTarget,
    binding: bindAddress,
    networkMode: process.env.NETWORK_MODE || 'host',
    features: ['HTTP/HTTPS Proxy', 'WebSocket Support', 'MFA Authentication']
  });
});

// 优雅关闭
process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    server.close(() => {
        process.exit(0);
    });
});

module.exports = app;