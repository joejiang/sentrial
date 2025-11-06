// 配置文件 - 处理不同网络模式下的目标地址

const HTTP_PORT = parseInt(process.env.HTTP_PORT) || 8080;
const HTTPS_PORT = HTTP_PORT + 1;

// 根据网络模式确定目标地址
function getProxyTarget() {
  const targetHost = process.env.TARGET_HOST || 'localhost';
  return `http://${targetHost}:${HTTP_PORT}`;
}

// 检测是否在容器中运行
function isRunningInContainer() {
  try {
    const fs = require('fs');
    return fs.existsSync('/.dockerenv');
  } catch (error) {
    return false;
  }
}

// 获取绑定地址
function getBindAddress() {
  // 在容器中且使用 host 网络模式时，绑定到所有接口
  return '0.0.0.0';
}

module.exports = {
  HTTP_PORT,
  HTTPS_PORT,
  getProxyTarget,
  getBindAddress,
  isRunningInContainer
};