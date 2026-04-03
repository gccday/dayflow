# 项目名字
DayFlow

# 部署命令
```bash
# Linux 快速安装（Ubuntu/Debian）
apt-get update
apt-get install -y git nodejs npm

# 拉代码
git clone https://github.com/gccday/dayflow.git
cd dayflow

# 国内镜像
export NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
export PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright

# 安装依赖
npm ci --registry="$NPM_CONFIG_REGISTRY"

# 设置管理员密码（隐藏输入，自动写入 Argon2 哈希）
bash ./daily_flow --set-admin-password

# 安装并启动 systemd 服务
bash ./daily_flow --install-service
```

```bash
# SSH 终端运维命令（进入你实际克隆的目录，例如 `~/dayflow`）
cd /path/to/dayflow
bash ./daily_flow start
bash ./daily_flow stop
bash ./daily_flow status
bash ./daily_flow --set-admin-password
```
