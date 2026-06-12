# -*- coding: utf-8 -*-
"""
뉴월드 EDMS Phase 1 — 252건 일괄 등재 스크립트
- 대상: newworld-edms Supabase (dvkaqsinhzigqceqqvml)
- 입력: D:\\EDMS\\EDMS_적재데이터\\documents_적재용_검토본.csv
- 동작: edms_documents INSERT + 문서당 edms_revisions 최초 1건
- 안전: doc_number 중복은 건너뜀(재실행 안전). 표준 라이브러리만 사용.
- 키: .env 파일에서만 읽음 (커밋 금지)
"""
import csv
import json
import os
import sys
import urllib.request
import urllib.error

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = r"D:\EDMS\EDMS_적재데이터\documents_적재용_검토본.csv"
BATCH = 50

def load_env():
    env = {}
    path = os.path.join(BASE_DIR, ".env")
    if not os.path.exists(path):
        sys.exit("[오류] .env 파일이 없습니다: " + path)
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env

ENV = load_env()
URL = ENV.get("SUPABASE_URL", "").rstrip("/")
KEY = ENV.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not URL or not KEY or "붙여넣" in KEY:
    sys.exit("[오류] .env에 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.")

def api(method, path, body=None, prefer=None):
    req = urllib.request.Request(
        URL + "/rest/v1/" + path,
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        method=method,
        headers={
            "apikey": KEY,
            "Authorization": "Bearer " + KEY,
            "Content-Type": "application/json",
            **({"Prefer": prefer} if prefer else {}),
        },
    )
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')}")

def main():
    # 1) CSV 읽기
    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    print(f"CSV 읽기 완료: {len(rows)}건")

    # 2) 이미 등재된 문서번호 조회 (재실행 안전)
    existing = api("GET", "edms_documents?select=doc_number&limit=1000") or []
    existing_nums = {r["doc_number"] for r in existing}
    print(f"기존 등재 건수: {len(existing_nums)}건")

    to_insert, skipped = [], []
    seen = set()
    for r in rows:
        num = r["문서번호"].strip()
        if num in existing_nums or num in seen:
            skipped.append(num)
            continue
        seen.add(num)
        to_insert.append({
            "doc_number": num,
            "title": r["문서명"].strip(),
            "title_en": r["English"].strip() or None,
            "doc_type": r["유형"].strip() or None,
            "series": r["series"].strip(),
            "security_level": int(r["security_level"]),
            "confidentiality": r["confidentiality"].strip(),
            "current_version": r["현재버전"].strip() or "Rev1.00",
            "status": r["상태"].strip() or "등록완료",
            "file_path": r["파일경로"].strip() or None,
            "registered_at": r["제정일"].strip() or None,
        })

    # 3) 문서 INSERT (배치)
    inserted_docs, failed = [], 0
    for i in range(0, len(to_insert), BATCH):
        chunk = to_insert[i:i + BATCH]
        try:
            res = api("POST", "edms_documents", chunk, prefer="return=representation")
            inserted_docs.extend(res)
            print(f"  문서 등재 {i + len(chunk)}/{len(to_insert)}")
        except RuntimeError as e:
            failed += len(chunk)
            print(f"  [실패] 배치 {i}~{i + len(chunk)}: {e}")

    # 4) 문서당 개정 이력 1건 INSERT
    revs = [{
        "document_id": d["id"],
        "version": d["current_version"],
        "revision_date": d["registered_at"],
        "revision_reason": "최초 등재(표준화 등록본 전환)",
        "revised_by": "은하수",
    } for d in inserted_docs]
    rev_ok = 0
    for i in range(0, len(revs), BATCH):
        chunk = revs[i:i + BATCH]
        try:
            api("POST", "edms_revisions", chunk)
            rev_ok += len(chunk)
        except RuntimeError as e:
            print(f"  [이력 실패] 배치 {i}: {e}")

    # 5) 결과 보고
    print("\n===== 결과 =====")
    print(f"문서 등재 성공: {len(inserted_docs)}건")
    print(f"건너뜀(중복): {len(skipped)}건")
    print(f"실패: {failed}건")
    print(f"개정 이력 생성: {rev_ok}건")
    total = api("GET", "edms_documents?select=id&limit=1000")
    print(f"DB 총 문서 수: {len(total)}건")

if __name__ == "__main__":
    main()
