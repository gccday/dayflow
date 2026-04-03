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

# 国内 npm 镜像
export NPM_CONFIG_REGISTRY=https://registry.npmmirror.com

# 安装依赖
npm ci --registry="$NPM_CONFIG_REGISTRY"

# 首次运行会自动生成 `.env`
# 设置管理员密码（隐藏输入，自动写入 Argon2 哈希）
bash ./daily_flow --set-admin-password

# 安装并启动 systemd 服务
# 脚本会等待健康检查和 Web 端口就绪后再返回成功
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
