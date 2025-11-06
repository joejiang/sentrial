#!/bin/bash

# 生成自签名 SSL 证书的脚本
# 仅用于开发和测试环境

CERT_DIR="./certs"
DAYS=365
COUNTRY="CN"
STATE="Beijing"
CITY="Beijing"
ORG="HTTPS Proxy"
OU="IT Department"
CN="localhost"

echo "🔐 Generating SSL certificates for development..."
echo "================================================"

# 创建证书目录
mkdir -p "$CERT_DIR"

# 生成私钥
openssl genrsa -out "$CERT_DIR/key.pem" 2048

# 生成证书签名请求
openssl req -new -key "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.csr" -subj "/C=$COUNTRY/ST=$STATE/L=$CITY/O=$ORG/OU=$OU/CN=$CN"

# 生成自签名证书
openssl x509 -req -in "$CERT_DIR/cert.csr" -signkey "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" -days $DAYS

# 清理临时文件
rm "$CERT_DIR/cert.csr"

echo "✅ SSL certificates generated successfully!"
echo "📁 Certificate files:"
echo "   - Private key: $CERT_DIR/key.pem"
echo "   - Certificate: $CERT_DIR/cert.pem"
echo ""
echo "⚠️  WARNING: These are self-signed certificates for development only!"
echo "   For production, use certificates from a trusted CA."