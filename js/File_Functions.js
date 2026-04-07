import { APIcall } from './APIcallFunction.js';


pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// 텍스트 품질 검증 함수 (외부 사용 가능하도록 export)
export const validateText = (text) => {
    if (!text) return { valid: false, severity: 'error', msg: "텍스트를 추출할 수 없습니다. (빈 내용)" };
    const clean = text.trim();

    // 1. 최소 길이 체크 (5자 미만 → 이미지 PDF 가능성, 경고만)
    if (clean.length < 5) {
        return { valid: false, severity: 'warning', msg: `이 문서에서 텍스트를 추출할 수 없습니다.\n스캔된 이미지 PDF일 가능성이 높습니다.\n\n파일 자체는 저장되지만 AI 검색은 지원되지 않습니다.\n그래도 업로드하시겠습니까?` };
    }

    // 2. 인코딩 깨짐 감지 (깨진 문자 비율이 3% 이상이면 손상된 문서로 간주)
    const brokenChars = (clean.match(/\uFFFD/g) || []).length;
    if (brokenChars > 0 && (brokenChars / clean.length) > 0.03) {
        return { valid: false, severity: 'error', msg: "문서 텍스트가 깨져있거나 인코딩 오류가 감지되었습니다.\n(올바른 PDF/문서 형식인지 확인해주세요)" };
    }

    // 3. 무의미한 반복 패턴 감지 (동일 문자 10자 이상 반복, 단 . 이나 - 은 목차 등으로 흔하기에 제외)
    if (/(?![.-])(.)\1{9,}/.test(clean)) {
        return { valid: false, severity: 'error', msg: "무의미한 반복 패턴이 감지되었습니다.\n(정상적인 텍스트 문서가 아닐 수 있습니다)" };
    }

    // 4. 정보 밀도 체크 (특수문자/공백 제외한 실제 언어 텍스트가 20자 미만 → 경고)
    const meaningfulContent = clean.replace(/[^가-힣a-zA-Z0-9]/g, '');
    if (meaningfulContent.length < 20) {
        return { valid: false, severity: 'warning', msg: `유의미한 텍스트가 거의 없는 문서입니다.\n(이미지 위주이거나 기호가 대부분)\n\n파일 자체는 저장되지만 AI 검색은 지원되지 않습니다.\n그래도 업로드하시겠습니까?` };
    }

    return { valid: true };
};

export async function extractTextFromPDF(file) {
    try {
        console.log('PDF extraction: Loading file...');
        const arrayBuffer = await file.arrayBuffer();
        console.log('PDF extraction: ArrayBuffer size:', arrayBuffer.byteLength);

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        console.log('PDF extraction: Document loaded, pages:', pdf.numPages);

        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str).join(" ");
            console.log(`PDF extraction: Page ${i} text length:`, pageText.length);
            text += pageText + "\n";
        }
        console.log('PDF extraction: Total text length:', text.length);
        return text;
    } catch (error) {
        console.error('PDF extraction error:', error);
        throw error;
    }
}

/**
 * Word 파일(.docx)에서 텍스트를 추출합니다.
 */
export async function extractTextFromDocx(file) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value;
}

/**
 * PPTX 파일에서 텍스트를 추출합니다.
 */
export async function extractTextFromPptx(file) {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    let text = "";

    // 슬라이드 파일 찾기 (ppt/slides/slide1.xml 등)
    const slideFiles = Object.keys(zip.files).filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'));

    // 슬라이드 번호 순으로 정렬
    slideFiles.sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)[0]);
        const numB = parseInt(b.match(/\d+/)[0]);
        return numA - numB;
    });

    for (const fileName of slideFiles) {
        const content = await zip.file(fileName).async("string");
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(content, "application/xml");
        const textNodes = xmlDoc.getElementsByTagName("a:t");
        for (let i = 0; i < textNodes.length; i++) {
            text += textNodes[i].textContent + " ";
        }
        text += "\n";
    }
    return text;
}

/**
 * 텍스트 파일(.txt)에서 내용을 읽어옵니다.
 */
export async function extractTextFromTxt(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

export function filetypecheck(file) {
    const supportedTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain"
    ];

    if (!supportedTypes.includes(file.type)) {
        alert("현재 doc 파일은 지원하지 않으며 docx로 저장하여 업로드해야 합니다.");
        return false;
    }
    return true;
}


export async function fileUpload(file, user_id = null, companyId = null, preExtractedText = null, vectorNamespace = undefined) {
    // Safety check: If companyId is passed as a URL string or literal 'new'
    if (typeof companyId === 'string' && (companyId.startsWith('http') || companyId === 'new')) {
        console.warn(`fileUpload: companyId is invalid (${companyId}). Resetting to null.`);
        companyId = null;
    }

    // 1. 텍스트 추출
    let extractedText = preExtractedText;

    // 미리 추출된 텍스트가 없으면 추출 시도
    if (!extractedText) {
        try {
            console.log('Starting text extraction for:', file.name, 'Type:', file.type);
            if (file.type === "application/pdf") {
                extractedText = await extractTextFromPDF(file);
            } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
                extractedText = await extractTextFromDocx(file);
            } else if (file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
                extractedText = await extractTextFromPptx(file);
            } else if (file.type === "text/plain") {
                extractedText = await extractTextFromTxt(file);
            }
            console.log('Extracted text length:', extractedText.length);
            console.log('First 100 chars:', extractedText.substring(0, 100));

            // 텍스트 추출 실패 시 로그 출력 (기본 메시지 생성 보장 -> 검증 실패 유도)
            if (!extractedText || extractedText.trim().length === 0) {
                console.warn('No text extracted from file');
            }
        } catch (err) {
            console.warn("Text extraction failed:", err);
            // 에러 발생 시 extractedText는 null/empty 상태 유지 -> 아래 검증에서 걸러짐
        }
    } else {
        console.log('Using pre-extracted text. Length:', extractedText.length);
    }

    // 2. 텍스트 품질 검증 (업로드는 무조건 진행하되, 품질 상태만 파악)
    const validation = validateText(extractedText);
    if (!validation.valid) {
        console.warn(`Text Validation Issue: ${validation.msg}`);
        // 텍스트가 없거나 너무 짧은 경우 파일명을 플레이스홀더로 사용
        if (!extractedText || extractedText.trim().length < 5) {
            extractedText = `[텍스트 미추출/이미지 문서] ${file.name}`;
        }
    }

    // 3. Base64 변환 및 업로드
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const base64Content = reader.result.split(',')[1];

            const fullText = extractedText.trim();
            const previewText = fullText.length > 1000 ? fullText.substring(0, 1000) + '...' : fullText;

            const payload = {
                table: 'files',
                action: 'upload',
                file_name: file.name,
                content: base64Content,
                is_base64: true,
                content_type: file.type || 'application/octet-stream',
                parsedText: fullText, // 검증된 텍스트
                summary: previewText, // 미리보기용 요약
                user_id: user_id,
                companyId: companyId,
                vectorNamespace: vectorNamespace !== undefined ? vectorNamespace : (companyId || null)
            };

            console.log('Upload payload:', {
                file_name: payload.file_name,
                parsedText_length: payload.parsedText ? payload.parsedText.length : 0,
                summary_length: payload.summary ? payload.summary.length : 0,
                summary_preview: payload.summary ? payload.summary.substring(0, 50) : '',
                companyId: payload.companyId,
                vectorNamespace: payload.vectorNamespace
            });

            console.log('Sending upload request to endpoint:', payload.action === 'upload' ? 'UploadHandler' : 'REST/AI Handler');
            try {
                const response = await APIcall(payload); // Defaults to Supabase endpoint
                const result = await response.json();    // JSON 파싱

                console.log('Upload success result:', result);
                resolve(result);
            } catch (err) {
                console.error('APIcall failed during upload:', err);
                reject(err);
            }
        };
        reader.onerror = (error) => reject(new Error('파일 읽기 실패'));
    });
}

export async function fileDelete(fileId, fileName, user_id, companyId = null) {
    const payload = {
        table: 'files',      // 추가
        action: 'delete',
        fileId: fileId,
        file_name: fileName,
        user_id: user_id,
        companyId: companyId // 선택 사항
    };

    try {
        const response = await APIcall(payload);
        return response;
    } catch (error) {
        throw error;
    }
}


// countTokens 함수는 AI_Functions.js로 이동되었습니다.

export function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
