```bash
# install (ubuntu/debian, root)
apt-get update
apt-get install -y git nodejs npm build-essential python3 make g++

cd /root
git clone https://github.com/gccday/dayflow.git
cd /root/dayflow

node -v
npm -v
which node
which npm

npm ci
bash ./daily_flow --set-admin-password
bash ./daily_flow --install-service

systemctl status dayflow.service --no-pager | sed -n '1,20p'
curl -i http://127.0.0.1:21787
```

```bash
# update (keep local tracked changes)
cd /root/dayflow
git pull --ff-only
npm ci
bash ./daily_flow restart

systemctl status dayflow.service --no-pager | sed -n '1,20p'
curl -i http://127.0.0.1:21787
```

```bash
# update (use remote as source of truth)
cd /root/dayflow

cp -a .env ".env.backup.$(date +%F-%H%M%S)" 2>/dev/null || true

git fetch origin
git reset --hard origin/main
git clean -fd -e .env -e '.env.bak*' -e data/ -e .runtime/
git stash clear

npm ci
bash ./daily_flow restart

systemctl status dayflow.service --no-pager | sed -n '1,20p'
curl -i http://127.0.0.1:21787
```

```bash
# ops
cd /root/dayflow

bash ./daily_flow start
bash ./daily_flow stop
bash ./daily_flow restart
bash ./daily_flow status
bash ./daily_flow --set-admin-password

journalctl -u dayflow.service -n 120 --no-pager
journalctl -u dayflow.service -f
tail -n 120 /root/dayflow/.runtime/daily_flow.log
```
