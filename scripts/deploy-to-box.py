#!/usr/bin/env python3
"""WO-323 · Ship the pre-built standalone bundle (in .next/standalone) to the web box + health-gate.
Env: APP, PORT, HEALTH_PATH, BUCKET, INSTANCE_ID, AWS_REGION, GIT_SHA. Uses the runner instance role
(or ambient AWS creds). Called by .github/workflows/deploy-web.yml after `build:standalone`."""
import json, os, subprocess, sys, tempfile, time

E = os.environ
APP, PORT, HEALTH = E["APP"], E["PORT"], E.get("HEALTH_PATH", "/api/health")
BUCKET, IID, REGION = E["BUCKET"], E["INSTANCE_ID"], E.get("AWS_REGION", "ap-south-1")
SHA = E.get("GIT_SHA") or subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()

# Upload the bundle the build step produced.
subprocess.run(["tar", "czf", f"/tmp/{APP}.tgz", "-C", ".next/standalone", "."], check=True)
subprocess.run(["aws", "s3", "cp", f"/tmp/{APP}.tgz", f"s3://{BUCKET}/deploy/web-{APP}-bundle.tgz",
                "--region", REGION], check=True)

BOX = f"""set -uo pipefail
aws s3 cp s3://{BUCKET}/deploy/web-{APP}-bundle.tgz /tmp/{APP}.tgz --region {REGION}
rm -rf /opt/web/{APP}-new && mkdir -p /opt/web/{APP}-new
tar xzf /tmp/{APP}.tgz -C /opt/web/{APP}-new
mkdir -p /opt/web/{APP}-new/.next/cache
id web >/dev/null 2>&1 || useradd --system --home /opt/web --shell /usr/sbin/nologin web
chown -R web:web /opt/web/{APP}-new
/usr/local/bin/pull-ssm-env.sh {APP}
mkdir -p /etc/systemd/system/next-{APP}.service.d
printf '[Service]\\nEnvironment=BUILD_SHA={SHA} BUILD_REF=main\\n' > /etc/systemd/system/next-{APP}.service.d/build-sha.conf
rm -rf /opt/web/{APP}-old; [ -d /opt/web/{APP} ] && mv /opt/web/{APP} /opt/web/{APP}-old
mv /opt/web/{APP}-new /opt/web/{APP}
systemctl daemon-reload; systemctl enable next-{APP} >/dev/null 2>&1 || true; systemctl restart next-{APP}
ok=0
for i in $(seq 1 15); do
  code=$(curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{PORT}{HEALTH} || echo 000)
  [ "$code" = "200" ] && {{ ok=1; break; }}; sleep 2
done
if [ "$ok" != "1" ]; then
  echo HEALTH_FAIL
  [ -d /opt/web/{APP}-old ] && rm -rf /opt/web/{APP} && mv /opt/web/{APP}-old /opt/web/{APP} && systemctl restart next-{APP}
  exit 1
fi
rm -rf /opt/web/{APP}-old
echo "DEPLOY_OK {APP} {SHA}\""""

with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
    json.dump({"commands": [BOX]}, f)
    params = f.name

cid = subprocess.run(["aws", "ssm", "send-command", "--region", REGION, "--instance-ids", IID,
                      "--document-name", "AWS-RunShellScript", "--parameters", f"file://{params}",
                      "--timeout-seconds", "700", "--query", "Command.CommandId", "--output", "text"],
                     capture_output=True, text=True).stdout.strip()
print(f"[deploy] SSM command {cid} → {IID}")
for _ in range(140):
    inv = subprocess.run(["aws", "ssm", "get-command-invocation", "--region", REGION,
                          "--command-id", cid, "--instance-id", IID, "--output", "json"],
                         capture_output=True, text=True)
    try:
        d = json.loads(inv.stdout)
    except Exception:
        time.sleep(5); continue
    if d.get("Status") not in ("InProgress", "Pending", "Delayed"):
        print(d.get("StandardOutputContent", "")[-4000:])
        err = d.get("StandardErrorContent", "")
        if err:
            sys.stderr.write("--- box stderr ---\n" + err[-2000:])
        sys.exit(0 if "DEPLOY_OK" in d.get("StandardOutputContent", "") else 1)
    time.sleep(6)
sys.exit("deploy timed out")
