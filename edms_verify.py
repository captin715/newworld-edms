# -*- coding: utf-8 -*-
"""Task D 검증: 임의 5건 원본 대조 + 이력 건수 + 총계"""
import csv, json, os, random, urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV = {}
with open(os.path.join(BASE_DIR, ".env"), encoding="utf-8") as f:
    for line in f:
        if "=" in line:
            k, v = line.strip().split("=", 1)
            ENV[k] = v
URL, KEY = ENV["SUPABASE_URL"].rstrip("/"), ENV["SUPABASE_SERVICE_ROLE_KEY"]

def get(path):
    req = urllib.request.Request(URL + "/rest/v1/" + path,
        headers={"apikey": KEY, "Authorization": "Bearer " + KEY})
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode("utf-8"))

with open(r"D:\EDMS\EDMS_적재데이터\documents_적재용_검토본.csv", encoding="utf-8-sig", newline="") as f:
    rows = list(csv.DictReader(f))

random.seed()
samples = random.sample(rows, 5)
ok = True
print("[임의 5건 원본 대조]")
for r in samples:
    num = r["문서번호"]
    db = get(f"edms_documents?doc_number=eq.{urllib.parse.quote(num)}&select=*")
    if not db:
        print(f"  ✗ {num}: DB에 없음"); ok = False; continue
    d = db[0]
    checks = [
        ("문서명", r["문서명"], d["title"]),
        ("series", r["series"], d["series"]),
        ("confidentiality", r["confidentiality"], d["confidentiality"]),
        ("security_level", r["security_level"], str(d["security_level"])),
        ("버전", r["현재버전"], d["current_version"]),
    ]
    bad = [f"{n}(CSV:{a} / DB:{b})" for n, a, b in checks if a != b]
    if bad:
        print(f"  ✗ {num}: 불일치 {bad}"); ok = False
    else:
        print(f"  ✓ {num}: 일치 ({d['title']})")

docs = get("edms_documents?select=id")
revs = get("edms_revisions?select=document_id&limit=1000")
uniq = len({r["document_id"] for r in revs})
print(f"\n문서 총수: {len(docs)} / 이력 총수: {len(revs)} / 이력 보유 문서수: {uniq}")
print("문서당 이력 1건:", "✓ 정상" if len(revs) == uniq == len(docs) else "✗ 비정상")
print("\n종합:", "모든 검증 통과 ✓" if ok and len(revs) == uniq == len(docs) else "확인 필요 ✗")
