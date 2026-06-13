# -*- coding: utf-8 -*-
"""
뉴월드 EDMS Phase 3 — PDF 열람본 252개 업로드
- 소스: D:\\EDMS\\EDMS_적재데이터\\pdf_열람본\\{문서번호}.pdf
- 대상: documents 버킷 view/{문서번호}.pdf
- 재실행 안전(x-upsert) / 키는 .env에서만
"""
import glob
import json
import os
import urllib.parse
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_DIR = r"D:\EDMS\EDMS_적재데이터\pdf_kr"  # 한글 정상화 열람본 (2026-06-13 교체)
BUCKET = "documents"

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

def list_view():
    out, offset = [], 0
    while True:
        page = req("POST", f"/storage/v1/object/list/{BUCKET}",
                   {"prefix": "view", "limit": 1000, "offset": offset}) or []
        out.extend(o["name"] for o in page if o.get("id"))
        if len(page) < 1000:
            return out
        offset += 1000

def main():
    pdfs = sorted(glob.glob(os.path.join(PDF_DIR, "*.pdf")))
    print(f"PDF 파일: {len(pdfs)}개")

    ok, fail = 0, []
    for i, src in enumerate(pdfs, 1):
        name = os.path.basename(src)  # {문서번호}.pdf
        key = "view/" + name
        try:
            with open(src, "rb") as fp:
                blob = fp.read()
            quoted = "view/" + urllib.parse.quote(name)
            req("POST", f"/storage/v1/object/{BUCKET}/{quoted}", blob, raw=True, headers={
                "Content-Type": "application/pdf",
                "x-upsert": "true",
            })
            ok += 1
        except (RuntimeError, OSError) as e:
            fail.append((name, str(e)[:160]))
        if i % 50 == 0 or i == len(pdfs):
            print(f"  진행 {i}/{len(pdfs)} (성공 {ok})")

    print("\n===== 결과 =====")
    print(f"업로드 성공: {ok} / 실패: {len(fail)}")
    for name, msg in fail[:10]:
        print(f"  [실패] {name}: {msg}")

    objs = list_view()
    print(f"[검증] 버킷 view/ 객체 수: {len(objs)}개")

if __name__ == "__main__":
    main()
