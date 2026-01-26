import { APIcall } from './APIcallFunction.js';
import { addAiResponse, getRAGdata } from './AI_Functions.js';
import {
    extractTextFromPDF,
    extractTextFromDocx,
    extractTextFromPptx,
    extractTextFromTxt,
    filetypecheck,
    fileUpload,
    fileDelete
} from './File_Functions.js';

const LAMBDA_URL = 'https://fx4w4useafzrufeqxfqui6z5p40aazkb.lambda-url.ap-northeast-2.on.aws/';
const S3_BASE_URL = 'https://dealchat.co.kr.s3.ap-northeast-2.amazonaws.com/';

const columnDefs = [
    { field: "id", headerName: "ID", sortable: true, filter: true, width: 100, hide: true },
    { field: "file_name", headerName: "파일명", sortable: true, filter: true, flex: 1 },
    { field: "summary", headerName: "요약", sortable: true, flex: 2 },
    { field: "updatedAt", headerName: "업데이트일", sortable: true, flex: 0.5, valueFormatter: params => params.value ? new Date(params.value).toLocaleDateString() : "" }

];

let currentFile = null;

const gridOptions = {
    columnDefs: columnDefs,
    rowModelType: 'infinite',
    cacheBlockSize: 100,
    maxConcurrentDatasourceRequests: 1,
    infiniteInitialRowCount: 1,
    theme: 'legacy',
    defaultColDef: {
        resizable: true,
        sortable: true,
        filter: true
    },
    pagination: true,
    paginationPageSize: 20,
    onRowClicked: (params) => {
        currentFile = params.data;
        if (currentFile) {
            $('#modal-id').val(currentFile.id || '');
            $('#modal-file-name-input').val(currentFile.file_name || '');
            $('#modal-comments').val(currentFile.comments || '');
            $('#modal-summary').val(currentFile.summary || '');

            const fileUrl = currentFile.location ? (currentFile.location.startsWith('http') ? currentFile.location : (S3_BASE_URL + currentFile.location)) : '#';
            $('#modal-location-icon').attr('href', fileUrl);
            $('#modal-location-btn').attr('href', fileUrl);
            $('#modal-tags').val(currentFile.tags || '');
            $('#modal-createdAt').val(currentFile.createdAt || '');
            $('#modal-updatedAt').val(currentFile.updatedAt || '');

            const modalEl = document.getElementById('file-modal');
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        }
    }
};

let gridApi;

$(document).ready(function () {
    const userData = JSON.parse(localStorage.getItem('dealchat_users'));
    const userId = userData.id;

    if (!userData || !userData.isLoggedIn) {
        alert('로그인 후 이용해주세요.');
        location.href = './signin.html';
        return;
    }
    const gridDiv = document.querySelector('#fileGrid');
    gridApi = agGrid.createGrid(gridDiv, gridOptions);

    const datasource = {
        getRows: (params) => {
            const keyword = ($('#search-input').val() || "").trim();

            APIcall({
                action: 'get',
                table: 'files',
                userId: userId,
                keyword: keyword
            }, LAMBDA_URL, {
                'Content-Type': 'application/json'
            })
                .then(response => response.json())
                .then(data => {
                    if (data.error) {
                        console.error('Lambda Error:', data.error);
                        params.failCallback();
                        return;
                    }

                    // Lambda가 { Items: [], Count: 0 } 형태 또는 [] 형태 중 무엇을 반환하든 대응
                    const rows = Array.isArray(data) ? data : (data.Items || []);
                    params.successCallback(rows, rows.length || (data.Count || 0));
                })
                .catch(error => {
                    console.error('Fetch Error:', error);
                    params.failCallback();
                });
        }
    };

    // 초기 데이터 로드
    gridApi.setGridOption('datasource', datasource);

    // 검색 버튼 이벤트
    $('#search-btn').on('click', () => {
        gridApi.setGridOption('datasource', datasource);
    });

    // 엔터키 검색 이벤트
    $('#search-input').on('keypress', (e) => {
        if (e.which === 13) {
            gridApi.setGridOption('datasource', datasource);
        }
    });

    // AI 요약 생성 이벤트
    $('#AI-generate-summary').on('click', async function () {
        const ragData = getRAGdata();
        const sourceText = currentFile?.parsedText || $('#modal-summary').val();
        if (!sourceText || sourceText.length < 10) {
            alert('요약할 내용이 없습니다.');
            return;
        }

        const totalText = ragData + sourceText;
        const $btn = $(this);
        const originalIcon = $btn.html();

        // 로딩 상태 표시
        $btn.prop('disabled', true).html('<span class="material-symbols-outlined spin" style="font-size: 16px;">sync</span>');

        try {
            const prompt = "위 문서를 바탕으로 핵심 내용을 500자 이내의 한글 마크다운 형식으로 요약해줘. 다른 설명은 하지 마.";
            const response = await addAiResponse(prompt, totalText);
            const data = await response.json();

            if (data.answer) {
                $('#modal-summary').val(data.answer.trim());
            } else {
                throw new Error('응답 데이터가 없습니다.');
            }
        } catch (error) {
            console.error('AI Summary Error:', error);
            alert('요약 생성 중 오류가 발생했습니다: ' + error.message);
        } finally {
            $btn.prop('disabled', false).html(originalIcon);
        }
    });

    // AI 태그 생성 이벤트 (상세 모달)
    $('#AI-generate-tags').on('click', async function () {
        const ragData = getRAGdata();
        const sourceText = currentFile?.parsedText || $('#modal-summary').val();
        if (!sourceText || sourceText.length < 10) {
            alert('태그를 추출할 내용이 없습니다.');
            return;
        }

        const totalText = ragData + sourceText;
        const $btn = $(this);
        const originalIcon = $btn.html();

        // 로딩 상태 표시
        $btn.prop('disabled', true).html('<span class="material-symbols-outlined spin" style="font-size: 16px;">sync</span>');

        try {
            const prompt = "위 문서와 가장 연관된 핵심 키워드 5개를 뽑아서 쉼표(,)로 구분된 문자열로만 답변해줘. 예: 태그1, 태그2, 태그3";
            const response = await addAiResponse(prompt, totalText);
            const data = await response.json();

            if (data.answer) {
                const cleanTags = data.answer.replace(/태그:\s*/i, '').trim();
                $('#modal-tags').val(cleanTags);
            } else {
                throw new Error('응답 데이터가 없습니다.');
            }
        } catch (error) {
            console.error('AI Tags Error:', error);
            alert('태그 생성 중 오류가 발생했습니다: ' + error.message);
        } finally {
            $btn.prop('disabled', false).html(originalIcon);
        }
    });

    // AI 요약 생성 이벤트 (업로드 모달)
    $('#AI-upload-summary').on('click', async function () {
        const sourceText = $('#extract-file').val();
        if (!sourceText || sourceText.length < 10) {
            alert('요약할 파일 내용이 없습니다. 파일을 먼저 선택해주세요.');
            return;
        }

        const $btn = $(this);
        const originalIcon = $btn.html();
        $btn.prop('disabled', true).html('<span class="material-symbols-outlined spin" style="font-size: 16px;">sync</span>');

        try {
            const prompt = "위 문서를 바탕으로 핵심 내용을 500자 이내의 한글 마크다운 형식으로 요약해줘. 다른 설명은 하지 마.";
            const response = await addAiResponse(prompt, sourceText);
            const data = await response.json();
            $('#upload-summary').val(data.answer.trim());
        } catch (error) {
            console.error('AI Upload Summary Error:', error);
            alert('요약 생성 중 오류가 발생했습니다: ' + error.message);
        } finally {
            $btn.prop('disabled', false).html(originalIcon);
        }
    });

    // AI 태그 생성 이벤트 (업로드 모달)
    $('#AI-upload-tags').on('click', async function () {
        const sourceText = $('#extract-file').val();
        if (!sourceText || sourceText.length < 10) {
            alert('태그를 추출할 파일 내용이 없습니다. 파일을 먼저 선택해주세요.');
            return;
        }

        const $btn = $(this);
        const originalIcon = $btn.html();
        $btn.prop('disabled', true).html('<span class="material-symbols-outlined spin" style="font-size: 16px;">sync</span>');

        try {
            const prompt = "위 문서와 가장 연관된 핵심 키워드 5개를 뽑아서 쉼표(,)로 구분된 문자열로만 답변해줘. 예: 태그1, 태그2, 태그3";
            const response = await addAiResponse(prompt, sourceText);
            const data = await response.json();
            const cleanTags = data.answer.replace(/태그:\s*/i, '').trim();
            $('#upload-tags').val(cleanTags);
        } catch (error) {
            console.error('AI Upload Tags Error:', error);
            alert('태그 생성 중 오류가 발생했습니다: ' + error.message);
        } finally {
            $btn.prop('disabled', false).html(originalIcon);
        }
    });

    // 저장 버튼 이벤트
    $('#save-file-btn').on('click', function () {
        if (!currentFile) return;

        const payload = {
            ...currentFile,
            id: $('#modal-id').val(),
            file_name: $('#modal-file-name-input').val(),
            comments: $('#modal-comments').val(),
            summary: $('#modal-summary').val(),
            location: $('#modal-location').val(),
            tags: $('#modal-tags').val(),
            table: 'files',
            action: 'update',
            userId: userId
        };

        const $btn = $(this);
        const originalText = $btn.text();
        $btn.prop('disabled', true).text('저장 중...');

        APIcall(payload, LAMBDA_URL, {
            'Content-Type': 'application/json'
        })
            .then(response => response.json())
            .then(result => {
                if (result.error) {
                    alert('저장 중 오류가 발생했습니다: ' + result.error);
                } else {
                    alert('저장되었습니다.');
                    const modalEl = document.getElementById('file-modal');
                    const modal = bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                    // 그리드 새로고침
                    gridApi.setGridOption('datasource', datasource);
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

    $('#upload-btn').on('click', function () {
        $('#upload-file-input').click();
    });

    // 파일 선택 시 이름 자동 입력 및 텍스트 추출
    $('#upload-file-input').on('change', async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        // 1. 파일 유효성 검사
        if (!filetypecheck(file)) {
            $('#upload-file-input').val('');
            return;
        }

        $('#upload-file-name').val(file.name);
        $('#extract-file').val('텍스트 추출 중...'); // 사용자 피드백

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
                $('#extract-file').val(cleanText);

                try {
                    // 4. 통합 Lambda 호출 (fileUpload 내에서 fetch 수행)
                    const fetchResponse = await fileUpload(file, userId, '');

                    // [핵심] fetch 결과인 Response 객체에서 JSON 데이터를 읽어옴
                    const result = await fetchResponse.json();
                    console.log("Server Response Data:", result);

                    // Lambda Proxy 응답 대응 (body가 문자열인 경우 재파싱)
                    let finalData = result;
                    if (result.body && typeof result.body === 'string') {
                        finalData = JSON.parse(result.body);
                    }

                    // 성공 조건 판단 (HTTP 200 또는 Lambda 성공 메시지)
                    if (fetchResponse.ok || finalData.statusCode == 200 || finalData.message === "Upload Success") {
                        console.log('Upload Success:', finalData);
                        alert('업로드 및 정보 저장이 완료되었습니다.');

                        // 5. 그리드 데이터 새로고침
                        if (typeof gridApi !== 'undefined' && typeof datasource !== 'undefined') {
                            gridApi.setGridOption('datasource', datasource);
                        }

                        // 6. 입력 필드 초기화
                        $('#upload-file-input').val('');
                        $('#upload-file-name').val('');
                        $('#extract-file').val('');
                    } else {
                        throw new Error(finalData.message || finalData.error || '서버 응답 오류');
                    }
                } catch (uploadErr) {
                    console.error('Upload Error:', uploadErr);
                    alert('파일 전송 중 오류가 발생했습니다: ' + uploadErr.message);
                }
            } else {
                alert("파일에서 텍스트를 추출할 수 없습니다. 내용이 없거나 이미지만 있는 문서일 수 있습니다.");
                $('#upload-file-name').val('');
                $('#extract-file').val('');
            }
        } catch (err) {
            console.error('Total Process Error:', err);
            alert("처리에 실패했습니다: " + err.message);
        }
    });

    // 삭제 버튼 이벤트
    $('#delete-file-btn').on('click', async function () {
        if (!currentFile) return;

        const fileName = currentFile.file_name || '이 파일';
        if (!confirm(`정말로 "${fileName}"을(를) 삭제하시겠습니까?`)) {
            return;
        }

        const $btn = $(this);
        const originalText = $btn.text();
        $btn.prop('disabled', true).text('삭제 중...');

        try {
            const response = await fileDelete(currentFile.id, currentFile.file_name, userId);
            const result = await response.json();

            if (result.error) {
                alert('삭제 중 오류가 발생했습니다: ' + result.error);
            } else {
                alert('삭제되었습니다.');
                const modalEl = document.getElementById('file-modal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
                // 그리드 새로고침
                gridApi.setGridOption('datasource', datasource);
            }
        } catch (error) {
            console.error('Delete Error:', error);
            alert('삭제 요청에 실패했습니다: ' + error.message);
        } finally {
            $btn.prop('disabled', false).text(originalText);
        }
    });

});
