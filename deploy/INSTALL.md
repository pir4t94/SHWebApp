# Installing EntiaBot on Raspberry Pi (Ubuntu)

Assumes Ubuntu 22.04+ with Node 20+ available.

```bash
# 1. Install Node 20 (if not present)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Clone + install
sudo mkdir -p /home/pi/entiabot && sudo chown pi:pi /home/pi/entiabot
cd /home/pi/entiabot
git clone <your-repo> .
cp .env.example .env.local
nano .env.local   # fill in secrets

# 3. Build
npm ci
npm run build

# 4. Install systemd unit
sudo cp deploy/entiabot.service /etc/systemd/system/entiabot.service
sudo systemctl daemon-reload
sudo systemctl enable --now entiabot.service

# 5. Check
systemctl status entiabot.service
journalctl -u entiabot.service -f
```

After the first install, subsequent deploys from your dev machine:

```bash
./deploy/deploy.sh pi@raspberrypi.local:/home/pi/entiabot
```
