# DayFlow - A simple GCC check-in script

# 部署命令
```bash
# Linux 快速安装（国内优化 + 自定义管理员密码 + systemd 守护）
git clone https://github.com/gccday/dayflow.git
cd dayflow/bin
cp .env.example .env
export NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
export PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright
read -rsp "Input admin password: " ADMIN_PASS && echo
sed -i "s#^ADMIN_PASSWORD_HASH=.*#ADMIN_PASSWORD_HASH=${ADMIN_PASS}#" .env && unset ADMIN_PASS
npm ci --registry="$NPM_CONFIG_REGISTRY"
./daily_flow --install-service
```

```bash
# SSH 终端运维命令（启动 / 关闭 / 状态 / 修改管理员密码）
cd /opt/dayflow/bin
./daily_flow start
./daily_flow stop
./daily_flow status
./daily_flow --set-admin-password
```
