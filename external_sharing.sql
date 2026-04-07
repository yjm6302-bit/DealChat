-- 외부 공유 로그 및 접근 제어 테이블 추가
-- 이 SQL을 Supabase SQL Editor에서 실행해주세요.

-- 1. 외부 공유 로그 테이블
CREATE TABLE IF NOT EXISTS public.external_share_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL, -- 공유 대상 ID (buyer_id, seller_id, company_id)
    item_type TEXT NOT NULL, -- 'buyer', 'seller', 'company'
    sender_id UUID REFERENCES auth.users(id), -- 공유한 사용자 ID
    recipient_name TEXT, -- 공유 대상 (성함)
    recipient_org TEXT, -- 소속
    share_reason TEXT, -- 공유 사유
    share_key TEXT NOT NULL, -- 생성된 난수 키
    expires_at TIMESTAMPTZ NOT NULL, -- 만료 일시 (생성 후 48시간)
    access_count INT DEFAULT 0, -- [New] 접근 횟수
    last_accessed_at TIMESTAMPTZ, -- [New] 마지막 접근 일시
    access_history JSONB DEFAULT '[]', -- [New] 접근 기록 상세
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 외부 공유 접근 로그 테이블 (열람 시점 기록)
CREATE TABLE IF NOT EXISTS public.external_share_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id UUID REFERENCES public.external_share_logs(id) ON DELETE CASCADE,
    accessed_at TIMESTAMPTZ DEFAULT now(),
    ip_address TEXT,
    user_agent TEXT
);

-- 3. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_external_share_logs_item_id ON public.external_share_logs(item_id);
CREATE INDEX IF NOT EXISTS idx_external_share_logs_share_key ON public.external_share_logs(share_key);
CREATE INDEX IF NOT EXISTS idx_external_share_access_share_id ON public.external_share_access_logs(share_id);

-- 4. RLS 설정
ALTER TABLE public.external_share_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_share_access_logs ENABLE ROW LEVEL SECURITY;

-- external_share_logs 정책
-- 비회원 포함 모든 사용자가 share_key로 조회 가능 (외부 공유 키 인증에 필요)
CREATE POLICY "Allow public read by key" ON public.external_share_logs
    FOR SELECT USING (true);

-- 인증된 사용자는 자신의 공유 로그를 생성 가능
CREATE POLICY "Users can insert their own share logs" ON public.external_share_logs
    FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- 비회원 포함 모든 사용자가 access_count 업데이트 가능 (3회 접근 제한 동작에 필요)
CREATE POLICY "Allow public update access count" ON public.external_share_logs
    FOR UPDATE USING (true) WITH CHECK (true);

-- external_share_access_logs 정책
-- 모든 사용자가 접근 로그를 남길 수 있도록 허용
CREATE POLICY "Allow public insert access log" ON public.external_share_access_logs
    FOR INSERT WITH CHECK (true);
