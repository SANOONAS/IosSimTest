#!/bin/sh
# kmp-sim-template-version: 2
set -eu

APK=$(find . -type f -name '*-debug.apk' | head -1)
[ -n "$APK" ] || { echo "No debug APK found"; find . -type f -name '*.apk'; exit 1; }
echo "Installing APK: $APK"
adb install -r "$APK"
adb shell monkey -p sl.volatio.iossimtest -c android.intent.category.LAUNCHER 1

node -e "const{execSync}=require('child_process');const http=require('http');let frame=Buffer.alloc(0);setInterval(()=>{try{frame=execSync('adb exec-out screencap -p',{maxBuffer:10*1024*1024})}catch(e){}},200);http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'multipart/x-mixed-replace;boundary=frame','Cache-Control':'no-cache'});const iv=setInterval(()=>{if(frame.length){res.write('--frame\\r\\nContent-Type:image/png\\r\\n\\r\\n');res.write(frame);res.write('\\r\\n')}},200);req.on('close',()=>clearInterval(iv))}).listen(process.env.STREAM_PORT||3200,()=>console.log('stream ready'))" &

STREAM_READY=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 -o /dev/null "http://127.0.0.1:$STREAM_PORT/"; then
    STREAM_READY=1
    break
  else
    status=$?
    [ "$status" -eq 28 ] && STREAM_READY=1 && break
  fi
  sleep 2
done
[ "$STREAM_READY" -eq 1 ] || { echo "stream never became ready"; exit 1; }
echo "stream started"

env KMP_SIM_GATE_TOKEN="$KMP_SIM_GATE_TOKEN" \
  KMP_SIM_TARGET_PORT="$STREAM_PORT" \
  KMP_SIM_GATE_PORT="$GATE_PORT" \
  nohup node .github/kmp-sim/gate.cjs > gate.log 2>&1 &
GATE_PID=$!

for _ in $(seq 1 30); do
  curl -fsS -o /dev/null "http://127.0.0.1:$GATE_PORT/__kmp-sim/healthz" && break
  kill -0 "$GATE_PID" 2>/dev/null || break
  sleep 1
done
curl -fsS "http://127.0.0.1:$GATE_PORT/__kmp-sim/healthz" || {
  echo "gate never became ready"
  cat gate.log 2>/dev/null || true
  exit 1
}

touch cloudflared.log
curl -fsSL -o cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared
nohup ./cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$GATE_PORT" --logfile cloudflared.log > /dev/null 2>&1 &
CLOUDFLARED_PID=$!

TUNNEL=""
for _ in $(seq 1 60); do
  TUNNEL=$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' cloudflared.log | head -1 || true)
  [ -n "$TUNNEL" ] && break
  kill -0 "$CLOUDFLARED_PID" 2>/dev/null || break
  sleep 2
done
[ -n "$TUNNEL" ] || { echo "cloudflared never became ready"; tail -50 cloudflared.log; exit 1; }

gh api "repos/$GITHUB_REPOSITORY/statuses/$GITHUB_SHA" \
  -f state=success \
  -f "context=$STATUS_CONTEXT" \
  -f "target_url=$TUNNEL" \
  -f "description=Android stream live; hold for ${KMP_SIM_MINUTES}m"

END=$(( $(date +%s) + KMP_SIM_MINUTES * 60 ))
while [ "$(date +%s)" -lt "$END" ]; do
  status=0
  curl -fsS --max-time 2 -o /dev/null "http://127.0.0.1:$STREAM_PORT/" || status=$?
  [ "$status" -eq 0 ] || [ "$status" -eq 28 ] || exit 1
  sleep 15
done
