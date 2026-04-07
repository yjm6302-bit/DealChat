-- ============================================================
-- Fix: RLS Infinite Recursion on projects / project_members
-- ============================================================
-- 원인: project_members 정책이 project_members 자기 자신을 조회하여 무한 재귀 발생
-- 해결: SECURITY DEFINER 함수로 RLS를 우회하는 멤버십 체크 함수를 만들어 사용

-- 0. projects 테이블에 created_by 컬럼 추가 (없는 경우)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- 1. SECURITY DEFINER 헬퍼 함수 생성 (RLS 우회하여 재귀 방지)
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_master(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND user_id = auth.uid() AND role = 'MASTER'
  );
$$;

-- 2. 기존 재귀 정책 제거
DROP POLICY IF EXISTS "Members can see their projects" ON public.projects;
DROP POLICY IF EXISTS "Members can see project details" ON public.project_members;
DROP POLICY IF EXISTS "Masters can manage members" ON public.project_members;
DROP POLICY IF EXISTS "Members can manage logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Members can manage work logs" ON public.work_logs;

-- 3. projects 정책 재작성
-- 생성자 또는 멤버인 경우 조회/수정 가능
DROP POLICY IF EXISTS "Creators can access own projects" ON public.projects;
CREATE POLICY "Creators can access own projects" ON public.projects
    FOR ALL USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Members can access their projects" ON public.projects;
CREATE POLICY "Members can access their projects" ON public.projects
    FOR ALL USING (public.is_project_member(id));

-- 4. project_members 정책 재작성 (SECURITY DEFINER 함수 사용으로 재귀 제거)
DROP POLICY IF EXISTS "Members can view project members" ON public.project_members;
CREATE POLICY "Members can view project members" ON public.project_members
    FOR SELECT USING (public.is_project_member(project_id));

DROP POLICY IF EXISTS "Masters can manage project members" ON public.project_members;
CREATE POLICY "Masters can manage project members" ON public.project_members
    FOR ALL USING (public.is_project_master(project_id));

-- 5. activity_logs / work_logs 정책 재작성
DROP POLICY IF EXISTS "Members can access activity logs" ON public.activity_logs;
CREATE POLICY "Members can access activity logs" ON public.activity_logs
    FOR ALL USING (public.is_project_member(project_id));

DROP POLICY IF EXISTS "Members can access work logs" ON public.work_logs;
CREATE POLICY "Members can access work logs" ON public.work_logs
    FOR ALL USING (public.is_project_member(project_id));

-- 6. 프로젝트 생성 직후 project_members 삽입 전에도 조회 가능하도록 INSERT 정책 확인
-- (기존 "Authenticated users can create projects" 정책으로 INSERT 자체는 허용됨)
-- SELECT는 created_by 정책이 커버하므로 OK

-- 7. projects.status CHECK 제약 한국어 값으로 교체
-- 기존 'ACTIVE','ON_HOLD','COMPLETED','CANCELLED' → '대기','진행중','완료' 허용
ALTER TABLE public.projects
    DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE public.projects
    ADD CONSTRAINT projects_status_check
    CHECK (status IN ('대기', '진행중', '완료'));

-- 기존 영문 status 값을 한국어로 일괄 변환 (데이터 정합성)
UPDATE public.projects SET status = '대기'   WHERE status = 'ACTIVE'    OR status = 'ON_HOLD';
UPDATE public.projects SET status = '완료'   WHERE status = 'COMPLETED' OR status = 'CANCELLED';
UPDATE public.projects SET status = '대기'   WHERE status NOT IN ('대기', '진행중', '완료');

-- 8. sellers / buyers 테이블 업데이트 권한 - 프로젝트 마스터도 허용
-- 연동된 프로젝트의 마스터가 상태 변경(status) 및 연동 해제 시 해당 엔티티도 업데이트해야 하므로
-- 기존 소유자(user_id) 정책에 더해 프로젝트 마스터 정책을 추가합니다.

-- sellers 테이블
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can manage sellers" ON public.sellers;
CREATE POLICY "Owners can manage sellers" ON public.sellers
    FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Project masters can update seller status" ON public.sellers;
CREATE POLICY "Project masters can update seller status" ON public.sellers
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.project_members pm ON pm.project_id = p.id
            WHERE p.seller_id = sellers.id
              AND pm.user_id = auth.uid()
              AND pm.role = 'MASTER'
        )
    );

-- buyers 테이블
ALTER TABLE public.buyers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can manage buyers" ON public.buyers;
CREATE POLICY "Owners can manage buyers" ON public.buyers
    FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Project masters can update buyer status" ON public.buyers;
CREATE POLICY "Project masters can update buyer status" ON public.buyers
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.project_members pm ON pm.project_id = p.id
            WHERE p.buyer_id = buyers.id
              AND pm.user_id = auth.uid()
              AND pm.role = 'MASTER'
        )
    );
