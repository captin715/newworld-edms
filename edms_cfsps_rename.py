# -*- coding: utf-8 -*-
"""
뉴월드 EDMS Phase 5 — CFSPS 3.4/3.5 Storage 파일명 변경
- Supabase Storage move API로 4개 객체 이름 변경
- 이미 옮겨졌거나 원본 없음(404)은 건너뜀(재실행 안전)
- 키는 .env에서만
"""
import json
import os
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV = {}
with open(os.path.join(BASE_DIR, ".env"), encoding="utf-8") as f:
    for line in f:
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.strip().split("=", 1)
            ENV[k] = v
URL = ENV["SUPABASE_URL"].rstrip("/")
KEY = ENV["SUPABASE_SERVICE_ROLE_KEY"]

MOVES = [
    ("view/CFSPS-3.4-Spine.pdf", "view/CFSPS-3.4.pdf"),
    ("view/CFSPS-3.5-End-to-End.pdf", "view/CFSPS-3.5.pdf"),
    ("p3/CFSPS-3.4-Spine.docx", "p3/CFSPS-3.4.docx"),
    ("p3/CFSPS-3.5-End-to-End.docx", "p3/CFSPS-3.5.docx"),
]

def move(src, dst):
    body = json.dumps({
        "bucketId": "documents",
        "sourceKey": src,
        "destinationKey": dst,
    }).encode("utf-8")
    req = urllib.request.Request(
        URL + "/storage/v1/object/move",
        data=body, method="POST",
        headers={
            "apikey": KEY,
            "Authorization": "Bearer " + KEY,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as res:
            res.read()
            return "성공"
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", "replace")
        if e.code == 404 or "not found" in msg.lower() or "exist" in msg.lower():
            return f"건너뜀 (원본 없음/이미 처리됨: HTTP {e.code})"
        return f"실패 (HTTP {e.code}: {msg[:120]})"

def main():
    print("=== CFSPS 3.4/3.5 파일명 변경 ===")
    for src, dst in MOVES:
        r = move(src, dst)
        print(f"  {src}\n    → {dst} : {r}")

if __name__ == "__main__":
    main()
