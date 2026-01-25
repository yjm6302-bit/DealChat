import { APIcall } from './APIcallFunction.js';

const LAMBDA_URL = 'https://fx4w4useafzrufeqxfqui6z5p40aazkb.lambda-url.ap-northeast-2.on.aws/';
const S3_BASE_URL = 'https://dealchat.co.kr.s3.ap-northeast-2.amazonaws.com/';

$(document).ready(function () {
    // 로그인 체크
    const userData = JSON.parse(localStorage.getItem('dealchat_users'));
    const userId = userData.id;

    if (!userData || !userData.isLoggedIn) {
        alert('로그인 후 이용해주세요.');
        location.href = './signin.html';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const sellerId = urlParams.get('id');
    let selectedSharedFiles = [];
    let selectedShareTargets = [];
    let searchResults = [];

    let MOCK_FILES = [];

    // 0. 가용 파일 목록(dealchat_files) 불러오기
    function loadAvailableFiles() {
        APIcall({
            table: 'files',
            userId: userId,
            keyword: ''
        }, LAMBDA_URL, {
            'Content-Type': 'application/json'
        })
            .then(response => response.json())
            .then(data => {
                // Lambda 결과 대응 (Items 배열 또는 직접 배열)
                const files = Array.isArray(data) ? data : (data.Items || []);
                MOCK_FILES = files.map(f => ({
                    id: f.id,
                    name: f.file_name, // API에서는 file_name으로 내려옴
                    location: f.location
                }));
                console.log('Available files loaded:', MOCK_FILES.length);
            })
            .catch(error => {
                console.error('Error loading available files:', error);
            });
    }

    loadAvailableFiles();

    if (!sellerId) {
        alert('잘못된 접근입니다.');
        location.href = './sellers.html';
        return;
    }

    // 1. 데이터 불러오기
    function loadSellerData() {
        APIcall({
            table: 'sellers',
            id: sellerId,
            userId: userId
        }, LAMBDA_URL, {
            'Content-Type': 'application/json'
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    alert('데이터를 불러오는데 실패했습니다: ' + data.error);
                    return;
                }

                // 폼 채우기
                $('#seller-id').val(data.id || '');
                $('#companyName').val(data.companyName || '');
                $('#summary').val(data.summary || '');
                $('#industry').val(data.industry || '');
                $('#sale_method').val(data.sale_method || '');
                $('#sale_price').val(data.sale_price || '');
                $('#userId').val(data.userId || '');
                $('#others').val(data.others || '');

                // 공유 설정 채우기
                if (data.share_type) {
                    $(`input[name="share_type"][value="${data.share_type}"]`).prop('checked', true);
                    if (data.share_type === 'select') {
                        $('#share-target-wrapper').show();
                    }
                }

                if (Array.isArray(data.share_with)) {
                    selectedShareTargets = data.share_with;
                    renderShareTags();
                }

                // 공유 파일 채우기
                if (Array.isArray(data.share_files)) {
                    // 받아온 데이터가 문자열 배열인 경우 객체 배열로 변환
                    selectedSharedFiles = data.share_files.map(item => {
                        if (typeof item === 'string') {
                            const mock = MOCK_FILES.find(f => f.name === item);
                            return mock ? { ...mock } : { id: 'ext-' + Math.random().toString(36).substr(2, 9), name: item };
                        }
                        return item;
                    });
                    renderSharedFileChips();
                }
            })
            .catch(error => {
                console.error('Fetch Error:', error);
                alert('데이터 로딩 중 오류가 발생했습니다.');
            });
    }

    loadSellerData();

    // 2. 공유 파일 칩 렌더링
    function renderSharedFileChips() {
        const $container = $('#shared-files-container');
        $container.empty();

        // 검색 결과 표시 (입력 중일 때)
        if (searchResults.length > 0) {
            searchResults.forEach((file) => {
                const isSelected = selectedSharedFiles.some(f => f.name === file.name);
                if (!isSelected) {
                    const $chip = $(`
                        <div class="chip suggestion-chip" data-id="${file.id}" style="border-style: dashed; background: #f8f9fa; cursor: pointer;">
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
                $container.append('<div style="width: 100%; height: 1px; background: #eee; margin: 8px 0;"></div>');
            }
        }

        // 선택된 파일 표시
        selectedSharedFiles.forEach((file, index) => {
            const fileUrl = file.location ? (file.location.startsWith('http') ? file.location : (S3_BASE_URL + file.location)) : '#';
            const $chip = $(`
                <div class="chip" data-id="${file.id}">
                    <a href="${fileUrl}" target="_blank" style="display: flex; align-items: center; color: inherit; text-decoration: none;">
                        <span class="material-symbols-outlined" style="font-size: 16px; cursor: pointer;">attachment</span>
                    </a>
                    <span>${file.name}</span>
                    <span class="remove-file" data-index="${index}">
                        <span class="material-symbols-outlined" style="font-size: 16px; cursor: pointer;">close</span>
                    </span>
                </div>
            `);
            $container.append($chip);
        });
    }

    // 3. 공유 대상 태그 렌더링
    function renderShareTags() {
        const $container = $('#share-tags-container');
        $container.empty();
        selectedShareTargets.forEach((name, index) => {
            const $tag = $(`
                <div class="chip">
                    <span>${name}</span>
                    <span class="remove-target" data-index="${index}">
                        <span class="material-symbols-outlined" style="font-size: 16px; cursor: pointer;">close</span>
                    </span>
                </div>
            `);
            $container.append($tag);
        });
    }

    // 4. 이벤트 핸들러

    // 파일 입력 처리
    $('#share-file-input').on('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = $(this).val().trim();
            const queryLower = query.toLowerCase();

            if (query) {
                // MOCK_FILES에서 키워드 포함하는 파일 모두 찾기
                const matches = MOCK_FILES.filter(file =>
                    file.name.toLowerCase().includes(queryLower)
                );

                if (matches.length > 0) {
                    // 찾은 파일들을 목록에 추가 (중복 제외)
                    matches.forEach(file => {
                        if (!selectedSharedFiles.some(f => f.name === file.name)) {
                            selectedSharedFiles.push(file);
                        }
                    });
                } else {
                    // 매칭되는 파일이 없을 경우 신규 객체 생성하여 추가
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
            searchResults = MOCK_FILES
                .filter(file => file.name.toLowerCase().includes(query))
                .slice(0, 5);
        } else {
            searchResults = [];
        }
        renderSharedFileChips();
    });

    $(document).on('click', '.remove-file', function () {
        const index = $(this).data('index');
        selectedSharedFiles.splice(index, 1);
        renderSharedFileChips();
    });

    // 대상 선택 입력 처리
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

    $(document).on('click', '.remove-target', function () {
        const index = $(this).data('index');
        selectedShareTargets.splice(index, 1);
        renderShareTags();
    });

    // 공유 타입 변경 감지
    $('input[name="share_type"]').on('change', function () {
        if ($(this).val() === 'select') {
            $('#share-target-wrapper').fadeIn(200);
        } else {
            $('#share-target-wrapper').fadeOut(200);
        }
    });

    // 5. 저장 처리
    $('#save-btn').on('click', function () {
        const formData = {
            id: $('#seller-id').val(),
            companyName: $('#companyName').val(),
            summary: $('#summary').val(),
            industry: $('#industry').val(),
            sale_method: $('#sale_method').val(),
            sale_price: $('#sale_price').val(),
            userId: $('#userId').val(),
            others: $('#others').val(),
            share_files: selectedSharedFiles,
            share_type: $('input[name="share_type"]:checked').val(),
            share_with: selectedShareTargets,
            table: 'sellers',
            action: 'update'
        };

        const $btn = $(this);
        const originalText = $btn.text();
        $btn.prop('disabled', true).text('저장 중...');

        APIcall(formData, LAMBDA_URL, {
            'Content-Type': 'application/json'
        })
            .then(response => response.json())
            .then(result => {
                if (result.error) {
                    alert('저장 중 오류가 발생했습니다: ' + result.error);
                } else {
                    alert('성공적으로 저장되었습니다.');
                }
            })
            .catch(error => {
                console.error('Save Error:', error);
                alert('저장 요청에 실패했습니다.');
            })
            .finally(() => {
                $btn.prop('disabled', false).text(originalText);
            });
    });

    // 6. 삭제 처리
    $('#delete-btn').on('click', function () {
        const sellerId = $('#seller-id').val();
        if (!sellerId) return;

        if (!confirm('정말로 이 매물 정보를 삭제하시겠습니까?')) {
            return;
        }

        const $btn = $(this);
        const originalText = $btn.text();
        $btn.prop('disabled', true).text('삭제 중...');

        APIcall({
            id: sellerId,
            table: 'sellers',
            action: 'delete',
            userId: userId
        }, LAMBDA_URL, {
            'Content-Type': 'application/json'
        }, 'DELETE')
            .then(response => response.json())
            .then(result => {
                if (result.error) {
                    alert('삭제 중 오류가 발생했습니다: ' + result.error);
                } else {
                    alert('성공적으로 삭제되었습니다.');
                    location.href = './sellers.html';
                }
            })
            .catch(error => {
                console.error('Delete Error:', error);
                alert('삭제 요청에 실패했습니다.');
            })
            .finally(() => {
                $btn.prop('disabled', false).text(originalText);
            });
    });
});
