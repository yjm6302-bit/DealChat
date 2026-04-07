import { addAiResponse, searchVectorDB } from './AI_Functions.js';
import { APIcall } from './APIcallFunction.js';
import { filetypecheck, fileUpload } from './File_Functions.js';
import { checkAuth, updateHeaderProfile, initUserMenu, hideLoader } from './auth_utils.js';

// window.config 안전 참조를 위한 헬퍼
const getConfig = () => window.config || { supabase: { uploadHandlerUrl: '' }, ai: { model: 'gemini-1.5-flash', tokenLimits: {} } };

$(document).ready(function () {
    // ==========================================
    // 인증 & 초기화
    // ==========================================
    const userData = checkAuth();
    if (!userData) {
        console.warn('Authentication failed or user data missing.');
        return;
    }
    const user_id = userData.id;

    updateHeaderProfile(userData);
    initUserMenu();

    const urlParams = new URLSearchParams(window.location.search);
    const buyerId = urlParams.get('id');   // 'new' 또는 실제 ID
    const isNew = buyerId === 'new';

    let availableFiles = [];
    let conversationHistory = [];
    let currentSourceType = 'training';
    let pendingFiles = []; // 신규 등록용 임시 파일 저장소

    const fromParam = urlParams.get('from');
    const viewMode = urlParams.get('mode');

    // ==========================================
    // AI 모델 선택기
    // ==========================================
    const availableModels = [
        { id: 'gemini-3.1-flash-live-preview', name: 'Gemini 3.1 Flash Live' },
        { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro' },
        { id: 'gemini-3.1-flash', name: 'Gemini 3.1 Flash' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' }
    ];

    const modelStatusMap = JSON.parse(localStorage.getItem('dealchat_model_status')) || {};
    availableModels.forEach(m => {
        if (!modelStatusMap[m.id]) modelStatusMap[m.id] = 'available';
    });

    let currentModelId = localStorage.getItem('dealchat_selected_model')
        || (window.config && window.config.ai && window.config.ai.model)
        || 'gemini-2.0-flash';

    if (window.config && window.config.ai) {
        window.config.ai.model = currentModelId;
    }

    function renderModelDropdown() {
        const $dropdown = $('#model-dropdown');
        $dropdown.empty();
        const $header = $(`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 12px 8px;border-bottom:1px solid #f1f5f9;margin-bottom:4px;">
                <span style="font-size:11px;font-weight:700;color:#94a3b8;">모델 리스트</span>
                <button id="btn-refresh-status" style="background:none;border:none;cursor:pointer;color:#6366f1;display:flex;align-items:center;">
                    <span class="material-symbols-outlined" style="font-size:16px;">refresh</span>
                </button>
            </div>
        `);
        $dropdown.append($header);
        availableModels.forEach(model => {
            const status = modelStatusMap[model.id];
            const isActive = model.id === currentModelId;
            const $opt = $(`
                <div data-id="${model.id}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer;${isActive ? 'background:#f0f7ff;' : ''}">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="width:8px;height:8px;border-radius:50%;background:${status === 'available' ? '#22c55e' : '#ef4444'};display:inline-block;flex-shrink:0;"></span>
                        <span style="font-size:13px;color:#1e293b;">${model.name}</span>
                    </div>
                    <span style="font-size:11px;color:${status === 'available' ? '#22c55e' : '#ef4444'};">${status === 'available' ? '사용 가능' : '한도 초과'}</span>
                </div>
            `);
            $opt.on('click', () => selectModel(model.id));
            $dropdown.append($opt);
        });
        const cur = availableModels.find(m => m.id === currentModelId) || availableModels[5];
        $('#current-model-name').text(cur.name);
        $('#btn-refresh-status').off('click').on('click', e => { e.stopPropagation(); checkAllModelsStatus(); });
    }

    async function checkAllModelsStatus() {
        await Promise.allSettled(availableModels.map(async model => {
            try {
                const r = await addAiResponse("status_check", "Reply 'ok'.", model.id);
                modelStatusMap[model.id] = r.ok ? 'available' : 'exceeded';
            } catch (err) {
                if (err.message && err.message.includes('429')) modelStatusMap[model.id] = 'exceeded';
            }
        }));
        localStorage.setItem('dealchat_model_status', JSON.stringify(modelStatusMap));
        renderModelDropdown();
    }

    function selectModel(modelId) {
        currentModelId = modelId;
        localStorage.setItem('dealchat_selected_model', modelId);
        if (window.config && window.config.ai) window.config.ai.model = modelId;
        renderModelDropdown();
        $('#model-dropdown').hide();
    }

    $('#btn-model-selector').on('click', e => { e.stopPropagation(); $('#model-dropdown').toggle(); });
    $(document).on('click', () => $('#model-dropdown').hide());
    renderModelDropdown();

    // 채팅 UI 요소 정의
    const $chatInput = $('#chat-input');
    const $chatMessages = $('#chat-messages');
    const $welcomeScreen = $('.welcome-screen');

    if (viewMode === 'read' || fromParam === 'totalbuyer' || fromParam === 'total_buyers' || fromParam === 'shared') {
        console.log('Read-only mode transition detected. Applying immediate report UI.');
        
        // [즉시 실행] 에디터 UI 숨기기
        $('body').append('<div id="report-initial-loader" style="position:fixed;top:0;left:0;width:100%;height:100%;background:#f8fafc;z-index:9999;display:flex;justify-content:center;align-items:center;flex-direction:column;gap:15px;"><div class="loader-logo" style="color:#0d9488;font-size:24px;font-weight:800;letter-spacing:-1px;">DealChat</div><div style="color:#64748b;font-size:14px;">리포트를 준비하고 있습니다...</div></div>');
        
        // 진입 경로에 따른 바로가기 버튼 링크 수정
        $('.sidebar .panel-header button').filter(function() {
            return $(this).attr('onclick') && $(this).attr('onclick').includes('buyers.html');
        }).attr('onclick', "location.href='./total_buyers.html'");

        // 초기 스타일 주입
        applyBuyerReadOnlyMode();
    }

    // 작성자 정보 표시
    $('#memo-author-name').text(userData.name || '');
    $('#memo-author-affiliation').text(userData.affiliation || userData.company || userData.department || '');
    $('#memo-author-avatar').attr('src',
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(userData.name || 'user')}`);

    if (!isNew) {
        $('#btn-delete-buyer').show();
    } else {
        $('#btn-delete-buyer').hide();
    }

    if (!buyerId) {
        alert('바이어 ID가 없습니다.');
        location.href = './buyers.html';
        return;
    }

    // ==========================================
    // 데이터 로드
    // ==========================================
    function loadBuyerData() {
        if (isNew) {
            setChip('대기');
            hideLoader();
            return;
        }

        const getPayload = { action: 'get', table: 'buyers', id: buyerId };
        if (fromParam !== 'totalbuyer') {
            getPayload.user_id = user_id;
        } else {
            getPayload.user_id = ""; // 전체 조회 허용
        }

        const endpoint = getConfig().supabase.uploadHandlerUrl;
        APIcall(getPayload, endpoint, { 'Content-Type': 'application/json' })
            .then(r => r.json())
            .then(data => {
                const buyer = Array.isArray(data) ? data[0] : data;
                if (!buyer || buyer.error) {
                    alert('바이어 정보를 불러오지 못했습니다.');
                    location.href = './buyers.html';
                    return;
                }

                // 값 채우기
                const companyName = buyer.company_name || buyer.companyName || '';
                $('#buyer-name-editor').text(companyName);
                document.title = `${companyName || '바이어'} - 바이어 정보`;
                $('#sidebar-header-title').text(companyName || '바이어 정보');
                $('#buyer-industry').val(buyer.industry || buyer.interest_industry || '선택해주세요');
                $('#buyer-investment').val(buyer.investment_amount || '');
                $('#buyer-summary').val(buyer.summary || '');
                $('#buyer-interest-summary').val(buyer.interest_summary || '');
                $('#buyer-memo').val(buyer.manager_memo || '');
                $('#buyer-manager-affiliation').val(buyer.manager_affiliation || '');
                $('#buyer-manager-name').val(buyer.manager_name || '');

                // 날짜 및 작성자 정보 바인딩
                const authorId = buyer.user_id;
                if (authorId) {
                    APIcall({
                        action: 'get',
                        table: 'users',
                        id: authorId
                    }, getConfig().supabase.uploadHandlerUrl, { 'Content-Type': 'application/json' })
                        .then(res => res.json())
                        .then(authorData => {
                            const author = Array.isArray(authorData) ? authorData[0] : (authorData.Item || authorData);
                            if (author && author.name) {
                                $('#memo-author-name').text(author.name);
                                $('#memo-author-affiliation').text(author.company || author.department || "DealChat");
                                $('#memo-author-avatar').attr('src', `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(author.name)}`);
                            }
                        })
                        .catch(err => console.error('Failed to fetch author info:', err));
                }

                if (buyer.updated_at) {
                    const date = new Date(buyer.updated_at);
                    const formattedDate = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                    $('#memo-update-date').text(`최종 수정: ${formattedDate}`);
                }

                // 진행 상황 chip
                setChip(buyer.status || '대기');

                // [추가] 읽기 모드 권한 체크
                if (fromParam === 'totalbuyer') {
                    const validStatuses = ['대기', '진행중', '완료'];
                    const currentStatus = validStatuses.includes(buyer.status) ? buyer.status : '대기';
                    const isOwner = (userData && userData.id === (buyer.user_id || authorId));

                    if (!isOwner && (currentStatus === '진행중' || currentStatus === '완료')) {
                        const msg = (currentStatus === '진행중') ? '현재 거래가 진행 중입니다.' : '거래가 완료되었습니다.';
                        alert(msg);
                        $('body').css('overflow', 'hidden').empty().append(`
                            <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; background:#f8fafc; color:#64748b; font-family: 'Pretendard Variable', Pretendard, sans-serif; gap:20px; text-align:center; padding: 20px;">
                                <span class="material-symbols-outlined" style="font-size: 80px; color:#cbd5e1; margin-bottom: 10px;">lock_person</span>
                                <div style="font-size:28px; font-weight:800; color:#1e293b; letter-spacing: -0.5px;">${msg}</div>
                                <p style="font-size:16px; line-height: 1.6; color: #64748b; max-width: 400px;">
                                    해당 바이어는 현재 거래 상태 보호를 위해<br>상세 리포트 조회가 일시적으로 제한되었습니다.
                                </p>
                                <button onclick="location.href='./totalbuyers.html'" 
                                    style="margin-top: 10px; padding:14px 40px; background:#0d9488; color:white; border:none; border-radius:50px; font-weight:700; font-size: 15px; cursor:pointer; box-shadow: 0 10px 20px rgba(13, 148, 136, 0.2); transition: all 0.2s;">
                                    바이어 목록으로 돌아가기
                                </button>
                            </div>
                        `);
                        return;
                    }
                }

                // [추가] 읽기 모드 UI 적용 완료
                if (fromParam === 'totalbuyer') {
                    applyBuyerReadOnlyMode();
                    $('#report-initial-loader').fadeOut(300, function() { $(this).remove(); });
                }

                // textarea 높이 조절
                setTimeout(autoResizeAll, 100);

                // 파일 목록 로드
                loadAvailableFiles();

                // 대화 히스토리 복원
                if (buyer.history && Array.isArray(buyer.history)) {
                    conversationHistory = buyer.history;
                    conversationHistory.forEach(msg => {
                        addMessage(msg.content, msg.role === 'assistant' ? 'ai' : 'user', false);
                    });
                    const $chatMessages = $('#chat-messages');
                    $chatMessages.scrollTop($chatMessages[0].scrollHeight);
                }
            })
            .catch(err => {
                console.error('Load error:', err);
                alert('데이터 로드 실패');
                location.href = './buyers.html';
            })
            .finally(() => hideLoader());
    }

    // 초기 데이터 로드 호출
    loadBuyerData();

    // ==========================================
    // 진행 상황 Chip
    // ==========================================
    function setChip(value) {
        $('.btn-status-chip').removeClass('active').css({
            background: '#fff', color: '#64748b', borderColor: '#e2e8f0'
        });
        $(`.btn-status-chip[data-value="${value}"]`).addClass('active').css({
            background: '#0d9488', color: '#fff', borderColor: '#0d9488',
            boxShadow: '0 4px 10px rgba(13,148,136,0.2)'
        });
        $('#buyer-status').val(value);
    }

    $(document).on('click', '.btn-status-chip', function () {
        setChip($(this).data('value'));
    });

    // ==========================================
    // Textarea 자동 높이
    // ==========================================
    function autoResizeTextarea($el) {
        if (!$el || !$el[0]) return;
        $el.css('height', 'auto');
        $el.css('height', $el[0].scrollHeight + 'px');
    }
    function autoResizeAll() {
        autoResizeTextarea($('#buyer-summary'));
        autoResizeTextarea($('#buyer-interest-summary'));
        autoResizeTextarea($('#buyer-memo'));
    }

    $('#buyer-summary, #buyer-interest-summary, #buyer-memo').on('input', function () {
        autoResizeTextarea($(this));
    });

    // 바이어명 변경 시 제목 업데이트
    $('#buyer-name-editor').on('input', function() {
        const name = $(this).text().trim() || '바이어';
        document.title = `${name} - 바이어 정보`;
        $('#sidebar-header-title').text(name || '바이어 정보');
    });

    // ==========================================
    // 저장 / 삭제
    // ==========================================
    function saveBuyer(isDraft, $btn) {
        const name = $('#buyer-name-editor').text().trim();
        const industry = $('#buyer-industry').val();
        const investment = $('#buyer-investment').val().trim();
        const status = $('#buyer-status').val();
        const summary = $('#buyer-summary').val().trim();
        const interest_summary = $('#buyer-interest-summary').val().trim();
        const memo = $('#buyer-memo').val().trim();
        
        // 추가 필드
        const manager_affiliation = $('#buyer-manager-affiliation').val().trim();
        const manager_name = $('#buyer-manager-name').val().trim();

        if (!name || industry === '선택해주세요' || !summary) {
            alert('바이어명, 산업, 회사 소개는 필수 항목입니다.');
            return;
        }

        const payload = {
            type: 'buyer',
            company_name: name,
            industry,
            investment_amount: investment,
            status: status,
            summary,
            interest_summary,
            manager_memo: memo,
            manager_affiliation,
            manager_name,
            share_type: isDraft ? 'private' : 'public',
            user_id: user_id,
            history: conversationHistory,
            updated_at: new Date().toISOString()
        };

        const origHtml = $btn.html();
        $btn.prop('disabled', true).html('<span class="material-symbols-outlined spin" style="font-size:16px;">sync</span> 저장 중..');

        if (isNew) {
            payload.action = 'create';
            payload.table = 'buyers';
            payload.created_at = new Date().toISOString();
        } else {
            payload.action = 'update';
            payload.table = 'buyers';
            payload.id = buyerId;
        }

        APIcall(payload, getConfig().supabase.uploadHandlerUrl, { 'Content-Type': 'application/json' })
            .then(async r => {
                let result = {};
                if (r.status !== 204) {
                    const data = await r.json();
                    result = Array.isArray(data) ? data[0] : data;
                }
                
                if (result && result.error) {
                    throw new Error(result.error);
                }

                if (isNew && result && result.id) {
                    const newId = result.id;
                    // 대기 중인 파일이 있다면 처리
                    if (pendingFiles.length > 0) {
                        for (const f of pendingFiles) {
                            await APIcall({
                                ...f,
                                action: 'create',
                                table: 'files',
                                entity_id: newId
                            }, getConfig().supabase.uploadHandlerUrl, { 'Content-Type': 'application/json' });
                        }
                        pendingFiles = [];
                    }
                    alert('저장되었습니다.');
                    location.href = `./buyer_editor.html?id=${newId}`;
                } else {
                    alert('저장되었습니다.');
                    if (payload.updated_at) {
                        const d = new Date(payload.updated_at);
                        const formattedDate = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                        $('#memo-update-date').text(`최종 수정: ${formattedDate}`);
                    }
                }
            })
            .catch(err => { 
                console.error(err); 
                alert('저장 실패: ' + (err.message || '알 수 없는 서버 오류')); 
            })
            .finally(() => { $btn.prop('disabled', false).html(origHtml); });
    }

    $('#btn-save-buyer').on('click', function () { saveBuyer(false, $(this)); });
    $('#btn-draft-buyer').on('click', function () { saveBuyer(true, $(this)); });

    $('#btn-delete-buyer').on('click', function () {
        if (!confirm('정말로 이 바이어 정보를 삭제하시겠습니까?')) return;
        APIcall({ action: 'delete', table: 'buyers', id: buyerId }, getConfig().supabase.uploadHandlerUrl, { 'Content-Type': 'application/json' })
            .then(r => r.json())
            .then(result => {
                if (result.error) alert('삭제 오류: ' + result.error);
                else { alert('삭제되었습니다.'); location.href = './buyers.html'; }
            })
            .catch(() => alert('삭제 요청 실패'));
    });





    // ==========================================
    // 파일 업로드 / 목록 (files 테이블 사용)
    // ==========================================
    async function loadAvailableFiles() {
        if (isNew || !buyerId) return;
        APIcall({ action: 'get', table: 'files', entity_id: buyerId, entity_type: 'buyer' }, getConfig().supabase.uploadHandlerUrl, { 'Content-Type': 'application/json' })
            .then(res => res.json())
            .then(data => {
                availableFiles = Array.isArray(data) ? data : [];
                renderFileList();
            })
            .catch(err => console.error('File load error:', err));
    }

    function renderFileList() {
        const $listTraining = $('#source-list-training');
        const $listNonTraining = $('#source-list-non-training');
        $listTraining.empty();
        $listNonTraining.empty();

        if (availableFiles.length === 0) {
            $listTraining.html('<li style="padding: 16px; text-align: center; color: #94a3b8; font-size: 13px;">파일 없음</li>');
            $listNonTraining.html('<li style="padding: 16px; text-align: center; color: #94a3b8; font-size: 13px;">파일 없음</li>');
            return;
        }

        availableFiles.forEach(file => {
            let $list = file.source_type === 'training' ? $listTraining : $listNonTraining;
            
            // AI 검색 반영 여부 판단
            const isTraining = file.source_type === 'training';
            const parsedText = file.parsed_text || file.parsedText;
            const isSearchable = parsedText && !parsedText.startsWith('[텍스트 미추출');
            let aiBadge = '';
            
            if (isTraining) {
                if (isSearchable) {
                    aiBadge = `<span class="ai-status-badge badge-ai-reflected" style="font-size: 10px; font-weight: 600; color: #8b5cf6; background: #f5f3ff; padding: 2px 8px; border-radius: 20px; white-space: nowrap; flex-shrink: 0; border: 1px solid #ddd6fe;">AI 반영됨</span>`;
                } else {
                    aiBadge = `<span class="ai-status-badge badge-ai-failed" style="font-size: 10px; font-weight: 600; color: #ef4444; background: #fee2e2; padding: 2px 8px; border-radius: 20px; white-space: nowrap; flex-shrink: 0; border: 1px solid #fecaca;" title="이미지 위주의 문서이거나 텍스트가 부족하여 AI 검색이 제한됩니다.">AI 불가</span>`;
                }
            }

            $list.append(`
                <li style="display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid #f1f5f9;">
                    ${aiBadge}
                    <span style="flex: 1; font-size: 13px; color: #334155; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                          title="${file.file_name}">${file.file_name}</span>
                    <button class="btn-remove-file" data-id="${file.id || file.tempId}"
                        style="background: none; border: none; cursor: pointer; color: #ef4444; padding: 2px; flex-shrink: 0;">
                        <span class="material-symbols-outlined" style="font-size: 16px;">close</span>
                    </button>
                </li>
            `);
        });
    }

    $('#add-source-training').on('click', () => { currentSourceType = 'training'; $('#file-upload').click(); });
    $('#add-source-non-training').on('click', () => { currentSourceType = 'non-training'; $('#file-upload').click(); });

    $('#file-upload').on('change', async function () {
        const files = this.files;
        if (!files || files.length === 0) return;

        for (const file of files) {
            if (!filetypecheck(file)) {
                alert(`지원하지 않는 파일 형식: ${file.name}`);
                continue;
            }
            try {
                // isNew일 때는 buyerId가 'new'이므로 fileUpload 내부 처리에 맡김
                const uploadResult = await fileUpload(file, user_id, buyerId);
                if (uploadResult && uploadResult.key) {
                    const fileData = {
                        entity_id: isNew ? null : buyerId,
                        entity_type: 'buyer',
                        storage_path: uploadResult.key,
                        file_name: file.name,
                        file_type: file.type.split('/')[1] || 'bin',
                        user_id: user_id
                    };

                    if (isNew) {
                        const tempId = 'pending-' + Date.now();
                        const newFileWithMeta = { ...fileData, tempId, parsed_text: uploadResult.parsed_text || uploadResult.parsedText };
                        pendingFiles.push(newFileWithMeta);
                        availableFiles.push({ ...newFileWithMeta, id: tempId, isPending: true });
                        renderFileList();
                    } else {
                        await APIcall({
                            ...fileData,
                            action: 'create',
                            table: 'files',
                            parsed_text: uploadResult.parsed_text || uploadResult.parsedText
                        }, getConfig().supabase.uploadHandlerUrl, { 'Content-Type': 'application/json' }).then(r => r.json());
                        loadAvailableFiles();
                    }
                }
            } catch (err) {
                console.error('Upload error:', err);
                alert(`${file.name} 업로드 실패`);
            }
        }
        this.value = '';
    });

    $(document).on('click', '.btn-remove-file', function () {
        const fileId = $(this).data('id');
        const isPending = String(fileId).startsWith('pending-');

        if (!confirm('파일을 삭제하시겠습니까?')) return;

        if (isPending) {
            pendingFiles = pendingFiles.filter(f => f.tempId !== fileId);
            availableFiles = availableFiles.filter(f => String(f.id || f.tempId) !== String(fileId));
            renderFileList();
            return;
        }

        APIcall({ action: 'delete', table: 'files', id: fileId }, getConfig().supabase.uploadHandlerUrl, { 'Content-Type': 'application/json' })
            .then(() => loadAvailableFiles());
    });

    // ==========================================
    // 드래그앤드롭 파일 업로드
    // ==========================================
    $(document).on('dragover', '.file-list-card', function (e) {
        e.preventDefault(); e.stopPropagation();
        $(this).addClass('drag-over');
    });
    $(document).on('dragleave', '.file-list-card', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (!$(this).is(e.relatedTarget) && !$(this).has(e.relatedTarget).length) {
            $(this).removeClass('drag-over');
        }
    });
    $(document).on('drop', '.file-list-card', async function (e) {
        e.preventDefault(); e.stopPropagation();
        $(this).removeClass('drag-over');
        const files = e.originalEvent.dataTransfer.files;
        if (!files || files.length === 0) return;

        // 드롭된 카드가 학습/비학습 중 어느 쪽인지 판별
        currentSourceType = $(this).find('#source-list-training').length > 0 ? 'training' : 'non-training';

        for (const file of files) {
            if (!filetypecheck(file)) { alert(`지원하지 않는 파일 형식: ${file.name}`); continue; }
            try {
                const uploadResult = await fileUpload(file, user_id, buyerId);
                if (uploadResult && uploadResult.key) {
                    const fileData = {
                        entity_type: 'buyer', storage_path: uploadResult.key,
                        file_name: file.name, file_type: file.type.split('/')[1] || 'bin',
                        user_id, source_type: currentSourceType
                    };
                    if (isNew) {
                        const tempId = 'pending-' + Date.now();
                        pendingFiles.push({ ...fileData, tempId });
                        availableFiles.push({
                            ...fileData, id: tempId, isPending: true,
                            parsed_text: uploadResult.parsed_text || uploadResult.parsedText
                        });
                        renderFileList();
                    } else {
                        await APIcall({
                            ...fileData, action: 'create', table: 'files', entity_id: buyerId,
                            parsed_text: uploadResult.parsed_text || uploadResult.parsedText
                        },
                            getConfig().supabase.uploadHandlerUrl, { 'Content-Type': 'application/json' }).then(r => r.json());
                        loadAvailableFiles();
                    }
                }
            } catch (err) { console.error('Drop upload error:', err); alert(`${file.name} 업로드 실패`); }
        }
    });

    // ==========================================
    // AI 자동 입력 (자료 기반 추출 로직)
    // ==========================================
    async function autoFillFromFiles($btn) {
        if (isNew || availableFiles.length === 0) {
            alert('먼저 파일을 업로드하고 저장한 후 시도해 주세요.');
            return;
        }

        const origHtml = $btn.html();
        $btn.prop('disabled', true).addClass('analyzing').html('<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="margin-right: 8px; color: #ffffff;"></span><span style="font-size: 14px; font-weight: 600; color: #ffffff;">분석 중...</span>');

        try {
            const query = "Extract buyer/investor name, interested industry, investment amount, general company summary, and specific interest requirements.";
            const contextRaw = await searchVectorDB(query, buyerId);

            const prompt = `
                업로드된 자료를 분석하여 바이어/투자자의 주요 정보를 추출해 주세요.
                만약 자료에서 확인할 수 없는 정보는 빈 문자열("")로 처리하세요.
                
                반드시 아래 JSON 형식으로만 응답하세요:
                {
                  "companyName": "바이어명/투자자명",
                  "industry": "관심 산업군",
                  "investmentAmount": "가용 자금 (숫자 위주)",
                  "summary": "회사 소개 (바이어에 대한 전반적인 소개)",
                  "interestSummary": "매칭 희망 기업/요건 (인수 희망 분야, 지역, 투자 규모 등)"
                }
            `;

            const response = await addAiResponse(prompt, contextRaw);
            const data = await response.json();
            const aiAnswer = data.answer.trim();
            
            let jsonData = null;
            const jsonMatch = aiAnswer.match(/\{[\s\S]*\}/);
            if (jsonMatch) jsonData = JSON.parse(jsonMatch[0]);
            else jsonData = JSON.parse(aiAnswer);

            if (jsonData) {
                if (jsonData.companyName) $('#buyer-name-editor').text(jsonData.companyName);
                if (jsonData.industry) $('#buyer-industry').val(jsonData.industry);
                if (jsonData.investmentAmount) $('#buyer-investment').val(jsonData.investmentAmount);
                if (jsonData.summary) $('#buyer-summary').val(jsonData.summary);
                if (jsonData.interestSummary) $('#buyer-interest-summary').val(jsonData.interestSummary);
                
                autoResizeAll();
                alert('바이어 정보가 자동으로 추출 및 입력되었습니다.');
            }
        } catch (err) {
            console.error('Auto-fill error:', err);
            const errMsg = err.message || '';
            if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota')) {
                alert('⚠️ AI 요청 한도를 초과했습니다.\n잠시 후 다시 시도해 주세요.\n(무료 플랜 기준 분당/일일 한도 초과)');
            } else {
                alert('정보 추출에 실패했습니다. (문서가 인덱싱 중이거나 AI 응답 오류)');
            }
        } finally {
            $btn.prop('disabled', false).removeClass('analyzing').html(origHtml);
        }
    }

    $('#ai-auto-fill-btn').on('click', function() { autoFillFromFiles($(this)); });

    // ==========================================
    // AI 채팅
    // ==========================================

    function addMessage(content, sender, animate = true) {
        $welcomeScreen.hide();
        const isUser = sender === 'user';
        const bubbleClass = isUser ? 'user-message' : 'ai-message';
        const msgHtml = `
            <div class="${bubbleClass} message" style="display:flex; align-items:flex-start; gap:10px; margin-bottom:16px; ${isUser ? 'flex-direction:row-reverse;' : ''}">
                <div style="width:32px; height:32px; border-radius:50%; background:${isUser ? '#0d9488' : '#f1f5f9'};
                             display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <span class="material-symbols-outlined" style="font-size:18px; color:${isUser ? '#fff' : '#64748b'};">${isUser ? 'person' : 'smart_toy'}</span>
                </div>
                <div style="max-width:80%; padding:12px 16px; border-radius:12px;
                             background:${isUser ? '#0d9488' : '#f8fafc'};
                             color:${isUser ? '#fff' : '#334155'}; font-size:14px; line-height:1.7;
                             box-shadow: 0 2px 8px rgba(0,0,0,0.06); white-space:pre-wrap;">${content}</div>
            </div>`;
        $chatMessages.append(msgHtml);
        $chatMessages[0].scrollTo({ top: $chatMessages[0].scrollHeight, behavior: 'smooth' });
    }

    async function sendMessage() {
        const msg = $chatInput.val().trim();
        if (!msg) return;
        $chatInput.val('').css('height', '42px');

        addMessage(msg, 'user');
        conversationHistory.push({ role: 'user', content: msg, timestamp: new Date().toISOString() });

        const $aiPlaceholder = $('<div class="ai-message message" style="display:flex; align-items:flex-start; gap:10px; margin-bottom:16px;"><div style="width:32px; height:32px; border-radius:50%; background:#f1f5f9; display:flex; align-items:center; justify-content:center; flex-shrink:0;"><span class="material-symbols-outlined" style="font-size:18px; color:#64748b;">smart_toy</span></div><div class="ai-typing" style="padding:12px 16px; border-radius:12px; background:#f8fafc; color:#64748b; font-size:14px;">답변 생성 중..</div></div>');
        $chatMessages.append($aiPlaceholder);
        $chatMessages[0].scrollTo({ top: $chatMessages[0].scrollHeight, behavior: 'smooth' });

        try {
            let ragContext = "";
            if (!isNew) {
                ragContext = await searchVectorDB(msg, buyerId);
            }

            const context = `[바이어 기본 필드 정보]\n바이어명: ${$('#buyer-name-editor').text()}\n산업: ${$('#buyer-industry').val()}\n가용자금: ${$('#buyer-investment').val()}\n진행상황: ${$('#buyer-status').val()}\n상세 소개: ${$('#buyer-summary').val()}\n매칭 희망 기업/요건: ${$('#buyer-interest-summary').val()}\n담당자 메모: ${$('#buyer-memo').val()}\n\n[참고 문서 내용]\n${ragContext}`;
            
            const response = await addAiResponse(msg, context);
            const data = await response.json();
            const aiReply = data.answer || '답변을 받지 못했습니다.';
            
            $aiPlaceholder.find('.ai-typing').text(aiReply);
            conversationHistory.push({ role: 'assistant', content: aiReply, timestamp: new Date().toISOString() });

            if (!isNew) {
                APIcall({ action: 'update', table: 'buyers', id: buyerId, history: conversationHistory, updated_at: new Date().toISOString() },
                    getConfig().supabase.uploadHandlerUrl, { 'Content-Type': 'application/json' }).catch(() => {});
            }
        } catch (err) {
            console.error('AI error:', err);
            const errMsg = err.message || '';
            if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota')) {
                $aiPlaceholder.find('.ai-typing').text('⚠️ AI 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요. (무료 플랜 기준 분당/일일 한도 초과)');
            } else {
                $aiPlaceholder.find('.ai-typing').text('AI 답변에 실패했습니다. 다시 시도해주세요.');
            }
        }
    }

    $('#send-btn').on('click', sendMessage);
    $chatInput.on('keypress', e => { if (e.which === 13 && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    
    $('#clear-history-btn').on('click', () => {
        if (!confirm('대화 내용을 모두 삭제하시겠습니까?')) return;
        conversationHistory = [];
        $chatMessages.find('.message').remove();
        $welcomeScreen.show();

        if (!isNew && buyerId) {
            APIcall({ action: 'update', table: 'buyers', id: buyerId, history: [], updated_at: new Date().toISOString() },
                getConfig().supabase.uploadHandlerUrl, { 'Content-Type': 'application/json' }).catch(() => {});
        }
    });

    $(document).on('click', '.prompt-chip', function () {
        $chatInput.val($(this).text());
        sendMessage();
    });

    // ==========================================
    // 전문 리포트 모드 (Professional Report Mode)
    // ==========================================
    function applyBuyerReadOnlyMode() {
        console.log('Applying Professional Report Mode (Buyer) - Synced with Seller');

        const primaryColor = '#0d9488'; // Buyer Teal Color
        const reportStyles = `
            :root {
                --report-primary: ${primaryColor};
                --report-bg: #ffffff;
                --report-text: #475569;
                --report-text-dark: #1e293b;
                --report-border: #e2e8f0;
            }
            body { background-color: #f8fafc !important; overflow-y: auto !important; height: auto !important; }
            .app-container { background-color: #f8fafc !important; display: block !important; height: auto !important; padding: 30px 0 60px 0 !important; }
            .sidebar { max-width: 900px !important; width: 95% !important; margin: 0 auto !important; background-color: var(--report-bg) !important; border: 1px solid var(--report-border) !important; box-shadow: 0 10px 40px rgba(13, 148, 136, 0.08) !important; height: auto !important; overflow: hidden !important; display: block !important; border-radius: 20px !important; }
            .sidebar .panel-header { background-color: var(--report-primary) !important; color: #ffffff !important; border-top-left-radius: 19px !important; border-top-right-radius: 19px !important; border-bottom: none !important; height: 55px !important; margin-bottom: 25px !important; display: flex !important; align-items: center !important; justify-content: center !important; border: none !important; padding: 0 !important; }
            .sidebar .panel-header h2 { color: #ffffff !important; font-size: 14px !important; font-weight: 600 !important; margin: 0 !important; display: flex !important; align-items: center !important; gap: 8px !important; }
            .sidebar .panel-header span:not(#sidebar-header-title) { display: none !important; }
            #sidebar-header-title { color: #ffffff !important; font-size: 14px !important; font-weight: 700 !important; margin: 0 !important; display: flex !important; align-items: center !important; gap: 8px !important; }
            .sidebar-nav { padding: 0 40px 40px 40px !important; overflow-y: visible !important; max-height: none !important; height: auto !important; }
            .sidebar-nav > div { margin-bottom: 36px !important; margin-top: 0 !important; border: none !important; background: transparent !important; padding: 0 !important; }
            .sidebar-nav p { color: var(--report-primary) !important; font-size: 13px !important; margin: 0 0 6px 0 !important; font-weight: 700 !important; letter-spacing: -0.01em; }
            #buyer-name-editor { font-size: 15px !important; font-weight: 500 !important; color: var(--report-text-dark) !important; line-height: 1.3 !important; border: none !important; outline: none !important; }
            .sidebar-nav div:has(> #buyer-name-editor) { border: none !important; background: transparent !important; padding: 0 !important; height: auto !important; min-height: unset !important; }
            .report-div { font-size: 15px !important; line-height: 1.6 !important; color: var(--report-text) !important; white-space: pre-wrap !important; padding: 0 !important; }
            input:disabled, select:disabled { background: transparent !important; border: none !important; padding: 0 !important; color: var(--report-text) !important; font-weight: 500 !important; opacity: 1 !important; -webkit-text-fill-color: var(--report-text) !important; font-size: 15px !important; height: auto !important; min-height: 22px !important; display: block !important; overflow: visible !important; }
            select:disabled { -webkit-appearance: none !important; appearance: none !important; background-image: none !important; }
            textarea:disabled { display: none !important; }
            .btn-status-chip { border-radius: 100px !important; padding: 6px 16px !important; font-size: 12px !important; font-weight: 500 !important; border: 1px solid #e2e8f0 !important; background: #ffffff !important; color: #94a3b8 !important; }
            .btn-status-chip.active { background: var(--report-primary) !important; color: #ffffff !important; border-color: var(--report-primary) !important; font-weight: 700 !important; box-shadow: none !important; cursor: default !important; }
            .btn-status-chip:not(.active) { display: none !important; }
            .sidebar-nav div:has(> #buyer-email), .sidebar > div:last-child { display: none !important; }
            .sidebar-nav div:has(> #buyer-industry-etc) { display: ${$('#buyer-industry').val() === '기타' ? 'block' : 'none'} !important; }
            .main-content, .right-panel, #btn-save-buyer, #btn-draft-buyer, #btn-delete-buyer, #ai-auto-fill-btn, .btn-remove-file, #add-source-training, #add-source-non-training, .welcome-screen, #file-upload, .sidebar-nav div[style*="justify-content: flex-end"], #memo-update-date + div { display: none !important; }
            .author-info-card { border: 1px solid var(--report-border) !important; background: #f8fafc !important; padding: 20px !important; border-radius: 12px !important; }
            @media print { body, html { overflow: visible !important; height: auto !important; } .sidebar { width: 100% !important; border: none !important; box-shadow: none !important; } }
        `;

        if (!$('#report-mode-css').length) {
            $('<style id="report-mode-css">').text(reportStyles).appendTo('head');
        }

        $('#buyer-name-editor').attr('contenteditable', 'false');
        $('input, select, textarea').prop('disabled', true);
        $('#sidebar-header-title').text('바이어 리포트');
        if (!$('#sidebar-header-title .material-symbols-outlined').length) {
            $('#sidebar-header-title').prepend('<span class="material-symbols-outlined" style="font-size: 20px; color: #fff; margin-right: 8px;">assignment_ind</span>');
        }

        ['#buyer-summary', '#buyer-interest-summary', '#buyer-memo'].forEach(sel => {
            const $ta = $(sel);
            if ($ta.length && !$ta.next('.report-div').length) {
                const content = $ta.val() || '';
                $ta.after(`<div class="report-div" style="white-space:pre-wrap; font-size:15px; color:#475569; line-height:1.6; padding:0;">${content}</div>`).hide();
            }
        });

        if (!$('#report-watermark').length) {
            $('<div id="report-watermark">DealChat</div>').css({
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-30deg)',
                fontSize: '100px', fontWeight: '900', color: primaryColor, opacity: '0.04',
                pointerEvents: 'none', zIndex: '9999', letterSpacing: '10px'
            }).appendTo('body');
        }

        document.title = ($('#buyer-name-editor').text() || '바이어') + ' 리포트 - DealChat';
    }

});
