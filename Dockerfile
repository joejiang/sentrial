FROM node:18-alpine

# 设置时区为 UTC
ENV TZ=UTC
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm install --production

# 复制源代码
COPY src/ ./src/
# COPY public/ ./public/

# 创建必要的目录
RUN mkdir -p /app/certs /app/logs

# 暴露端口 (将通过环境变量动态设置)
EXPOSE 8081

# 设置默认环境变量
ENV HTTP_PORT=8080
ENV NODE_ENV=dev

# 启动应用
CMD ["npm", "start"]
