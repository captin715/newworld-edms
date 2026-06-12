# -*- coding: utf-8 -*-
"""
뉴월드 EDMS Phase 2 — 252개 원본 파일 Storage 업로드
- 버킷: documents (비공개)
- 경로 규칙: p{security_level}/{doc_number}.{ext}
- 업로드 후 edms_documents.storage_path 갱신
- 재실행 안전(x-upsert) / 키는 .env에서만
"""
import csv
import json
import mimetypes
import os
import sys
import urllib.parse
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = r"D:\EDMS\EDMS_적재데이터\documents_적재용_검토본.csv"
SRC_ROOT = r"D:\EDMS"
BUCKET = "documents"

CONTENT_TYPES = {
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pdf": "application/pdf",
}

ENV = {}
with open(os.path.join(BASE_DIR, ".env"), encoding="utf-8") as f:
    for line in f:
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.strip().split("=", 1)
            ENV[k] = v
URL = ENV["SUPABASE_URL"].rstrip("/")
KEY = ENV["SUPABASE_SERVICE_ROLE_KEY"]

def req(method, path, body=None, headers=None, raw=False):
    h = {"apikey": KEY, "Authorization": "Bearer " + KEY}
    if headers:
        h.update(headers)
    data = body if raw else (json.dumps(body).encode("utf-8") if body is not None else None)
    if not raw and body is not None:
        h["Content-Type"] = "application/json"
    r = urllib.request.Request(URL + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r) as res:
            t = res.read().decode("utf-8")
            return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')}")

def list_objects(prefix):
    out, offset = [], 0
    while True:
        page = req("POST", f"/storage/v1/object/list/{BUCKET}",
                   {"prefix": prefix, "limit": 1000, "offset": offset}) or []
        out.extend(o["name"] for o in page if o.get("id"))
        if len(page) < 1000:
            return out
        offset += 1000

def main():
    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    print(f"CSV: {len(rows)}건")

    # 버킷 기존 객체 확인
    existing = set()
    for lv in ("p1", "p2", "p3", "p4"):
        for name in list_objects(lv):
            existing.add(f"{lv}/{name}")
    print(f"버킷 기존 객체: {len(existing)}개" + (f" (예: {sorted(existing)[:3]})" if existing else ""))

    ok, fail, patched = 0, [], 0
    for i, r in enumerate(rows, 1):
        num = r["문서번호"].strip()
        src = os.path.join(SRC_ROOT, r["파일경로"].strip().replace("/", os.sep))
        ext = os.path.splitext(src)[1].lower()
        key = f"p{r['security_level']}/{num}{ext}"
        try:
            with open(src, "rb") as fp:
                blob = fp.read()
            quoted = "/".join(urllib.parse.quote(seg) for seg in key.split("/"))
            req("POST", f"/storage/v1/object/{BUCKET}/{quoted}", blob, raw=True, headers={
                "Content-Type": CONTENT_TYPES.get(ext, "application/octet-stream"),
                "x-upsert": "true",
            })
            ok += 1
            # storage_path 갱신
            req("PATCH", f"/rest/v1/edms_documents?doc_number=eq.{urllib.parse.quote(num)}",
                {"storage_path": key})
            patched += 1
        except (RuntimeError, OSError) as e:
            fail.append((num, str(e)[:160]))
        if i % 50 == 0 or i == len(rows):
            print(f"  진행 {i}/{len(rows)} (성공 {ok})")

    print("\n===== 결과 =====")
    print(f"업로드 성공: {ok} / 실패: {len(fail)} / storage_path 갱신: {patched}")
    for num, msg in fail[:10]:
        print(f"  [실패] {num}: {msg}")

    # 검증: 버킷 객체 수 + storage_path 채워진 행 수
    total_objs = set()
    for lv in ("p1", "p2", "p3", "p4"):
        for name in list_objects(lv):
            total_objs.add(f"{lv}/{name}")
    filled = req("GET", "/rest/v1/edms_documents?select=doc_number&storage_path=not.is.null&limit=1000")
    print(f"\n[검증] 버킷 객체: {len(total_objs)}개 / storage_path 채워진 문서: {len(filled)}건")

if __name__ == "__main__":
    main()
