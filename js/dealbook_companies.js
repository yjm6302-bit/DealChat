import { addAiResponse, searchVectorDB } from './AI_Functions.js';
import { APIcall } from './APIcallFunction.js';
import { filetypecheck, fileUpload, downloadTextFile } from './File_Functions.js';
import { checkAuth, updateHeaderProfile, initUserMenu, hideLoader, showLoader, resolveAvatarUrl, DEFAULT_MANAGER } from './auth_utils.js';
import { checkNdaStatus, initNdaGate } from './sharing_utils.js';
import { escapeForDisplay, tryRepairJson, resolveIndustry, resolveMgmtStatus, buildFinancialString, buildInvestmentString, buildChatContext } from './utils.js';
import { initModelSelector } from './model_selector.js';
import { applyReportMode, removeReportMode, shouldEnterReportMode, injectReportSectionIcons, reformatReportTable, reformatFinancialTableTransposed } from './dealbook_report_utils.js';
import { autoResizeTextarea } from './textarea_utils.js';
import { migrateFinancialInfo, renderFinancialTable, collectFinancialData } from './financial_utils.js';
import { addFileToSourceList } from './file_render_utils.js';


// 프로필 모달 스크립트 로드
const script = document.createElement('script');
script.src = '../js/profile_modal.js';
document.head.appendChild(script);

// 수파베이스 클라이언트 초기화 통합
const _supabase = window.supabaseClient || supabase.createClient(window.config.supabase.url, window.config.supabase.anonKey);
window.supabaseClient = _supabase;

const SUPABASE_ENDPOINT = window.config.supabase.uploadHandlerUrl;
const SUPABASE_STORAGE_URL = `${window.config.supabase.url}/storage/v1/object/public/uploads/`;

$(document).ready(function () {
    showLoader();
    // ==========================================
    // 인증 및 초기 설정
    // ==========================================
    let userData = null;
    try {
        userData = JSON.parse(localStorage.getItem('dealchat_users'));
    } catch (e) {}

    const urlParams = new URLSearchParams(window.location.search);
    const companyId = urlParams.get('id');
    const fromSource = urlParams.get('from');

    // [New] 이전 페이지(목록)로 돌아갈 URL 설정
    let returnUrl = './my_companies.html';
    if (fromSource === 'total_companies' || fromSource === 'totalstartup') {
        returnUrl = './total_companies.html';
    }

    // [New] 헤더의 뒤로가기 버튼 URL 업데이트
    $('.btn-icon-only[title="이전으로"]').off('click').on('click', function() {
        location.href = returnUrl;
    });

    if (!userData || !userData.isLoggedIn) {
        if (fromSource === 'shared' && companyId) {

        } else {
            checkAuth();
            return;
        }
    } else {
        updateHeaderProfile(userData);
        initUserMenu();
    }

    const user_id = userData ? userData.id : null;
    let isNew = companyId === 'new';
    
    if (isNew) {
        $('#btn-delete-company').hide();
    } else {
        $('#btn-delete-company').show();
    }

    let currentCompanyData = null;
    let availableFiles = [];
    let conversationHistory = [];
    let availableReportTypes = [];
    let currentUploadIsTraining = true;
    let currentSourceType = 'training';

    const $chatInput = $('#chat-input');
    const $chatMessages = $('#chat-messages');
    const $welcomeScreen = $('.welcome-screen');
    const $summaryText = $('#summary');
    const $industryText = $('#industry');
    const $notebookTitleText = $('#notebook-title-editor');

    // ==========================================
    // AI 모델 선택기 초기화 및 관리
    // ==========================================
    // AI 모델 선택기
    // ==========================================
    const { markModelAsExceeded, getCurrentModelId } = initModelSelector(addAiResponse);

    // ==========================================
    // 데이터 로딩
    // ==========================================

    async function loadCompanyData() {
        try {

            
            // 모든 사용자 정보 로드 (작성자 표시용)
            const { data: users, error: uError } = await _supabase.from('users').select('*');
            if (uError) throw uError;

            const userMap = {};
            if (users) {
                users.forEach(u => {
                    userMap[u.id] = {
                        name: u.name || DEFAULT_MANAGER.name,
                        company: u.company || DEFAULT_MANAGER.company,
                        affiliation: (u.department || u.affiliation) || DEFAULT_MANAGER.department,
                        email: u.email || DEFAULT_MANAGER.email,
                        avatar: u.avatar_url || DEFAULT_MANAGER.avatar
                    };
                });
            }

            // 유틸리티: 사용자 카드 렌더링
            function renderUserCard($card, user, isViewer = false) {
                if (!user) return;
                $card.find('.user-name').text(user.name || '알 수 없음').css('color', '#000000').css('font-weight', '700');
                $card.find('.user-company').text(user.company || 'DealChat');
                $card.find('.user-affiliation').text(user.affiliation || '-');
                
                const $email = $card.find('.user-email');
                $email.text(user.email || '');
                
                // 열람 카드의 경우 이메일 볼드 제거 (색상은 동일하게 유지)
                if (isViewer) {
                    $email.css('font-weight', '400').css('color', '#64748b');
                } else {
                    $email.css('font-weight', 'inherit').css('color', '#64748b');
                }
                
                $card.find('.user-avatar').attr('src', resolveAvatarUrl(user.avatar, 1));
                
                if (!user.email) {
                    $email.hide();
                    $card.find('.user-email-sep').hide();
                } else {
                    $email.show();
                    $card.find('.user-email-sep').show();
                }

                // 이메일 복사 및 효과 연동
                $card.css('cursor', 'pointer').off('click').on('click', function() {
                    if (user.email) {
                        navigator.clipboard.writeText(user.email).then(() => {
                            const $toast = $('#share-toast');
                            if ($toast.length) {
                                $toast.find('span').text('check_circle');
                                $toast.contents().last()[0].textContent = ' 담당자 이메일이 복사되었습니다.';
                                $toast.css('display', 'flex').hide().fadeIn(200).delay(2000).fadeOut(400);
                            } else {
                                alert('담당자 이메일이 복사되었습니다: ' + user.email);
                            }
                        }).catch(err => console.error('Email copy failed:', err));
                    }
                });
                
                $card.attr('title', '작성자의 이메일을 복사합니다.')
                    .hover(
                        function() { $(this).css('border-color', '#1A73E8').css('background', '#f8fafc').css('transform', 'translateY(-1px)'); },
                        function() { $(this).css('border-color', '#e2e8f0').css('background', '#ffffff').css('transform', 'translateY(0)'); }
                    );
            }

            if (isNew) {
                // 신규 작성 시 기본값 설정
                setMgmtStatusChip('발굴기업');
                
                // 신규 작성 시 현재 사용자 정보를 작성자(공유) 및 열람자로 표시
                const currentUser = userMap[user_id] || DEFAULT_MANAGER;
                renderUserCard($('#memo-author-card'), currentUser);
                
                const d = new Date();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                $('#memo-update-date').text(`작성 일시: ${d.getFullYear()}.${mm}.${dd}`);

                // 신규 시에도 기본 재무 정보 표 렌더링 (금융 유틸리티 사용)
                renderFinancialTable(migrateFinancialInfo(null), 'financial-table-container');
                
                hideLoader();
                $('body').removeClass('is-loading');
                return;
            }

            // 기업 정보 로드
            const { data: company, error: cError } = await _supabase.from('companies').select('*').eq('id', companyId).maybeSingle();
            if (cError) throw cError;
            if (!company) {
                alert('기업 정보를 찾을 수 없습니다.');
                location.href = './my_companies.html';
                return;
            }

            currentCompanyData = company;
            const isOwner = company && user_id && String(company.user_id) === String(user_id);

            
            // UI 업데이트
            $notebookTitleText.text(company.name || '제목 없음');
            document.title = (company.name || '기업') + ' - DealBook';
            
            $summaryText.val(company.summary || '');
            const rawIndustry = company.industry || '';
            if (rawIndustry.startsWith('기타: ')) {
                $industryText.val('기타').trigger('change');
                $('#industry-other').val(rawIndustry.replace('기타: ', '')).show();
            } else {
                $industryText.val(rawIndustry).trigger('change');
            }

            if (rawIndustry) {
                $industryText.css('color', '#1e293b'); // 저장된 값이 있으면 검은색
            } else {
                $industryText.css('color', '#94a3b8'); // 값이 없으면 초기 회색
            }

            $('#ceo-name').val(company.ceo_name || '');
            $('#company-email').val(company.email || '');
            $('#establishment-date').val(company.establishment_date || '');
            $('#company-address').val(company.address || '');
            $('#financial-analysis').val(company.financial_analysis || '');
            $('#manager-memo').val(company.manager_memo || '');

            // 진행 현황 버튼 설정
            const status = company.mgmt_status || '대기';
            setMgmtStatusChip(status);

            // 재무 정보 전치 테이블 렌더링
            renderFinancialTable(migrateFinancialInfo(company.financial_info), 'financial-table-container');

            // 투자 정보 행 생성
            $('#investment-rows').empty();
            if (company.investment_info && Array.isArray(company.investment_info)) {
                // 최신 연도가 상단에 오도록 내림차순 정렬
                const sortedInv = [...company.investment_info].sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
                sortedInv.forEach(i => {
                    createInvestmentRow(i.year, i.stage, i.valuation, i.amount, i.investor);
                });
            }
            if ($('#investment-rows').children().length === 0) createInvestmentRow();

            // 신규 필드 반영 [New]
            $('#key-products').val(company.key_products || '');
            $('#private-memo').val(company.private_memo || '');
            


            // 작성자/열람자 정보 반영
            const author = userMap[company.user_id] || DEFAULT_MANAGER;
            const viewer = userMap[user_id] || DEFAULT_MANAGER;
            
            renderUserCard($('#memo-author-card'), author);

            if (company.updated_at || company.created_at) {
                const date = new Date(company.updated_at || company.created_at);
                const mm = String(date.getMonth() + 1).padStart(2, '0');
                const dd = String(date.getDate()).padStart(2, '0');
                const hh = String(date.getHours()).padStart(2, '0');
                const min = String(date.getMinutes()).padStart(2, '0');
                $('#memo-update-date').text(`최종 업데이트: ${date.getFullYear()}.${mm}.${dd} ${hh}:${min}`);
            }

            // 채팅 기록 로드
            if (company.history && Array.isArray(company.history) && company.history.length > 0) {
                conversationHistory = company.history;
                $chatMessages.find('.message').remove();
                $welcomeScreen.hide();
                conversationHistory.forEach(msg => {
                    addMessage(msg.content, msg.role === 'assistant' ? 'ai' : 'user', false);
                });
                // 채팅 내역 로드 후 스크롤 최하단 이동
                setTimeout(() => {
                    $chatMessages.scrollTop($chatMessages[0].scrollHeight);
                }, 100);
            } else {
                // 채팅 기록이 없으면 시작 화면 표시
                $chatMessages.find('.message').remove();
                $welcomeScreen.show();
            }

            autoResizeAllTextareas();
            
            // [Refactored] NDA 체크 (기업 페이지: 회원은 면제, 비회원은 필수)
            const isMember = userData && userData.isLoggedIn;
            if (!isMember) {
                const isSigned = await checkNdaStatus(_supabase, companyId, user_id, 'company');
                if (!isSigned) {
                    $('body').addClass('nda-active');
                    initNdaGate(_supabase, companyId, 'company', userData, {
                        fromSource,
                        returnUrl: './shared_items.html',
                        onSuccess: () => location.reload()
                    });
                    document.getElementById('nda-modal').addEventListener('hidden.bs.modal', () => {
                        $('body').removeClass('nda-active');
                    }, { once: true });
                    return;
                }
            }

            const viewMode = urlParams.get('mode');

            if (shouldEnterReportMode({ viewMode, fromSource, allowedSources: ['totalstartup', 'total_companies', 'shared'], isNew, isOwner })) {
                applyReadOnlyMode();
            }

        } catch (err) {
            console.error('Data load error:', err);
            alert('데이터를 불러오는 중 오류가 발생했습니다.');
        } finally {
            hideLoader();
            $('body').removeClass('is-loading');
        }
    }

    async function loadAvailableFiles() {
        if (isNew) return; // 신규 작성 시에는 개별 파일 로드 생략
        try {
            // 전체 공유 파일 + 내 파일
            const { data, error } = await _supabase
                .from('files')
                .select('*')
                .or(`user_id.eq.${user_id},entity_id.eq.${companyId}`);
            
            if (error) throw error;
            availableFiles = data || [];
            
            // 현재 기업에 연결된 파일들 필터링하여 리스트 렌더링
            renderCompanyFiles();
        } catch (err) {
            console.error('File load error:', err);
        }
    }

    function renderCompanyFiles() {
        $('#source-list-training').empty();

        const companyFiles = availableFiles.filter(f => f.entity_id === companyId);
        
        companyFiles.forEach(file => {
            // 모든 파일을 학습 데이터 목록으로 표시
            addFileToSourceList(file.file_name, file.id, file.storage_path, true, false, file.parsedText);
        });
    }

    // ==========================================
    // UI 헬퍼 함수
    // ==========================================
    function setMgmtStatusChip(value) {
        $('.btn-status-chip').removeClass('active');
        if (!value) return;
        
        const isOther = value.startsWith('기타: ') || value === '기타';
        const targetValue = isOther ? '기타' : value.replace(/\s+/g, '');

        $('.btn-status-chip').each(function() {
            const chipValue = ($(this).data('value') || "").replace(/\s+/g, '');
            if (chipValue === targetValue) {
                $(this).addClass('active');
            }
        });

        if (isOther) {
            $('#mgmt-status-other-wrapper').show();
            if (value.startsWith('기타: ')) {
                $('#mgmt-status-other').val(value.replace('기타: ', ''));
            }
        } else {
            $('#mgmt-status-other-wrapper').hide();
        }
    }

    $(document).on('click', '.btn-status-chip', function() {
        setMgmtStatusChip($(this).data('value'));
    });

    // [New] 산업군 '기타' 선택 시 입력 필드 토글 및 색상 변경
    $('#industry').on('change', function() {
        const val = $(this).val();
        
        // 색상 변경 처리 (플레이스홀더 효과)
        if (val) {
            $(this).css('color', '#1e293b');
        } else {
            $(this).css('color', '#94a3b8');
        }

        if (val === '기타') {
            $('#industry-other').fadeIn(200).focus();
        } else {
            $('#industry-other').hide().val('');
        }
    });




    function autoResizeAllTextareas() {
        autoResizeTextarea($summaryText);
        autoResizeTextarea($('#key-products'));
        autoResizeTextarea($('#financial-analysis'));
        autoResizeTextarea($('#manager-memo'));
        autoResizeTextarea($('#private-memo'));
    }

    // [New] 텍스트 입력 시 자동 높이 조절 연결
    $(document).on('input', '#summary, #key-products, #financial-analysis, #manager-memo, #private-memo', function() {
        autoResizeTextarea($(this));
    });

    // 재무 정보 행 추가


    // 투자 정보 행 추가
    function createInvestmentRow(year = '', stage = '', valuation = '', amount = '', investor = '') {
        const stages = ['Seed', 'Pre-A', 'Series A', 'Series B', 'Series C 이상', 'M&A', 'Pre-IPO', 'IPO'];
        let stageOptions = '<option value="">단계 선택</option>';
        stages.forEach(s => {
            stageOptions += `<option value="${s}" ${stage === s ? 'selected' : ''}>${s}</option>`;
        });

        const rowId = `inv-row-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const rowHtml = `
            <div class="investment-row" id="${rowId}" style="display: flex; gap: 8px; align-items: center; padding: 0 36px 0 12px; box-sizing: border-box; width: 100%;">
                <input type="text" class="inv-year" value="${year}" placeholder="연도"
                    style="flex: 1; min-width: 0; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 13px; text-align: center; background: #ffffff; box-sizing: border-box; outline: none; transition: border-color 0.2s;">
                <select class="inv-stage"
                    style="flex: 1.5; min-width: 0; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 13px; background: #ffffff; box-sizing: border-box; outline: none; transition: border-color 0.2s;">${stageOptions}</select>
                <input type="text" class="inv-valuation format-number" value="${valuation}" placeholder="밸류"
                    style="flex: 2; min-width: 0; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 13px; text-align: right; background: #ffffff; box-sizing: border-box; outline: none; transition: border-color 0.2s;">
                <input type="text" class="inv-amount format-number" value="${amount}" placeholder="금액"
                    style="flex: 2; min-width: 0; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 13px; text-align: right; background: #ffffff; box-sizing: border-box; outline: none; transition: border-color 0.2s;">
                <input type="text" class="inv-investor" value="${investor}" placeholder="투자자"
                    style="flex: 2.5; min-width: 0; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 13px; text-align: left; background: #ffffff; box-sizing: border-box; outline: none; transition: border-color 0.2s;">
                <button type="button" class="btn-remove-row" style="background: none; border: none; cursor: pointer; color: #cbd5e1; width: 24px; padding: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-sizing: border-box; margin-right: -30px; transition: color 0.2s;">
                    <span class="material-symbols-outlined" style="font-size: 18px;">do_not_disturb_on</span>
                </button>
            </div>
        `;
        $('#investment-rows').append(rowHtml);
    }




    $(document).on('click', '.btn-remove-row', function() { $(this).parent().remove(); });
    $('#add-investment-btn').on('click', () => createInvestmentRow());

    // 숫지 포맷팅
    $(document).on('input', '.format-number', function() {
        let val = $(this).val().replace(/[^0-9.-]/g, '');
        if (val) {
            const parts = val.split('.');
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            $(this).val(parts.join('.'));
        }
    });

    // ==========================================
    // 저장 및 삭제 로직
    // ==========================================
    async function saveCompany(isDraft = false) {
        const name = $notebookTitleText.text().trim();
        if (!name || name === '제목 없음' || name === '') { 
            alert('기업명을 입력해주세요.'); 
            $notebookTitleText.focus();
            return; 
        }

        const industryResult = resolveIndustry($('#industry').val(), $('#industry-other').val());
        if (industryResult.error) {
            alert(industryResult.error);
            $('#industry').focus();
            return;
        }
        const industry = industryResult.value;

        const statusResult = resolveMgmtStatus(
            $('.btn-status-chip.active').data('value'),
            $('#mgmt-status-other').val()
        );
        if (statusResult.error) {
            alert(statusResult.error);
            return;
        }
        const status = statusResult.value;

        // 재무 정보 수집 (전치 테이블)
        const financial_info = collectFinancialData('financial-table-container');

        // 투자 정보 수집
        const investment_info = [];
        $('.investment-row').each(function() {
            investment_info.push({
                year: $(this).find('.inv-year').val(),
                stage: $(this).find('.inv-stage').val(),
                valuation: $(this).find('.inv-valuation').val(),
                amount: $(this).find('.inv-amount').val(),
                investor: $(this).find('.inv-investor').val()
            });
        });




        const payload = {
            name: name,
            industry: industry,
            mgmt_status: status,
            summary: $summaryText.val(),
            ceo_name: $('#ceo-name').val(),
            email: $('#company-email').val(),
            establishment_date: $('#establishment-date').val() || null,
            address: $('#company-address').val(),
            financial_info: financial_info,
            investment_info: investment_info,
            financial_analysis: $('#financial-analysis').val(),
            manager_memo: $('#manager-memo').val(),
            key_products: $('#key-products').val(),
            private_memo: $('#private-memo').val(),

            is_draft: isDraft,
            user_id: user_id,
            history: conversationHistory,
            updated_at: new Date().toISOString()
        };

        showLoader();
        try {
            let result;
            if (isNew) {
                result = await _supabase.from('companies').insert(payload).select().single();
                if (!result.error && result.data && pendingFiles.length > 0) {
                    const newId = result.data.id;
                    const pendingIds = pendingFiles.map(f => f.id);
                    await _supabase.from('files')
                        .update({ entity_id: newId, entity_type: 'company' })
                        .in('id', pendingIds);
                    pendingFiles = [];
                }
            } else {
                result = await _supabase.from('companies').update(payload).eq('id', companyId).select().single();
            }

            if (result.error) throw result.error;
            
            alert(isDraft ? '비공개로 저장되었습니다.' : '저장되었습니다.');
            location.href = returnUrl;
        } catch (err) {
            console.error('Save error:', err);
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            hideLoader();
        }
    }

    $('#btn-save').on('click', () => saveCompany(false));
    $('#btn-draft').on('click', () => saveCompany(true));

    // [New] AI 자동 입력 기능
    $('#ai-auto-fill-btn').on('click', async function() {
        const trainingFiles = availableFiles.filter(f => f.entity_id === companyId || pendingFiles.some(pf => pf.id === f.id));
        const contextText = trainingFiles
            .filter(f => f.parsedText && !f.parsedText.startsWith('[텍스트 미추출'))
            .map(f => `파일명: ${f.file_name}\n내용: ${f.parsedText}`)
            .join('\n\n---\n\n');

        if (!contextText) {
            alert('분석할 수 있는 파일 내용이 없습니다. 먼저 텍스트가 포함된 분석 완료된 파일을 업로드해주세요.');
            return;
        }

        const $btn = $(this);
        const originalHtml = $btn.html();
        
        // [수정] 분석 중 테마 활성화 모드 (CSS 클래스 기반)
        $btn.prop('disabled', true)
            .addClass('analyzing')
            .html('<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="margin-right: 8px; color: #ffffff;"></span><span style="font-size: 14px; font-weight: 600; color: #ffffff;">분석 중...</span>');

        try {
            const prompt = `
업로드된 기업 관련 문서 내용을 바탕으로 다음 정보를 추출하여 정확한 JSON 형식으로 답변해주세요.
- name: 기업명
- industry: 산업 분야 (가급적 드롭다운 목록에 있는 값으로 매핑: AI, IT·정보통신, SaaS·솔루션, 게임, 공공·국방, 관광·레저, 교육·에듀테크, 금융·핀테크, 농·임·어업, 라이프스타일, 모빌리티, 문화예술·콘텐츠, 바이오·헬스케어, 부동산, 뷰티·패션, 에너지·환경, 외식업·소상공인, 우주·항공, 유통·물류, 제조·건설, 플랫폼·커뮤니티 중 하나)
- ceo_name: 대표자명
- email: 이메일
- establishment_date: 설립일자 (YYYY-MM-DD 형식)
- address: 주소
- summary: 회사소개 (300자 내외 요약)
- key_products: 주요 제품/서비스 (핵심 기술 및 제품 라인업)
- financial_info: [{ "year": "연도", "revenue": "매출액(숫자만)", "profit": "영업이익(숫자만)", "net_profit": "당기순이익(숫자만)", "total_assets": "총자산(숫자만)", "total_liabilities": "총부채(숫자만)", "total_equity": "총자본(숫자만)" }]
- investment_info: [{ "year": "연도", "stage": "단계", "valuation": "벨류(숫자만)", "amount": "금액(숫자만)", "investor": "투자자" }]
- financial_analysis: 재무제표 성장성 및 수익성 분석 코멘트 (매출 증가 추이, 영업이익률 변화 등을 포함하여 상세히 기술)

**주의사항**:
1. "담당자 의견(manager_memo)"은 절대 포함하지 마세요.
2. 금액이나 숫자는 단위 구분 쉼표 없이 숫자만 추출하세요. (예: 1,000,000 -> 1000000)
3. 알 수 없는 정보는 빈 문자열("") 또는 빈 배열([])로 반환하세요.
4. 반드시 유효한 JSON 형식으로만 답변하세요. 다른 설명은 생략하세요.
            `.trim();


            const response = await addAiResponse(prompt, contextText);
            const data = await response.json();
            
            let resultText = data.answer || data.text || data.response || "";
            
            // JSON 추출 시도 (Markdown 펜스 또는 순수 { } 블록)
            let jsonString = '';
            const markdownMatch = resultText.match(/```json\n?([\s\S]*?)\n?```/);
            
            if (markdownMatch) {
                jsonString = markdownMatch[1].trim();
            } else {
                const curlyMatch = resultText.match(/\{[\s\S]*\}/);
                if (curlyMatch) {
                    jsonString = curlyMatch[0].trim();
                }
            }

            if (!jsonString) {
                console.error('❌ AI 응답에서 JSON을 찾을 수 없습니다. 원본 응답:', resultText);
                throw new Error('AI로부터 유효한 JSON 형식을 받지 못했습니다. 콘솔 로그를 확인해주세요.');
            }

            let jsonData;
            try {
                jsonData = JSON.parse(jsonString);
            } catch (pErr) {
                console.warn('⚠️ JSON 파싱 1차 실패. 복구를 시도합니다...');
                try {
                    // 잘린 JSON 복구 시도 (닫히지 않은 괄호 강제 삽입)
                    const repairedJson = tryRepairJson(jsonString);
                    jsonData = JSON.parse(repairedJson);

                } catch (rErr) {
                    console.error('❌ JSON 복구 및 파싱 최종 실패. 추출된 문자열:', jsonString);
                    throw new Error('AI 응답이 도중에 끊겼거나 형식이 올바르지 않습니다. (추출 실패)');
                }
            }
            


            // 데이터 UI 매핑
            if (jsonData.name) $('#notebook-title-editor').text(jsonData.name);
            
            if (jsonData.industry) {
                const industries = ["AI", "IT·정보통신", "SaaS·솔루션", "게임", "공공·국방", "관광·레저", "교육·에듀테크", "금융·핀테크", "농·임·어업", "라이프스타일", "모빌리티", "문화예술·콘텐츠", "바이오·헬스케어", "부동산", "뷰티·패션", "에너지·환경", "외식업·소상공인", "우주·항공", "유통·물류", "제조·건설", "플랫폼·커뮤니티"];
                if (industries.includes(jsonData.industry)) {
                    $('#industry').val(jsonData.industry).trigger('change');
                } else {
                    $('#industry').val('기타').trigger('change');
                    $('#industry-other').val(jsonData.industry);
                }
            }

            if (jsonData.ceo_name) $('#ceo-name').val(jsonData.ceo_name);
            if (jsonData.email) $('#company-email').val(jsonData.email);
            if (jsonData.establishment_date) $('#establishment-date').val(jsonData.establishment_date);
            if (jsonData.address) $('#company-address').val(jsonData.address);
            if (jsonData.summary) $('#summary').val(jsonData.summary);
            if (jsonData.key_products) $('#key-products').val(jsonData.key_products);
            if (jsonData.financial_analysis) $('#financial-analysis').val(jsonData.financial_analysis);

            // 재무 정보 (전치 테이블 갱신)
            if (jsonData.financial_info && Array.isArray(jsonData.financial_info) && jsonData.financial_info.length > 0) {
                renderFinancialTable(migrateFinancialInfo(jsonData.financial_info), 'financial-table-container');
            }

            // 투자 정보
            if (jsonData.investment_info && Array.isArray(jsonData.investment_info) && jsonData.investment_info.length > 0) {
                $('#investment-rows').empty();
                jsonData.investment_info.forEach(i => {
                    createInvestmentRow(i.year, i.stage, i.valuation, i.amount, i.investor);
                });
            }

            // 숫자 포맷팅 강제 트리거
            $('.format-number').trigger('input');
            autoResizeAllTextareas();
            
            alert('AI가 파일 내용을 분석하여 정보를 자동으로 입력했습니다.');

        } catch (err) {
            console.error('AI Auto-fill Error:', err);
            const errMsg = err.message || '';
            if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota')) {
                markModelAsExceeded(getCurrentModelId());
                alert('⚠️ AI 요청 한도를 초과했습니다.\n해당 모델의 상담이 제한되었습니다. 다른 모델을 선택해 주세요.');
            } else {
                alert('분석 중 오류가 발생했습니다: ' + (errMsg || '알 수 없는 형식'));
            }
        } finally {
            $btn.prop('disabled', false)
                .removeClass('analyzing')
                .html(originalHtml);
        }
    });

    $('#btn-delete-company').on('click', async function() {
        if (!confirm('정말로 이 기업 정보를 삭제하시겠습니까?')) return;
        showLoader();
        try {
            const { error } = await _supabase.from('companies').update({ deleted_at: new Date().toISOString() }).eq('id', companyId);
            if (error) throw error;
            alert('삭제되었습니다.');
            location.href = returnUrl;
        } catch (err) {
            alert('삭제 중 오류가 발생했습니다.');
        } finally {
            hideLoader();
        }
    });

    // ==========================================
    // 채팅 로직
    // ==========================================
    function addMessage(text, sender, animate = true) {
        $welcomeScreen.hide();
        const isAi = sender === 'ai';
        const msgHtml = `
            <div class="message ${sender}">
                <div class="message-avatar">
                    <span class="material-symbols-outlined" style="font-size: 18px;">${isAi ? 'smart_toy' : 'person'}</span>
                </div>
                <div class="message-content">${escapeForDisplay(text)}</div>
            </div>
        `;
        $chatMessages.append(msgHtml);
        
        if (animate) {
            setTimeout(() => {
                $chatMessages.scrollTop($chatMessages[0].scrollHeight);
            }, 50);
        }
    }

    async function sendMessage() {
        const text = $chatInput.val().trim();
        if (!text) return;
        $chatInput.val('').css('height', 'auto');
        addMessage(text, 'user');
        
        // AI 타이핑 표시기 추가
        const $typingMsg = $(`
            <div class="message ai typing-indicator">
                <div class="message-avatar">
                    <span class="material-symbols-outlined" style="font-size: 18px;">smart_toy</span>
                </div>
                <div class="message-content">
                    <div class="typing-dots">
                        <span></span><span></span><span></span>
                    </div>
                </div>
            </div>
        `);
        $chatMessages.append($typingMsg);
        setTimeout(() => {
            $chatMessages.scrollTop($chatMessages[0].scrollHeight);
        }, 50);

        try {
            let ragContext = "";
            if (!isNew && companyId) {
                try {
                    ragContext = await searchVectorDB(text, companyId) || "";
                } catch (vecErr) {
                    console.warn('Vector search failed (non-fatal):', vecErr);
                }
            }

            // UI 데이터(재무/투자)를 수집 후 순수 함수로 텍스트 변환
            const finData = collectFinancialData('financial-table-container');
            const financialRows = [];
            if (finData && finData.years && finData.items) {
                finData.years.forEach(year => {
                    const row = { year };
                    finData.items.forEach(item => {
                        row[item.key] = item.values[year] || '';
                    });
                    financialRows.push(row);
                });
            }

            const investmentRows = [];
            $('.investment-row').each(function() {
                investmentRows.push({
                    year:      $(this).find('.inv-year').val(),
                    stage:     $(this).find('.inv-stage').val(),
                    valuation: $(this).find('.inv-valuation').val(),
                    amount:    $(this).find('.inv-amount').val(),
                    investor:  $(this).find('.inv-investor').val(),
                });
            });

            const context = buildChatContext({
                name:             $notebookTitleText.text(),
                industry:         $industryText.val(),
                summary:          $summaryText.val(),
                financialStr:     buildFinancialString(financialRows),
                investmentStr:    buildInvestmentString(investmentRows),
                financialAnalysis: $('#financial-analysis').val(),
                managerMemo:      $('#manager-memo').val(),
                ragContext,
            });
            

            const response = await addAiResponse(text, context);
            const data = await response.json();

            
            const answer = data.answer || data.text || data.response || '죄송합니다. 답변을 생성하지 못했습니다.';
            
            $typingMsg.remove();
            addMessage(answer, 'ai');
            
            conversationHistory.push({ role: 'user', content: text });
            conversationHistory.push({ role: 'assistant', content: answer });

            if (!isNew && companyId) {
                await _supabase.from('companies').update({ history: conversationHistory }).eq('id', companyId);
            }
        } catch (err) {
            console.error('❌ AI 채팅 오류:', err);
            $typingMsg.remove();
            const errMsg = err.message || '';
            if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota')) {
                markModelAsExceeded(getCurrentModelId());
                addMessage('⚠️ 선택하신 AI 모델의 요청 한도가 초과되었습니다. 다른 모델을 선택하여 다시 질문해 주세요.', 'ai');
            } else {
                addMessage(`오류가 발생했습니다: ${errMsg || '알 수 없는 오류'}`, 'ai');
            }
        }
    }

    // [New] 잘린 JSON 복구 함수
    $('#send-btn').on('click', sendMessage);
    $chatInput.on('keypress', e => { if (e.which === 13 && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

    $('#clear-history-btn').on('click', async function() {
        if (!confirm('대화 기록을 모두 삭제하시겠습니까?')) return;
        conversationHistory = [];
        $chatMessages.find('.message').remove();
        $welcomeScreen.show();
        
        if (!isNew && companyId) {
            await _supabase.from('companies').update({ history: [] }).eq('id', companyId);
        }
    });

    $(document).on('click', '.prompt-chip', function() {
        const text = $(this).text();
        $chatInput.val(text);
        sendMessage();
    });

    // ==========================================
    // 파일 업로드 및 관리
    // ==========================================
    let pendingFiles = [];



    $(document).on('click', '.delete-file', async function() {
        const id = $(this).data('id');
        if (!confirm('파일을 연결 해제하시겠습니까?')) return;
        try {
            await _supabase.from('files').delete().eq('id', id);
            $(this).closest('li').remove();
        } catch (e) { alert('파일 삭제 실패'); }
    });

    $('#add-source-training').on('click', () => { currentSourceType = 'training'; $('#file-upload').click(); });
    $('#add-source-non-training').on('click', () => { currentSourceType = 'non-training'; $('#file-upload').click(); });

    async function handleFileUpload(files) {
        if (!files || !files.length) return;
        
        for (const file of files) {
            if (!filetypecheck(file)) continue;
            
            // 1. 임시 로딩 항목 추가
            const $tempItem = addFileToSourceList(file.name, 'pending-' + Date.now(), null, true, false, null, 'loading');
            
            try {
                // isNew 시 companyId='new' 문자열이 아닌 null을 명시적으로 전달
                const uploadResult = await fileUpload(file, user_id, isNew ? null : companyId);
                
                const uploadedFile = Array.isArray(uploadResult) ? uploadResult[0] : uploadResult;
                
                if (uploadedFile && uploadedFile.storage_path) {
                    const isSearchable = uploadedFile.parsedText && !uploadedFile.parsedText.startsWith('[텍스트 미추출');
                    const finalStatus = isSearchable ? 'reflected' : 'failed';
                    
                    const badgeClass = finalStatus === 'reflected' ? 'badge-ai-reflected' : 'badge-ai-failed';
                    const badgeText = finalStatus === 'reflected' ? 'AI 반영됨' : 'AI 미반영';
                    const badgeTitle = finalStatus === 'reflected' ? 'AI 에이전트가 이 문서의 내용을 읽고 답변에 활용할 수 있습니다.' : '이미지 위주의 문서이거나 텍스트가 부족하여 AI 검색이 제한됩니다.';
                    
                    const fileUrl = SUPABASE_STORAGE_URL + uploadedFile.storage_path;
                    
                    $tempItem.find('.file-link').attr('href', fileUrl);
                    $tempItem.find('.ai-status-badge').removeClass('badge-ai-loading').addClass(badgeClass).text(badgeText).attr('title', badgeTitle);
                    $tempItem.find('.delete-file').attr('data-id', uploadedFile.id);

                    if (isNew) {
                        pendingFiles.push({ id: uploadedFile.id });
                    } else {
                        if (uploadedFile.id) {
                            await _supabase.from('files')
                                .update({ entity_id: companyId, entity_type: 'company' })
                                .eq('id', uploadedFile.id);
                        }
                    }
                    availableFiles.push(uploadedFile);
                } else {
                    console.error('Upload failed: invalid response', uploadResult);
                    $tempItem.remove();
                    alert(`${file.name} 업로드에 실패했습니다.`);
                }
            } catch (err) { 
                console.error('Upload Error:', err);
                $tempItem.remove();
            }
        }
    }

    $('#file-upload').on('change', function() {
        handleFileUpload(this.files);
        this.value = '';
    });

    // 드래그 앤 드롭 이벤트 핸들러 추가
    const $dropZone = $('#training-drop-zone');

    $dropZone.on('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).addClass('drag-over');
    });

    $dropZone.on('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).removeClass('drag-over');
    });

    $dropZone.on('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).removeClass('drag-over');
        
        const files = e.originalEvent.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files);
        }
    });

    // ==========================================
    // 초기 실행
    // ==========================================
    loadCompanyData();
    loadAvailableFiles();

    // ==========================================
    // 읽기 전용/리포트 모드 처리 (16차 전문 리포트 UI)
    // ==========================================
    function applyReadOnlyMode() {
        applyReportMode({
            reportTitle: '기업 정보 - DealChat',
            titleSelector: '#notebook-title-editor',
            textareaIds: ['summary', 'key-products', 'financial-analysis', 'manager-memo'],
            afterApply: () => {
                reformatReportTable($('#investment-rows'), '.investment-row', [
                    { header: '년도',      selector: '.inv-year',       flex: 1,   align: 'center' },
                    { header: '단계',      selector: '.inv-stage',      flex: 1.5, align: 'center' },
                    { header: '벨류(원)',   selector: '.inv-valuation',  flex: 2,   align: 'right', format: 'number' },
                    { header: '금액(원)',   selector: '.inv-amount',     flex: 2,   align: 'right', format: 'number' },
                    { header: '투자자',    selector: '.inv-investor',   flex: 2.5, align: 'center' }
                ]);
                reformatFinancialTableTransposed('financial-table-container');
                injectReportSectionIcons({
                    'notebook-title-editor': 'business',
                    'industry': 'category',
                    'ceo-name': 'person',
                    'company-email': 'mail',
                    'establishment-date': 'calendar_month',
                    'company-address': 'location_on',
                    'mgmt-status-group': 'account_tree',
                    'summary': 'description',
                    'key-products': 'inventory_2',
                    'investment-section': 'payments',
                    'financial-section': 'analytics',
                    'financial-analysis': 'query_stats',
                    'manager-memo': 'chat_bubble'
                });
            }
        });
    }





    // 초기 데이터 로드 시작
});
