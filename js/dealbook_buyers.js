import { addAiResponse, searchVectorDB } from './AI_Functions.js';
import { filetypecheck, fileUpload } from './File_Functions.js';
import { checkAuth, updateHeaderProfile, initUserMenu, showLoader, hideLoader, resolveAvatarUrl, DEFAULT_MANAGER } from './auth_utils.js';
import * as sharingUtils from './sharing_utils.js';
import { APIcall } from './APIcallFunction.js';
import { escapeForDisplay } from './utils.js';
import { initModelSelector } from './model_selector.js';
import { applyReportMode, removeReportMode, shouldEnterReportMode, injectReportSectionIcons } from './dealbook_report_utils.js';
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

let currentBuyerData = null;
let userOwnedCompanies = []; // 본인 소유 기업 목록 (추천용)
let availableFiles = [];
let pendingFiles = []; // [New] 신규 작성 중 업로드된 파일 보관용
let conversationHistory = [];
let currentUploadIsTraining = true;

const urlParams = new URLSearchParams(window.location.search);
const buyerId = urlParams.get('id');
const fromSource = urlParams.get('from');
const viewMode = urlParams.get('mode');
const isNew = buyerId === 'new';

$(document).ready(function () {
    showLoader();
    $('body').addClass('is-loading');

    const $chatInput = $('#chat-input');
    const $chatMessages = $('#chat-messages');
    const $welcomeScreen = $('.welcome-screen');

    // ==========================================
    // AI 모델 선택기
    // ==========================================
    const { markModelAsExceeded, getCurrentModelId } = initModelSelector(addAiResponse);

    // ==========================================
    // 초기 로드 및 인증 로직
    // ==========================================
    if (isNew) {
        $('#btn-delete-buyer').hide();
    } else {
        $('#btn-delete-buyer').show();
    }

    let returnUrl = './my_buyers.html';
    if (fromSource === 'totalbuyer' || fromSource === 'total_buyers') {
        returnUrl = './total_buyers.html';
    }
    $('.btn-icon-only[title="목록으로"]').off('click').on('click', function() {
        location.href = returnUrl;
    });

    let userData = null;
    try {
        userData = JSON.parse(localStorage.getItem('dealchat_users'));
    } catch (e) {}

    if (!userData || !userData.isLoggedIn) {
        if (fromSource === 'shared' && buyerId) {

        } else {
            checkAuth();
            return;
        }
    } else {
        updateHeaderProfile(userData);
        initUserMenu();
    }
    const currentuser_id = userData ? userData.id : null;

    // ==========================================
    // [New] 기업명 추천 드롭다운 로직 (이전 제작됨)
    // ==========================================
    function loadUserCompanies() {

        APIcall({ action: 'get', table: 'companies', user_id: currentuser_id }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' })
        .then(r => r.json())
        .then(data => {
            if (data && !data.error) userOwnedCompanies = Array.isArray(data) ? data : [];
        }).catch(err => console.error(err));
    }
    if (currentuser_id) loadUserCompanies();

    function selectCompanyForBuyer(company) {
        if (!company) return;
        const cName = company.name || company.company_name || "";
        $('#buyer-name-editor').text(cName);
        if (company.industry) {
            $('#buyer-industry').val(company.industry);
            if (company.industry === '기타') $('#buyer-industry-etc').show();
        }
        $('#buyer-manager').val(company.ceo_name || "");
        $('#buyer-email').val(company.email || "");
        $('#buyer-summary').val(company.summary || "");
        $('#private-memo').val(company.manager_memo || "");
        $('#buyer-company-suggestions').hide().empty();
    }

    $('#buyer-name-editor').on('input focus', function() {
        const name = $(this).text().trim();
        const $sList = $('#buyer-company-suggestions');
        if (!name) { $sList.hide().empty(); return; }
        const matches = userOwnedCompanies.filter(c => (c.name || c.company_name || "").toLowerCase().includes(name.toLowerCase()));
        if (!matches.length) { $sList.hide().empty(); return; }
        $sList.empty();
        matches.forEach(c => {
            const $item = $(`<div class="suggestion-item" style="padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f8fafc;">
                <div style="font-weight: 700; color: #1e293b; font-size: 13.5px;">${c.name || c.company_name}</div>
                <div style="font-size: 11px; color: #64748b;">${c.industry || "기타"}</div>
            </div>`);
            $item.on('mousedown', (e) => { e.preventDefault(); selectCompanyForBuyer(c); });
            $sList.append($item);
        });
        $sList.show();
    });

    $(document).on('mousedown', e => {
        if (!$(e.target).closest('#buyer-name-editor, #buyer-company-suggestions').length) $('#buyer-company-suggestions').hide();
    });

    if (buyerId && !isNew) {
        loadBuyerData(buyerId);
    } else {
        $('#buyer-name-editor').attr('placeholder', '매수자명 (신규)');
        if (userData) {
            updateAuthorCard(userData);
        }
        switchMode('edit');
        setBuyerStatusChip('대기');
        hideLoader();
        $('body').removeClass('is-loading');
    }

    // ==========================================
    // 데이터 로드 및 바인딩
    // ==========================================
    async function loadBuyerData(id) {
        try {
            const { data: item, error } = await _supabase.from('buyers').select('*').eq('id', id).maybeSingle();
            if (error || !item) {
                alert('정보를 찾을 수 없습니다.');
                location.href = returnUrl;
                return;
            }

            const isOwner = userData && String(item.user_id) === String(userData.id);
            let isSigned = false;
            
            if (!isOwner && (fromSource === 'totalbuyer' || fromSource === 'total_buyers' || fromSource === 'shared')) {
                isSigned = await sharingUtils.checkNdaStatus(_supabase, id, currentuser_id, 'buyer');
                if (!isSigned) {
                    sharingUtils.initNdaGate(_supabase, id, 'buyer', userData, {
                        fromSource, returnUrl: './total_buyers.html', onSuccess: () => location.reload()
                    });
                    return;
                }
            }

            currentBuyerData = item;
            bindBuyerData(item);

            if (item.history && Array.isArray(item.history)) {
                conversationHistory = item.history;
                $chatMessages.find('.message').remove();
                $welcomeScreen.hide();
                conversationHistory.forEach(msg => addMessage(msg.content, msg.role === 'assistant' ? 'ai' : 'user', false));
                setTimeout(() => $chatMessages.scrollTop($chatMessages[0].scrollHeight), 100);
            }

            await loadAvailableFiles();

            if (shouldEnterReportMode({ viewMode, fromSource, allowedSources: ['totalbuyer', 'total_buyers', 'shared'], isNew, isOwner })) {
                switchMode('read');
            } else {
                switchMode('edit');
            }
        } catch (err) {
            console.error(err);
        } finally {
            hideLoader();
            $('body').removeClass('is-loading');
        }
    }

    function bindBuyerData(item) {
        $('#buyer-name-editor').text(item.company_name || '');
        $('#buyer-manager').val(item.manager_name || '');
        $('#buyer-email').val(item.email || '');
        $('#buyer-industry').val(item.interest_industry || '선택해주세요');
        $('#buyer-investment').val(item.available_funds || '');
        $('#buyer-status').val(item.status || '대기');
        $('#buyer-summary').val(item.summary || '');
        $('#buyer-interest-summary').val(item.interest_summary || '');
        $('#private-memo').val(item.private_memo || '');
        setBuyerStatusChip(item.status || '대기');

        if (item.user_id) fetchAuthorInfo(item.user_id);
        if (item.updated_at) {
            const date = new Date(item.updated_at);
            $('#memo-update-date').text(`최종 수정: ${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`);
        }
        autoResizeAllTextareas();
    }

    async function fetchAuthorInfo(uId) {
        const { data, error } = await _supabase.from('users').select('*').eq('id', uId).maybeSingle();
        if (data) updateAuthorCard(data);
    }

    function updateAuthorCard(user) {
        const $card = $('#memo-author-card');
        $card.find('.user-name').text(user.name || DEFAULT_MANAGER.name);
        $card.find('.user-company').text(user.company || 'DealChat');
        $card.find('.user-affiliation').text(user.department || user.affiliation || '-');
        $card.find('.user-email').text(user.email || '');
        $card.find('.user-avatar').attr('src', resolveAvatarUrl(user.avatar || user.avatar_url, 1));
        if (!user.email) $card.find('.user-email-sep, .user-email').hide();
        else $card.find('.user-email-sep, .user-email').show();
        
        $card.css('cursor', 'pointer').off('click').on('click', () => {
            if (user.email) {
                navigator.clipboard.writeText(user.email).then(() => alert('이메일이 복사되었습니다.'));
            }
        });
    }

    // ==========================================
    // 파일 및 AI 기능
    // ==========================================
    async function loadAvailableFiles() {
        try {
            // 전체 공유 파일 + 내 파일 로드
            const { data, error } = await _supabase.from('files').select('*').or(`user_id.eq.${currentuser_id},entity_id.eq.${buyerId}`);
            if (!error) {
                availableFiles = data || [];
                renderBuyerFiles();
            }
        } catch (err) {
            console.error('File load error:', err);
        }
    }

    function renderBuyerFiles() {
        const trainingList = $('#source-list-training');
        trainingList.empty();

        // [New] 기존 파일 + 신규 작성 중 업로드한(pending) 파일 합침
        let displayFiles = availableFiles.filter(f => f.entity_id === buyerId);
        if (isNew) {
            displayFiles = [...displayFiles, ...pendingFiles];
        }

        displayFiles.forEach(file => {
            // [New] parsed_text 또는 parsedText 둘 다 체크
            const pText = file.parsed_text || file.parsedText;
            const isSearchable = pText && !pText.startsWith('[텍스트 미추출');
            const status = isSearchable ? 'reflected' : 'failed';
            addFileToSourceList(file.file_name, file.id, file.storage_path, true, false, status, null, '#22c55e');
        });
    }

    $('#ai-auto-fill-btn').on('click', async function() {
        // [New] 학습(Training) 데이터 대상 선정 (기존 파일 + pending 파일)
        const trainingFiles = isNew ? pendingFiles : availableFiles.filter(f => f.entity_id === buyerId);
        
        const contextText = trainingFiles
            .filter(f => {
                const pText = f.parsed_text || f.parsedText;
                return f.is_training !== false && pText && !pText.startsWith('[텍스트 미추출');
            })
            .map(f => {
                const pText = f.parsed_text || f.parsedText;
                return `파일명: ${f.file_name}\n내용: ${pText}`;
            })
            .join('\n\n---\n\n');
        
        if (!contextText) return alert('분석할 수 있는 학습 파일 내용이 없습니다. 텍스트가 포함된 분석 완료된 파일을 먼저 업로드해주세요.');
        const $btn = $(this);
        const originalHtml = $btn.html();
        $btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm"></span> 분석 중...');
        try {
            const prompt = "매수자 정보를 JSON 형식으로 추출해줘 (company_name, interest_industry, manager_name, email, available_funds, summary, interest_summary, private_memo)";
            const res = await addAiResponse(prompt, contextText);
            const data = await res.json();
            const jsonText = data.answer || data.text || "";
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('JSON format not found');
            const json = JSON.parse(jsonMatch[0]);
            
            if (json.company_name) $('#buyer-name-editor').text(json.company_name);
            if (json.manager_name) $('#buyer-manager').val(json.manager_name);
            if (json.email) $('#buyer-email').val(json.email);
            if (json.available_funds) $('#buyer-investment').val(json.available_funds);
            if (json.summary) $('#buyer-summary').val(json.summary);
            if (json.interest_summary) $('#buyer-interest-summary').val(json.interest_summary);
            if (json.private_memo) $('#private-memo').val(json.private_memo);
            autoResizeAllTextareas();
            alert('AI 분석이 완료되었습니다.');
        } catch (e) {
            console.error(e);
            if (e.message.includes('429') || e.message.includes('RESOURCE_EXHAUSTED')) {
                markModelAsExceeded(getCurrentModelId());
                alert('⚠️ AI 요청 한도를 초과했습니다.\n해당 모델의 예약 기능이 제한되었습니다. 다른 모델을 선택해 주세요.');
            } else {
                alert('AI 분석 중 오류가 발생했습니다.');
            }
        } finally {
            $btn.prop('disabled', false).html(originalHtml);
        }
    });

    async function sendMessage() {
        const text = $chatInput.val().trim();
        if (!text) return;
        $chatInput.val('').css('height', 'auto');
        $welcomeScreen.hide();
        addMessage(text, 'user');
        
        // [New] 채팅용 컨텍스트 구성 (기존 파일 + pending 파일)
        const trainingFiles = isNew ? pendingFiles : availableFiles.filter(f => f.entity_id === buyerId);
        
        const contextText = trainingFiles
            .filter(f => {
                const pText = f.parsed_text || f.parsedText;
                return f.is_training !== false && pText && !pText.startsWith('[텍스트 미추출');
            })
            .map(f => f.parsed_text || f.parsedText)
            .join('\n\n');
        const aiMessageId = `ai-msg-${Date.now()}`;
        addMessage('', 'ai', true, aiMessageId);
        try {
            const res = await addAiResponse(text, contextText, getCurrentModelId(), conversationHistory);
            const data = await res.json();
            const answer = data.answer || "답변을 가져올 수 없습니다.";
            const safeHtml = escapeForDisplay(answer);
            $(`#${aiMessageId}`).find('.message-content').html(safeHtml);
            conversationHistory.push({ role: 'user', content: text }, { role: 'assistant', content: answer });
        } catch (e) {
            if (e.message.includes('429') || e.message.includes('RESOURCE_EXHAUSTED')) {
                markModelAsExceeded(getCurrentModelId());
                $(`#${aiMessageId}`).find('.message-content').html('⚠️ 선택하신 AI 모델의 요청 한도가 초과되었습니다.<br>다른 모델을 선택하여 다시 질문해 주세요.');
            } else {
                $(`#${aiMessageId}`).text('오류가 발생했습니다.');
            }
        }
    }

    function addMessage(content, role, isStreaming, id) {
        const html = `
            <div id="${id || ''}" class="message ${role === 'ai' ? 'ai-message' : 'user-message'}" style="margin-bottom: 20px; display: flex; flex-direction: column; align-items: ${role === 'ai' ? 'flex-start' : 'flex-end'};">
                <div style="max-width: 85%; padding: 12px 16px; border-radius: 16px; font-size: 14px; background: ${role === 'ai' ? '#f1f5f9' : '#0d9488'}; color: ${role === 'ai' ? '#1e293b' : '#ffffff'};">
                    <div class="message-content">${isStreaming ? '...' : escapeForDisplay(content)}</div>
                </div>
            </div>`;
        $chatMessages.append(html).scrollTop($chatMessages[0].scrollHeight);
    }

    $('#send-btn').on('click', sendMessage);
    $chatInput.on('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

    // ==========================================
    // 기타 상호작용
    // ==========================================
    function setBuyerStatusChip(value) {
        $('.btn-status-chip').removeClass('active');
        $(`.btn-status-chip[data-value="${value}"]`).addClass('active');
        $('#buyer-status').val(value);
    }

    $(document).on('click', '.btn-status-chip', function() { setBuyerStatusChip($(this).data('value')); });

    function autoResizeAllTextareas() {
        $('textarea').each(function() { 
            $(this).css('height', 'auto').css('height', this.scrollHeight + 'px'); 
        });
    }

    $('#btn-save-buyer').on('click', () => saveBuyerData('public'));
    $('#btn-draft-buyer').on('click', () => saveBuyerData('private'));

    async function saveBuyerData(shareType) {
        const name = $('#buyer-name-editor').text().trim();
        if (!name) return alert('기업명을 입력하세요.');
        const payload = {
            company_name: name,
            status: $('#buyer-status').val(),
            summary: $('#buyer-summary').val(),
            interest_industry: $('#buyer-industry').val(),
            manager_name: $('#buyer-manager').val(),
            email: $('#buyer-email').val(),
            available_funds: $('#buyer-investment').val(),
            interest_summary: $('#buyer-interest-summary').val(),
            private_memo: $('#private-memo').val(),
            user_id: currentuser_id,
            is_draft: shareType === 'private',
            history: conversationHistory,
            updated_at: new Date().toISOString()
        };
        showLoader();
        try {
            const res = isNew ? await _supabase.from('buyers').insert(payload).select().single() : await _supabase.from('buyers').update(payload).eq('id', buyerId);
            
            if (res.error) throw res.error;

            // [New] 신규 생성 시 pendingFiles 연동
            if (isNew && res.data && pendingFiles.length > 0) {
                const newId = res.data.id;
                const pIds = pendingFiles.map(f => f.id);
                await _supabase.from('files')
                    .update({ entity_id: newId, entity_type: 'buyer' })
                    .in('id', pIds);
                pendingFiles = []; // 초기화
            }

            hideLoader();
            location.href = returnUrl;
        } catch (err) {
            console.error('Save error:', err);
            hideLoader();
            alert('저장 중 오류가 발생했습니다.');
        }
    }

    $('#btn-delete-buyer').on('click', async () => {
        if (confirm('삭제하시겠습니까?')) {
            await _supabase.from('buyers').update({ deleted_at: new Date().toISOString() }).eq('id', buyerId);
            location.href = returnUrl;
        }
    });

    $('#add-source-training').on('click', () => {
        $('#file-upload').click();
    });

    $('#file-upload').on('change', async e => {
        const files = e.target.files;
        if (!files.length) return;
        for (const file of files) {
            if (!filetypecheck(file)) continue;
            const tempId = `temp-${Date.now()}`;
            // 분석 중... (Loading) 항목 추가
            const $tempItem = addFileToSourceList(file.name, tempId, '', true, true, 'loading', null, '#22c55e');
            
            const res = await fileUpload(file, currentuser_id, isNew ? null : buyerId, null, isNew ? null : buyerId);
            
            // [Fix] res.success 대신 실제 파일 객체(storage_path) 유무로 판단
            const uploadedFile = Array.isArray(res) ? res[0] : res;
            if (uploadedFile && uploadedFile.storage_path) {
                // [New] 텍스트 필드명 통합 체크
                const pText = uploadedFile.parsed_text || uploadedFile.parsedText;
                const isSearchable = pText && !pText.startsWith('[텍스트 미추출');
                const badgeClass = isSearchable ? 'badge-ai-reflected' : 'badge-ai-failed';
                const badgeText = isSearchable ? 'AI 반영됨' : 'AI 불가';
                const badgeColor = isSearchable ? '#22c55e' : '#ef4444';
                const badgeBg = isSearchable ? '#f0fdf4' : '#fee2e2';
                const badgeBorder = isSearchable ? '#bbf7d0' : '#fca5a5';

                $tempItem.find('.ai-status-badge')
                    .removeClass('badge-ai-loading')
                    .addClass(badgeClass)
                    .text(badgeText)
                    .css({'color': badgeColor, 'background': badgeBg, 'border-color': badgeBorder});
                
                $tempItem.find('a').attr('href', SUPABASE_STORAGE_URL + uploadedFile.storage_path);
                $tempItem.attr('data-id', uploadedFile.id);
                $tempItem.find('.btn-delete-file').attr('data-id', uploadedFile.id);
                
                // [New] 신규 모드와 수정 모드에 맞춰 파일 리스트 업데이트
                if (isNew) {
                    pendingFiles.push(uploadedFile);
                } else {
                    availableFiles.push(uploadedFile);
                }
            } else {
                $tempItem.find('.badge-ai-loading').removeClass('badge-ai-loading').addClass('badge-ai-failed').text('실패')
                         .css({'color': '#ef4444', 'background': '#fee2e2', 'border-color': '#fca5a5'});
            }
        }
        $(e.target).val('');
    });

    // 드래그 앤 드롭 업로드 활성화 (training-drop-zone 고정)
    $('#training-drop-zone').on('dragover', function(e) {
        e.preventDefault();
        $(this).addClass('drag-over');
    }).on('dragleave drop', function() {
        $(this).removeClass('drag-over');
    }).on('drop', async function(e) {
        e.preventDefault();
        const files = e.originalEvent.dataTransfer.files;
        for (const file of files) {
            if (!filetypecheck(file)) continue;
            const tempId = `temp-${Date.now()}`;
            const $tempItem = addFileToSourceList(file.name, tempId, '', true, true, 'loading', null, '#22c55e');
            
            const res = await fileUpload(file, currentuser_id, isNew ? null : buyerId, null, isNew ? null : buyerId);
            
            // [Fix] 드롭 시에도 res.success 대신 실제 파일 객체 유무로 판단
            const uploadedFile = Array.isArray(res) ? res[0] : res;
            if (uploadedFile && uploadedFile.storage_path) {
                const pText = uploadedFile.parsed_text || uploadedFile.parsedText;
                const isSearchable = pText && !pText.startsWith('[텍스트 미추출');
                const badgeClass = isSearchable ? 'badge-ai-reflected' : 'badge-ai-failed';
                const badgeText = isSearchable ? 'AI 반영됨' : 'AI 불가';
                const badgeColor = isSearchable ? '#22c55e' : '#ef4444';
                const badgeBg = isSearchable ? '#f0fdf4' : '#fee2e2';
                const badgeBorder = isSearchable ? '#bbf7d0' : '#fca5a5';

                $tempItem.find('.ai-status-badge')
                    .removeClass('badge-ai-loading')
                    .addClass(badgeClass)
                    .text(badgeText)
                    .css({'color': badgeColor, 'background': badgeBg, 'border-color': badgeBorder});
                
                $tempItem.find('a').attr('href', SUPABASE_STORAGE_URL + uploadedFile.storage_path);
                $tempItem.attr('data-id', uploadedFile.id);
                
                if (isNew) {
                    pendingFiles.push(uploadedFile);
                } else {
                    availableFiles.push(uploadedFile);
                }
            } else {
                $tempItem.find('.badge-ai-loading').removeClass('badge-ai-loading').addClass('badge-ai-failed').text('실패')
                         .css({'color': '#ef4444', 'background': '#fee2e2', 'border-color': '#fca5a5'});
            }
        }
    });

    function switchMode(mode) {
        if (mode === 'read') applyBuyerReadOnlyMode();
        else {
            removeReportMode();
        }
    }

    function applyBuyerReadOnlyMode() {
        applyReportMode({
            hideSelectors: ['#private-memo-section'],
            textareaIds: ['buyer-summary', 'buyer-interest-summary'],
            afterApply: () => {
                injectReportSectionIcons({
                    'status-chip-group': 'account_tree',
                    'buyer-summary': 'description',
                    'buyer-interest-summary': 'business_center'
                });
            }
        });
    }

});

