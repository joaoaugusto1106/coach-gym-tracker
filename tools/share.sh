#!/bin/bash
# Restart the public link for Coach (server + tunnel), print the URL.
cd "/Users/joaoaugusto/Joao Gym train" || exit 1
pkill -f "dev-server.py" 2>/dev/null
pkill -f "cloudflared tunnel" 2>/dev/null
sleep 1
nohup python3 tools/dev-server.py 8123 > /tmp/coach-dev.log 2>&1 &
sleep 2
nohup cloudflared tunnel --url http://localhost:8123 --no-autoupdate > /tmp/coach-tunnel.log 2>&1 &
echo "starting tunnel..."
for i in $(seq 1 20); do
  U=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/coach-tunnel.log | head -1)
  [ -n "$U" ] && echo "" && echo "  YOUR LINK:  $U" && echo "" && exit 0
  sleep 1
done
echo "tunnel didn't come up — check /tmp/coach-tunnel.log"
