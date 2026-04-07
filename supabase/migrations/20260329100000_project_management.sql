-- 0. 확장 기능 및 공용 함수 정의
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. 프로젝트 기본 테이블
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('SELLER', 'BUYER', 'MATCHED', 'MANUAL')),
    seller_id UUID REFERENCES public.sellers(id) ON DELETE SET NULL,
    buyer_id UUID REFERENCES public.buyers(id) ON DELETE SET NULL,
    entity_name_manual TEXT, -- 수동 입력 시 업체명
    progress_rate INTEGER DEFAULT 0 CHECK (progress_rate >= 0 AND progress_rate <= 100),
    status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED')),
    deadline DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ -- Soft Delete
);

COMMENT ON TABLE public.projects IS 'M&A 프로젝트 관리 메인 테이블';

-- 2. 프로젝트 참여 유저 테이블
CREATE TABLE IF NOT EXISTS public.project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'MEMBER' CHECK (role IN ('MASTER', 'MEMBER')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

-- 3. 시스템 활동 로그 테이블 (Activity Feed)
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL, -- 시스템 자동 이벤트 시 NULL
    event_type TEXT NOT NULL, -- 'MEMBER_ADD', 'PROGRESS_CHANGE', 'STATUS_CHANGE', 'FILE_UPLOAD' 등
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 업무 일지 테이블 (User Journal)
CREATE TABLE IF NOT EXISTS public.work_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 업데이트 시간 트리거 설정
DROP TRIGGER IF EXISTS update_projects_modtime ON public.projects;
CREATE TRIGGER update_projects_modtime BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 6. 비즈니스 로직 트리거: 마지막 마스터 탈퇴 방지
CREATE OR REPLACE FUNCTION public.check_last_master_exit()
RETURNS TRIGGER AS $$
DECLARE
    master_count INTEGER;
BEGIN
    -- 삭제 시도하는 유저가 마스터인지 확인
    IF OLD.role = 'MASTER' THEN
        SELECT count(*) INTO master_count
        FROM public.project_members
        WHERE project_id = OLD.project_id AND role = 'MASTER';

        -- 마스터가 1명뿐인데 삭제/변경 시도 시 에러
        IF master_count <= 1 THEN
            RAISE EXCEPTION '프로젝트에는 최소 1명의 마스터가 있어야 합니다. 권한을 양도한 후 탈퇴하세요.';
        END IF;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_project_member_delete ON public.project_members;
CREATE TRIGGER on_project_member_delete
    BEFORE DELETE ON public.project_members
    FOR EACH ROW EXECUTE FUNCTION public.check_last_master_exit();

-- 7. 비즈니스 로직 트리거: 진행률 100% 시 원본 데이터 자동 완료 처리
CREATE OR REPLACE FUNCTION public.sync_project_completion()
RETURNS TRIGGER AS $$
BEGIN
    -- NEW가 100이고, (OLD가 NULL이 아니며 변경되었거나, INSERT 시점에 바로 100인 경우)
    IF NEW.progress_rate = 100 AND (OLD IS NULL OR OLD.progress_rate < 100) THEN
        -- 프로젝트 상태를 COMPLETED로 변경
        NEW.status = 'COMPLETED';

        -- 연동된 셀러(Seller) 상태 변경
        IF NEW.seller_id IS NOT NULL THEN
            UPDATE public.sellers SET status = '완료' WHERE id = NEW.seller_id;
        END IF;

        -- 연동된 바이어(Buyer) 상태 변경
        IF NEW.buyer_id IS NOT NULL THEN
            UPDATE public.buyers SET status = '완료' WHERE id = NEW.buyer_id;
        END IF;
        
        -- 자동 로그 기록 (activity_logs는 RLS에서 100% 허용됨)
        INSERT INTO public.activity_logs (project_id, event_type, content)
        VALUES (NEW.id, 'STATUS_CHANGE', '진행률이 100%에 도달하여 프로젝트 및 연동 데이터가 자동으로 완료 처리되었습니다.');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_project_progress_100 ON public.projects;
CREATE TRIGGER on_project_progress_100
    BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.sync_project_completion();

-- 8. Row Level Security (RLS) 설정 최적화
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_logs ENABLE ROW LEVEL SECURITY;

-- [A] 삽입 정책 (생성 시 500 에러 방지용)
DROP POLICY IF EXISTS "Authenticated users can create projects" ON public.projects;
CREATE POLICY "Authenticated users can create projects" ON public.projects 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can join projects" ON public.project_members;
CREATE POLICY "Authenticated users can join projects" ON public.project_members 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can create activity logs" ON public.activity_logs;
CREATE POLICY "Authenticated users can create activity logs" ON public.activity_logs 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can create work logs" ON public.work_logs;
CREATE POLICY "Authenticated users can create work logs" ON public.work_logs 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- [B] 조회 및 전체 관리 정책 (참여자 전용)
DROP POLICY IF EXISTS "Members can see their projects" ON public.projects;
CREATE POLICY "Members can see their projects" ON public.projects
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.project_members 
            WHERE project_id = projects.id AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Members can see project details" ON public.project_members;
CREATE POLICY "Members can see project details" ON public.project_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.project_members 
            WHERE project_id = project_members.project_id AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Masters can manage members" ON public.project_members;
CREATE POLICY "Masters can manage members" ON public.project_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.project_members 
            WHERE project_id = project_members.project_id AND user_id = auth.uid() AND role = 'MASTER'
        )
    );

DROP POLICY IF EXISTS "Members can manage logs" ON public.activity_logs;
CREATE POLICY "Members can manage logs" ON public.activity_logs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.project_members 
            WHERE project_id = activity_logs.project_id AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Members can manage work logs" ON public.work_logs;
CREATE POLICY "Members can manage work logs" ON public.work_logs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.project_members 
            WHERE project_id = work_logs.project_id AND user_id = auth.uid()
        )
    );
