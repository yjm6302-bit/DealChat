import { addAiResponse, getRAGdata } from './AI_Functions.js';
import { APIcall } from './APIcallFunction.js';
import { filetypecheck, fileUpload, extractTextFromPDF, extractTextFromDocx, extractTextFromPptx, extractTextFromTxt } from './File_Functions.js';

const LAMBDA_URL = 'https://fx4w4useafzrufeqxfqui6z5p40aazkb.lambda-url.ap-northeast-2.on.aws/';
const S3_BASE_URL = 'https://dealchat.co.kr.s3.ap-northeast-2.amazonaws.com/';

$(document).ready(function () {
    let currentCompanyData = null;
    let availableFiles = [];
    let searchResults = [];

    // URL에서 id 파라미터 추출
    const urlParams = new URLSearchParams(window.location.search);
    const companyId = urlParams.get('id');

    if (!companyId) {
        alert('회사 ID가 없습니다.');
        location.href = './index.html';
        return;
    }

    const userData = JSON.parse(localStorage.getItem('dealchat_users'));

    if (!userData || !userData.isLoggedIn) {
        alert('로그인 후 이용해주세요.');
        location.href = './signin.html';
        return;
    }
    const userId = userData.id;
    $('#userName').text(userData.name);

    const $chatInput = $('#chat-input');
    const $chatMessages = $('#chat-messages');
    const $welcomeScreen = $('.welcome-screen');
    const $guidePanel = $('#guide-panel');



    // 0. 가용 파일 목록(dealchat_files) 불러오기
    function loadAvailableFiles() {
        APIcall({
            table: 'files',
            userId: userId
        }, LAMBDA_URL, {
            'Content-Type': 'application/json'
        })
            .then(response => response.json())
            .then(data => {
                const files = Array.isArray(data) ? data : (data.Items || []);
                availableFiles = files.map(f => ({
                    id: f.id,
                    name: f.file_name,
                    userId: f.userId,
                    location: f.location
                }));
                console.log('Available files for registration loaded:', availableFiles.length);
            })
            .catch(error => {
                console.error('Error loading available files:', error);
            });
    }

    loadAvailableFiles();
    console.log('Available files for registration loaded:', availableFiles);

    // 1. 회사 기본 정보 가져오기 (Lambda)
    const payload1 = {
        table: 'companies',
        id: companyId,
        userId: userId
    };

    APIcall(payload1, LAMBDA_URL, {
        'Content-Type': 'application/json'
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error('데이터를 불러오는 중 오류가 발생했습니다:', data.error);
            } else {
                currentCompanyData = data;
                console.log('회사 정보:', data);

                if (data.companyName) {
                    $('.notebook-title').text(data.companyName);
                }

                if (data.summary) {
                    $('#summary').val(data.summary);
                }
                if (data.industry) {
                    $('#industry').val(data.industry);
                }
                if (data.userId) {
                    $('#userId').val(data.userId);
                }
            }
        })
        .catch(error => {
            console.error('데이터 로드 실패:', error);
        });



    // Save 버튼 클릭 이벤트
    $('#save-summary').on('click', function () {
        if (!currentCompanyData) {
            alert('수정할 데이터가 로드되지 않았습니다.');
            return;
        }

        const updatedSummary = $('#modal-summary-text').val();
        const updatedIndustry = $('#modal-industry-text').val();
        const updatedCompanyName = $('#modal-company-name-text').val();

        // 기존 데이터에 수정된 요약본 및 산업 반영
        const payload2 = {
            ...currentCompanyData,
            companyName: updatedCompanyName,
            summary: updatedSummary,
            industry: updatedIndustry,
            table: 'companies',
            userId: userId,
            action: 'update' // Lambda에서 저장 로직을 타게 하기 위한 식별자
        };

        const $btn = $(this);
        const originalText = $btn.text();
        $btn.prop('disabled', true).text('Saving...');

        // PUT 대신 POST를 사용하여 405 Method Not Allowed 에러 방지
        APIcall(payload2, LAMBDA_URL, {
            'Content-Type': 'application/json'
        })
            .then(response => response.json())
            .then(result => {
                if (result.error) {
                    alert('저장 중 오류가 발생했습니다: ' + result.error);
                } else {
                    // 로컬 데이터 및 UI 업데이트
                    currentCompanyData.companyName = updatedCompanyName;
                    currentCompanyData.summary = updatedSummary;
                    currentCompanyData.industry = updatedIndustry;
                    $('#summary').val(updatedSummary);
                    $('#industry').val(updatedIndustry);
                    $('.notebook-title').text(updatedCompanyName);
                    $summaryModal.hide();
                }
            })
            .catch(error => {
                console.error('저장 실패:', error);
                alert('저장 요청에 실패했습니다.');
            })
            .finally(() => {
                $btn.prop('disabled', false).text(originalText);
            });
    });

    // Auto-resize textarea
    $chatInput.on('input', function () {
        $(this).css('height', 'auto');
        $(this).css('height', this.scrollHeight + 'px');
    });

    // Send message function
    async function sendMessage() {
        const userInput = $chatInput.val().trim();
        const ragData = getRAGdata();

        if (userInput) {
            if ($welcomeScreen.length) {
                $welcomeScreen.hide();
            }

            // User Message
            addMessage(userInput, 'user');
            $chatInput.val('').css('height', 'auto');

            // AI Response (대기 중 표시를 위해 빈 메시지 등을 먼저 띄울 수도 있지만 우선 직접 받아서 처리)
            try {
                const response = await addAiResponse(userInput, ragData);
                const data = await response.json();
                addMessage(data.answer, 'ai');
            } catch (error) {
                console.error('AI Response Error:', error);
                addMessage('죄송합니다. 응답을 생성하는 중 오류가 발생했습니다.', 'ai');
            }
        }
    }

    function parseMarkdown(text) {
        if (!text) return "";
        let html = text
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/^\* (.*$)/gim, '<li>$1</li>')
            .replace(/^- (.*$)/gim, '<li>$1</li>')
            .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
            .replace(/\n\n/g, '<br><br>')
            .replace(/\n/g, '<br>');

        return html;
    }

    function addMessage(text, sender) {
        const avatar = sender === 'ai'
            ? '<div class="avatar material-symbols-outlined">auto_awesome</div>'
            : '<img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" class="avatar">';

        // AI 메시지의 경우 마크다운 파싱 적용
        const displayContent = sender === 'ai' ? parseMarkdown(text) : text;

        const messageHtml = `
            <div class="message ${sender}">
                ${sender === 'ai' ? avatar : ''}
                <div class="message-content">${displayContent}</div>
                ${sender === 'user' ? avatar : ''}
            </div>
        `;

        const $message = $(messageHtml);
        $chatMessages.append($message);

        // Scroll to bottom
        $chatMessages.animate({ scrollTop: $chatMessages[0].scrollHeight }, 300);
    }

    // Event Listeners
    $('#send-btn').on('click', sendMessage);

    $chatInput.on('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Sidebar Toggle (Close)
    $('#toggle-sidebar').on('click', function () {
        $('.sidebar').addClass('collapsed');
        $('#show-sidebar').show();
    });

    // Sidebar Show (Open)
    $('#show-sidebar').on('click', function () {
        $('.sidebar').removeClass('collapsed');
        $(this).hide();
    });

    // Guide Panel Toggle (Only from the top actions button)
    $('.top-actions .btn-primary').on('click', function () {
        $guidePanel.toggleClass('hidden');
    });

    $('#close-guide').on('click', function () {
        $guidePanel.addClass('hidden');
    });

    // Prompt Chips
    $('.prompt-chip').on('click', function () {
        const promptText = $(this).text();
        $chatInput.val(promptText);
        sendMessage();
    });

    const $summaryModal = $('#summary-modal');
    const $summaryText = $('#summary');
    const $industryText = $('#industry');
    const $notebookTitleText = $('.notebook-title');
    const $modalSummaryText = $('#modal-summary-text');
    const $modalIndustryText = $('#modal-industry-text');
    const $modalCompanyNameText = $('#modal-company-name-text');

    $('#expand-summary').on('click', function () {
        $modalSummaryText.val($summaryText.val());
        $modalIndustryText.val($industryText.val());
        $modalCompanyNameText.val($notebookTitleText.text());
        $summaryModal.css('display', 'flex');
    });

    $('#close-summary-modal').on('click', function () {
        $summaryModal.hide();
    });


    // Industry Auto Generate Logic (in Modal)
    $('#generate-industry').on('click', async function () {
        const $btn = $(this);
        const originalText = $btn.html();
        const context = $('#modal-summary-text').val(); // 모달 내 요약 텍스트 사용
        const ragData = getRAGdata();
        const fcontext = (context || "") + "\n\n" + (ragData || "");

        if (!fcontext.trim()) {
            alert('회사소개 내용이나 업로드된 파일이 없습니다.');
            return;
        }

        // 로딩 상태 표시
        $btn.prop('disabled', true).html('<span class="material-symbols-outlined spin" style="font-size: 16px;">sync</span>');

        try {
            const industryPrompt = "이 회사가 속한 산업 분야를 짧은 단어로만 답변해줘. 다른 설명은 하지마.";
            const response = await addAiResponse(industryPrompt, fcontext);
            const data = await response.json();
            $('#modal-industry-text').val(data.answer.trim()); // 모달 내 산업 필드 업데이트
        } catch (error) {
            console.error('Industry generation failed:', error);
            alert('산업 정보 생성 중 오류가 발생했습니다.');
        } finally {
            $btn.prop('disabled', false).html(originalText);
        }
    });

    $('#generate-summary').on('click', async function () {
        const text1 = $('#summary').val();
        const text2 = getRAGdata();
        const context = text1 + "\n\n" + text2;

        if (!text1) {
            alert('회사소개 내용을 먼저 입력해주세요.');
            return;
        }

        const $btn = $(this);
        const originalText = $btn.html();
        $btn.prop('disabled', true).html('<span class="material-symbols-outlined spin" style="font-size: 16px;">sync</span>');

        try {
            const summaryPrompt = "자료를 바탕으로 이 회사소개를 500자 이내로 요약해줘.";
            const response = await addAiResponse(summaryPrompt, context);
            const data = await response.json();
            $('#modal-summary-text').val(data.answer.trim());
        } catch (error) {
            console.error('Summary generation failed:', error);
        } finally {
            $btn.prop('disabled', false).html(originalText);
        }
    });

    // Close modal on click outside
    $summaryModal.on('click', function (e) {
        if ($(e.target).hasClass('modal-overlay')) {
            $summaryModal.hide();
        }
    });

    // Report Selection Modal Logic
    const $reportModal = $('#report-selection-modal');
    const $reportDetailModal = $('#report-gen-detail-modal');

    $('#open-report-modal').on('click', function () {
        $reportModal.css('display', 'flex');
    });

    $('#close-report-modal').on('click', function () {
        $reportModal.hide();
    });

    // Close detail modal
    $('#close-gen-detail-modal').on('click', function () {
        $reportDetailModal.hide();
    });

    // Back button logic
    $('#back-to-selection').on('click', function () {
        $reportDetailModal.hide();
        $reportModal.css('display', 'flex');
    });

    // Card click logic
    $('.report-card').on('click', function () {
        const title = $(this).find('h5').text();
        const desc = $(this).find('p').text();
        const type = $(this).data('type');

        // Update detail modal content
        $('#selected-report-title').text(title);
        $('#selected-report-desc').text(desc);

        // Set default instructions based on type
        let instruction = "";
        switch (type) {
            case 'direct': instruction = "원하는 보고서의 구조와 내용을 자유롭게 설명해주세요."; break;
            case 'quick-review': instruction = "현재 소스들을 바탕으로 핵심 인사이트와 인용문을 포함한 빠른 요약 보고서를 생성해주세요."; break;
            case 'teaser': instruction = "투자자의 관심을 끌 수 있도록 핵심 정보 위주의 티저 문서를 작성해주세요."; break;
            case 'im': instruction = "사업 내용, 재무 현황, 미래 전략을 포함한 상세 투자 설명서(IM)를 작성해주세요."; break;
            case 'invest-report': instruction = "투자 심의를 위한 리스크 분석 및 투자 논리가 담긴 보고서를 작성해주세요."; break;
            case 'pitch-deck': instruction = "제안 발표를 위한 핵심 문구와 구조를 잡아주세요."; break;
            case 'market-report': instruction = "산업 동향 및 경쟁 환경 분석 결과를 보고서 형태로 정리해주세요."; break;
            case 'valuation': instruction = "기업 가치 평가 결과와 산출 근거를 정리한 보고서를 작성해주세요."; break;
        }
        $('#report-instruction').val(instruction);

        // Transition modals
        $reportModal.hide();
        $reportDetailModal.css('display', 'flex');
    });

    // Click outside to close
    $(window).on('click', function (e) {
        if ($(e.target).is($reportModal)) {
            $reportModal.hide();
        }
        if ($(e.target).is($reportDetailModal)) {
            $reportDetailModal.hide();
        }
    });

    $('#start-generate-report').on('click', async function () {
        const instruction = $('#report-instruction').val().trim();
        const language = $('#report-language').val();
        const reportType = $('#selected-report-title').text();

        if (!instruction) {
            alert('만들려는 보고서에 대한 설명을 입력해주세요.');
            $('#report-instruction').focus();
            return;
        }

        const $btn = $(this);
        const originalText = $btn.text();
        $btn.prop('disabled', true).html('<span class="material-symbols-outlined spin" style="font-size: 18px;">sync</span> 생성 중...');

        try {
            // Lambda를 통해 AI 응답 생성 (보안 및 일관성을 위해 직접 호출 대신 Lambda 사용)
            const prompt = `[Report Type] ${reportType}\n[Language] ${language}\n[Instruction] ${instruction}`;

            const response = await addAiResponse(prompt, getRAGdata());
            const data = await response.json();
            const generatedContent = data.answer;

            if (generatedContent) {
                addMessage(`[${reportType} 생성 완료]\n\n${generatedContent}`, 'ai');
                $reportDetailModal.hide();
                alert('보고서가 생성되었습니다. 채팅창을 확인해주세요.');
            } else {
                throw new Error('응답을 생성할 수 없습니다.');
            }
        } catch (error) {
            console.error('보고서 생성 실패:', error);
            alert('보고서 생성 중 오류가 발생했습니다: ' + error.message);
        } finally {
            $btn.prop('disabled', false).text(originalText);
        }
    });

    // Register Deal Modal Logic
    const $registerModal = $('#register-deal-modal');

    $('#btn-register-deal').on('click', function () {
        // 프리필 작업 (현재 데이터가 있으면 기본값으로 채워줌)
        console.log(currentCompanyData);
        if (currentCompanyData) {
            $('input[name="company_name"]').val(currentCompanyData.companyName || '');
            $('textarea[name="summary"]').val($('#summary').val() || '');
            $('input[name="industry"]').val($('#industry').val() || '');
            $('input[name="registrant"]').val($('#userId').val() || '');
        }
        loadAvailableFiles(); // 모달 열 때 최신화
        $registerModal.css('display', 'flex');
    });

    $('#close-register-modal, #cancel-register').on('click', function () {
        $registerModal.hide();
    });

    // 공유 타입 변경 감지
    $('input[name="share_type"]').on('change', function () {
        if ($(this).val() === 'select') {
            $('#share-target-wrapper').css('display', 'flex');
        } else {
            $('#share-target-wrapper').hide();
        }
    });

    // 공유 대상 및 파일 태그 시스템
    let selectedShareTargets = [];
    let selectedSharedFiles = [];

    // 파일 공유 입력창 이벤트
    $('#share-file-input').on('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = $(this).val().trim();
            const queryLower = query.toLowerCase();

            if (query) {
                // availableFiles에서 키워드 포함하는 파일 모두 찾기
                const matches = availableFiles.filter(file =>
                    file.name.toLowerCase().includes(queryLower)
                );

                if (matches.length > 0) {
                    matches.forEach(file => {
                        if (!selectedSharedFiles.some(f => f.name === file.name)) {
                            selectedSharedFiles.push(file);
                        }
                    });
                } else {
                    if (!selectedSharedFiles.some(f => f.name === query)) {
                        selectedSharedFiles.push({
                            id: 'new-' + Date.now(),
                            name: query
                        });
                    }
                }

                searchResults = [];
                $(this).val('');
                renderSharedFileChips();
            }
        }
    });

    $('#share-file-input').on('input', function () {
        const query = $(this).val().trim().toLowerCase();
        if (query.length > 0) {
            searchResults = availableFiles
                .filter(file => file.name.toLowerCase().includes(query))
                .slice(0, 5);
        } else {
            searchResults = [];
        }
        renderSharedFileChips();
    });

    function renderSharedFileChips() {
        const $container = $('#shared-files-container');
        $container.empty();

        // 검색 결과 표시
        if (searchResults.length > 0) {
            searchResults.forEach((file) => {
                const isSelected = selectedSharedFiles.some(f => f.name === file.name);
                if (!isSelected) {
                    const $chip = $(`
                        <div class="share-tag suggestion-chip" data-id="${file.id}" style="border-style: dashed; background: #f8f9fa; cursor: pointer;">
                            <span class="material-symbols-outlined" style="font-size: 16px; color: var(--primary-color);">add_circle</span>
                            <span>${file.name}</span>
                        </div>
                    `);
                    $chip.on('click', function () {
                        selectedSharedFiles.push(file);
                        $('#share-file-input').val('');
                        searchResults = [];
                        renderSharedFileChips();
                    });
                    $container.append($chip);
                }
            });

            if (searchResults.some(file => !selectedSharedFiles.some(f => f.name === file.name))) {
                $container.append('<div style="width: 100%; height: 1px; background: #eee; margin: 8px 0; flex-basis: 100%;"></div>');
            }
        }

        // 선택된 파일 표시
        selectedSharedFiles.forEach((file, index) => {
            const fileUrl = file.location ? (file.location.startsWith('http') ? file.location : (S3_BASE_URL + file.location)) : '#';
            const $tag = $(`
                <div class="share-tag" data-id="${file.id}">
                    <a href="${fileUrl}" target="_blank" style="display: flex; align-items: center; color: inherit; text-decoration: none;">
                        <span class="material-symbols-outlined" style="font-size: 16px; cursor: pointer;">attachment</span>
                    </a>
                    <span>${file.name}</span>
                    <span class="material-symbols-outlined remove-file-tag" data-index="${index}" style="cursor: pointer; font-size: 16px;">close</span>
                </div>
            `);
            $container.append($tag);
        });
    }

    $(document).on('click', '.remove-file-tag', function () {
        const index = $(this).data('index');
        selectedSharedFiles.splice(index, 1);
        renderSharedFileChips();
    });

    $('#share-with-input').on('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const name = $(this).val().trim();
            if (name && !selectedShareTargets.includes(name)) {
                selectedShareTargets.push(name);
                renderShareTags();
                $(this).val('');
            }
        }
    });

    function renderShareTags() {
        const $container = $('#share-tags-container');
        $container.empty();
        selectedShareTargets.forEach((name, index) => {
            const $tag = $(`
                <div class="share-tag">
                    <span>${name}</span>
                    <span class="material-symbols-outlined remove-tag" data-index="${index}">close</span>
                </div>
            `);
            $container.append($tag);
        });
    }

    $(document).on('click', '.remove-tag', function () {
        const index = $(this).data('index');
        selectedShareTargets.splice(index, 1);
        renderShareTags();
    });

    // 등록하기 버튼 클릭
    $('#save-deal').on('click', function () {
        const formData = {
            companyId: companyId,
            companyName: $('input[name="company_name"]').val(),
            summary: $('textarea[name="summary"]').val(),
            industry: $('input[name="industry"]').val(),
            sale_method: $('[name="sale_method"]').val(),
            sale_price: $('input[name="sale_price"]').val(),
            userId: userId,
            others: $('textarea[name="others"]').val(),
            share_files: selectedSharedFiles, // 공유 파일 리스트
            share_type: $('input[name="share_type"]:checked').val(),
            share_with: selectedShareTargets // 태그 리스트 전달
        };

        const $btn = $(this);
        const originalText = $btn.text();
        $btn.prop('disabled', true).text('등록 중...');

        // Lambda Payload 구성
        const payload3 = {
            ...formData,
            table: 'sellers',
            action: 'create'
        };

        APIcall(payload3, LAMBDA_URL, {
            'Content-Type': 'application/json'
        })
            .then(response => response.json())
            .then(result => {
                if (result.error) {
                    alert('등록 중 오류가 발생했습니다: ' + result.error);
                } else {
                    alert('매물이 등록되었습니다.');
                    $registerModal.hide();

                    // 폼 및 상태 초기화
                    $('#register-deal-form')[0].reset();
                    selectedShareTargets = [];
                    selectedSharedFiles = [];
                    renderShareTags();
                    renderSharedFileChips();
                    $('#share-target-wrapper').hide();
                }
            })
            .catch(error => {
                console.error('등록 요청 실패:', error);
                alert('등록 요청에 실패했습니다.');
            })
            .finally(() => {
                $btn.prop('disabled', false).text(originalText);
            });
    });

    $registerModal.on('click', function (e) {
        if ($(e.target).hasClass('modal-overlay')) {
            $registerModal.hide();
        }
    });

    // Add Source logic
    const $fileUpload = $('#file-upload');
    const $sourceList = $('#source-list');

    $('#add-source').on('click', function () {
        $fileUpload.click();
    });

    $fileUpload.on('change', async function (e) {
        if (!userId) {
            alert('사용자 ID를 확인할 수 없습니다. 파일을 업로드할 수 없습니다.');
            return;
        }

        const file = e.target.files[0];
        if (!file) return;

        // 1. 파일 유효성 검사
        if (!filetypecheck(file)) {
            $fileUpload.val('');
            return;
        }

        const icon = getFileIcon(file.name);
        const $newItem = $(`
            <li class="source-item uploading">
                <span class="material-symbols-outlined spin">${icon}</span>
                <span class="source-name">${file.name} (텍스트 추출 중...)</span>
            </li>
        `);
        $sourceList.append($newItem);

        try {
            let extractedText = "";

            // 2. 파일 타입별 텍스트 추출 로직 실행
            if (file.type === "application/pdf") {
                extractedText = await extractTextFromPDF(file);
            } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
                extractedText = await extractTextFromDocx(file);
            } else if (file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
                extractedText = await extractTextFromPptx(file);
            } else if (file.type === "text/plain") {
                extractedText = await extractTextFromTxt(file);
            }

            // 3. 추출 성공 여부 확인 및 업로드 진행
            if (extractedText && extractedText.trim().length > 0) {
                const cleanText = extractedText.trim();
                console.log('텍스트 추출 완료:', cleanText.substring(0, 100) + '...');

                // 업로드 상태 업데이트
                $newItem.find('.source-name').text(`${file.name} (업로드 중...)`);

                try {
                    // 4. 통합 Lambda 호출 (fileUpload 내에서 fetch 수행)
                    const fetchResponse = await fileUpload(file, userId, companyId);

                    // [핵심] fetch 결과인 Response 객체에서 JSON 데이터를 읽어옴
                    const result = await fetchResponse.json();
                    console.log("Server Response Data:", result);

                    // Lambda Proxy 응답 대응 (body가 문자열인 경우 재파싱)
                    let finalData = result;
                    if (result.body && typeof result.body === 'string') {
                        finalData = JSON.parse(result.body);
                    }

                    // 성공 조건 판단 (HTTP 200 또는 Lambda 성공 메시지)
                    if (fetchResponse.ok || finalData.statusCode == 200 || finalData.message === "Upload Success" || finalData.id) {
                        console.log('Upload Success:', finalData);

                        // 5. UI 업데이트
                        $newItem.removeClass('uploading');
                        $newItem.find('.material-symbols-outlined').removeClass('spin');
                        $newItem.find('.source-name').text(file.name);

                        // 삭제 시 필요한 정보(id, filename)를 데이터 속성에 저장
                        $newItem.attr('data-id', finalData.id || result.id);
                        $newItem.attr('data-filename', file.name);

                        alert('업로드 및 정보 저장이 완료되었습니다.');

                        // 6. 가용 파일 목록 새로고침
                        loadAvailableFiles();
                    } else {
                        throw new Error(finalData.message || finalData.error || '서버 응답 오류');
                    }
                } catch (uploadErr) {
                    console.error('Upload Error:', uploadErr);
                    $newItem.find('.source-name').text(`${file.name} (업로드 실패)`);
                    $newItem.find('.material-symbols-outlined').text('error').removeClass('spin');
                    alert('파일 전송 중 오류가 발생했습니다: ' + uploadErr.message);
                }
            } else {
                alert("파일에서 텍스트를 추출할 수 없습니다. 내용이 없거나 이미지만 있는 문서일 수 있습니다.");
                $newItem.remove();
            }
        } catch (err) {
            console.error('Total Process Error:', err);
            $newItem.find('.source-name').text(`${file.name} (처리 실패)`);
            $newItem.find('.material-symbols-outlined').text('error').removeClass('spin');
            alert("처리에 실패했습니다: " + err.message);
        }

        $fileUpload.val('');
    });

    function addFileToSidebar(fileName, fileKey) {
        const icon = getFileIcon(fileName);
        const fileUrl = fileKey ? (fileKey.startsWith('http') ? fileKey : (S3_BASE_URL + fileKey)) : '#';

        const $newItem = $(`
            <li class="source-item" title="${fileName}">
                <span class="material-symbols-outlined">${icon}</span>
                <a href="${fileUrl}" target="_blank" class="source-name" style="text-decoration: none; color: inherit;">${fileName}</a>
                <button class="btn-delete-source" title="파일 삭제">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </li>
        `);

        // 삭제 버튼 클릭 이벤트
        $newItem.find('.btn-delete-source').on('click', async function (e) {
            e.preventDefault();
            e.stopPropagation();

            if (!confirm(`'${fileName}' 파일을 정말 삭제하시겠습니까?`)) {
                return;
            }

            const $btn = $(this);
            $btn.find('.material-symbols-outlined').text('sync').addClass('spin');

            try {
                // Lambda를 통한 파일 삭제
                const deletePayload = {
                    table: 'company_files',
                    action: 'delete',
                    companyId: companyId,
                    fileKey: fileKey,
                    fileName: fileName,
                    userId: userId
                };

                const response = await APIcall(deletePayload, LAMBDA_URL, {
                    'Content-Type': 'application/json'
                });
                const result = await response.json();

                if (response.ok && !result.error) {
                    $newItem.fadeOut(300, function () {
                        $(this).remove();
                    });
                } else {
                    alert('삭제 처리에 실패했습니다: ' + (result.error || '서버 응답 오류'));
                    $btn.find('.material-symbols-outlined').text('close').removeClass('spin');
                }
            } catch (error) {
                console.error('삭제 요청 중 오류 발생:', error);
                alert('삭제 중 오류가 발생했습니다: ' + error.message);
                $btn.find('.material-symbols-outlined').text('close').removeClass('spin');
            }
        });

        $newItem.on('click', function (e) {
            // 링크나 버튼 자체를 클릭한 게 아니라면 active 처리
            if (!$(e.target).closest('a, button').length) {
                $('.source-item').removeClass('active');
                $(this).addClass('active');
            }
        });

        $sourceList.append($newItem);
    }

    function getFileIcon(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        switch (ext) {
            case 'pdf': return 'description';
            case 'doc':
            case 'docx': return 'article';
            case 'txt': return 'text_fields';
            default: return 'attachment';
        }
    }
});
