-- DealChat Database Schema v2 (보완본)
-- 정규화와 유연성(JSONB)을 결합한 M&A 관리 시스템 스키마

-- 1. 사용자(계정) 테이블
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL, -- 이메일 주소 (ID)
    name TEXT NOT NULL, -- 이름
    phone TEXT, -- 휴대폰 번호
    company TEXT, -- 소속
    department TEXT, -- 부서
    avatar_url TEXT, -- 프로필 사진 URL
    agree_terms BOOLEAN DEFAULT FALSE, -- 이용약관 동의
    agree_privacy BOOLEAN DEFAULT FALSE, -- 개인정보 처리방침 동의
    agree_marketing BOOLEAN DEFAULT FALSE, -- 마케팅정보 수신 동의
    is_active BOOLEAN DEFAULT TRUE, -- 회원가입 상태 (T: 가입중, F: 탈퇴)
    last_login_at TIMESTAMPTZ, -- 최근 접속일자
    status TEXT DEFAULT 'pending', -- 승인 상태 (pending, approved, rejected)
    role TEXT DEFAULT 'reviewer', -- 사용자 등급 (reviewer, buyer, admin)
    created_at TIMESTAMPTZ DEFAULT NOW(), -- 생성일자
    updated_at TIMESTAMPTZ DEFAULT NOW() -- 수정일자
);

-- 2. 기업 정보 테이블
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- 담당자 ID
    mgmt_status TEXT, -- 관리현황 (발굴 기업, 보육 기업, 투자 기업, 기타)
    name TEXT NOT NULL, -- 기업명
    industry TEXT, -- 산업
    ceo_name TEXT, -- 대표자명
    email TEXT, -- 이메일
    establishment_date DATE, -- 설립일자
    address TEXT, -- 주소
    summary TEXT, -- 회사소개
    investment_info JSONB DEFAULT '[]'::jsonb, -- 투자 정보 (배열: 년도, 단계, 벨유, 금액, 투자자)
    financial_info JSONB DEFAULT '[]'::jsonb, -- 재무 정보 (배열: 년도, 매출, 영업이익, 당기순익, EV/EBITDA)
    financial_analysis TEXT, -- 재무분석
    manager_memo TEXT, -- 담당자 의견
    is_draft BOOLEAN DEFAULT FALSE, -- 비공개 여부
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 질의응답(QNA) 테이블
CREATE TABLE IF NOT EXISTS qna (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- 작성자 ID
    entity_type TEXT, -- 대상 유형 ('company', 'seller', 'buyer' 등)
    entity_id UUID, -- 대상 ID
    question TEXT NOT NULL, -- 질문 내용
    answer TEXT, -- 답변 내용
    status TEXT DEFAULT '대기', -- 처리 상태 (대기, 완료)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 매도자(Seller) 정보 테이블
CREATE TABLE IF NOT EXISTS sellers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE, -- 기업 ID
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- 등록자 ID
    status TEXT DEFAULT '대기', -- 진행 현황 (대기, 진행중, 완료)
    matching_price TEXT, -- 매칭 희망가 (숫자 또는 '협의')
    sale_method TEXT, -- 매도 방식
    sale_info TEXT, -- 매도정보
    manager_memo TEXT, -- 담당자 의견
    is_draft BOOLEAN DEFAULT FALSE, -- 비공개 여부
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 바이어(Buyer) 정보 테이블
CREATE TABLE IF NOT EXISTS buyers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- 등록자 ID
    status TEXT DEFAULT '대기', -- 진행현황 (대기, 진행중, 완료)
    company_name TEXT NOT NULL, -- 기업명
    interest_industry TEXT, -- 관심산업
    manager_name TEXT, -- 담당자
    email TEXT, -- 이메일
    available_funds NUMERIC, -- 가용 자금 (단위: 억원)
    summary TEXT, -- 상세 소개 및 요약
    interest_summary TEXT, -- 매칭 희망 기업 및 요건
    memo TEXT, -- 기타 사항 (메모)
    is_draft BOOLEAN DEFAULT FALSE, -- 비공개 여부
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 파일 관리 테이블 (공통)
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    entity_type TEXT, -- 'company', 'seller', 'buyer', 'qna' 등
    entity_id UUID,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL, -- Supabase Storage 경로
    file_type TEXT, -- 'pdf', 'docx', 'xlsx' 등
    file_size INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 수정 시간(updated_at) 자동 업데이트 트리거 함수
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- 트리거 설정
CREATE TRIGGER update_users_modtime BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_companies_modtime BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_qna_modtime BEFORE UPDATE ON qna FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_sellers_modtime BEFORE UPDATE ON sellers FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_buyers_modtime BEFORE UPDATE ON buyers FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 8. Auth 사용자 가입 시 public.users 프로필 자동 생성 트리거
-- 7. 공유 테이블 (회사/매도/매수 정보 공유)
CREATE TABLE IF NOT EXISTS shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('company', 'seller', 'buyer')),
    item_id UUID NOT NULL,
    memo TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE shares IS '정보 공유 내역';

-- 8. Auth 사용자 가공 시 public.users 프로필 자동 생성/삭제 트리거
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (
        id, 
        email, 
        name, 
        phone, 
        company, 
        department, 
        avatar_url, 
        is_active,
        agree_terms,
        agree_privacy,
        agree_marketing,
        status,
        role
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', '사용자'),
        NEW.raw_user_meta_data->>'phone',
        COALESCE(NEW.raw_user_meta_data->>'company', ''),
        COALESCE(NEW.raw_user_meta_data->>'department', ''),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'img/avatars/default-avatar.png'),
        TRUE,
        COALESCE((NEW.raw_user_meta_data->>'agree_terms')::boolean, FALSE),
        COALESCE((NEW.raw_user_meta_data->>'agree_privacy')::boolean, FALSE),
        COALESCE((NEW.raw_user_meta_data->>'agree_marketing')::boolean, FALSE),
        'pending',
        'reviewer'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.handle_user_delete()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.users WHERE id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 기존 트리거가 있을 경우 삭제 후 재생성
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
    BEFORE DELETE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_user_delete();

-- RLS 우회를 위한 관리자 권한 확인 함수
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 9. Row Level Security (RLS) 설정
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qna ENABLE ROW LEVEL SECURITY;

-- 상세 정책
CREATE POLICY "Users can see themselves or admin sees all"
  ON public.users FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can update themselves or admin updates all"
  ON public.users FOR UPDATE
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can manage their own companies" ON public.companies FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can see shared companies" ON public.companies FOR SELECT USING (EXISTS (SELECT 1 FROM public.shares WHERE item_id = companies.id AND receiver_id = auth.uid()));

CREATE POLICY "Users can manage their own sellers" ON public.sellers FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can see shared sellers" ON public.sellers FOR SELECT USING (EXISTS (SELECT 1 FROM public.shares WHERE item_id = sellers.id AND receiver_id = auth.uid()));

CREATE POLICY "Users can manage their own buyers" ON public.buyers FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can see shared buyers" ON public.buyers FOR SELECT USING (EXISTS (SELECT 1 FROM public.shares WHERE item_id = buyers.id AND receiver_id = auth.uid()));

CREATE POLICY "Users can manage their own shares" ON public.shares FOR ALL USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Anyone can see public listings" ON public.companies FOR SELECT USING (is_draft = FALSE);
CREATE POLICY "Anyone can see public sellers" ON public.sellers FOR SELECT USING (is_draft = FALSE);
CREATE POLICY "Anyone can see public buyers" ON public.buyers FOR SELECT USING (is_draft = FALSE);
