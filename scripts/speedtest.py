#!/usr/bin/env python3
"""BryTools speed test - uses speedtest-cli for accurate results."""
import subprocess, json, sys

SPEEDTEST = '/Users/bryanrowland/Library/Python/3.14/bin/speedtest-cli'

try:
    r = subprocess.run(
        [SPEEDTEST, '--json'],
        capture_output=True, text=True, timeout=90
    )
    if r.returncode != 0:
        raise Exception(r.stderr.strip() or 'speedtest-cli failed')

    data = json.loads(r.stdout)
    print(json.dumps({
        "down_mbps": round(data['download'] / 1_000_000, 1),
        "up_mbps": round(data['upload'] / 1_000_000, 1),
        "ping": round(data['ping'], 1),
        "server": data.get('server', {}).get('name', ''),
        "sponsor": data.get('server', {}).get('sponsor', ''),
        "isp": data.get('client', {}).get('isp', ''),
    }))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
