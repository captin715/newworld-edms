// 뉴월드 EDMS — 공통 설정
// 주의: 여기에는 공개용(publishable/anon) 키만 넣는다. service_role 키 절대 금지.
//       공개 키는 브라우저용으로 설계되어 있고, 데이터 접근은 RLS가 통제한다.
const EDMS_SUPABASE_URL = 'https://dvkaqsinhzigqceqqvml.supabase.co';
const EDMS_SUPABASE_ANON_KEY = 'sb_publishable_nLSaE1b5e6LCGXfmNfsX1Q_S57pr_wR';

const edmsClient = window.supabase.createClient(EDMS_SUPABASE_URL, EDMS_SUPABASE_ANON_KEY);
