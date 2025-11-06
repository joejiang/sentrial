const winston = require('winston');
const path = require('path');

// 创建日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// 创建 logger 实例
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'https-proxy' },
  transports: [
    // 错误日志文件
    new winston.transports.File({
      filename: '/app/logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // 访问日志文件
    new winston.transports.File({
      filename: '/app/logs/access.log',
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    }),
    
    // 控制台输出
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// 如果不是生产环境，添加调试日志
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.File({
    filename: '/app/logs/debug.log',
    level: 'debug'
  }));
}

module.exports = logger;