import { APIcall } from './APIcallFunction.js';
import { getEncoding } from "https://cdn.jsdelivr.net/npm/js-tiktoken@1.0.17/+esm";

const LAMBDA_URL = 'https://fx4w4useafzrufeqxfqui6z5p40aazkb.lambda-url.ap-northeast-2.on.aws/';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';


export async function extractTextFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(" ") + "\n";
    }
    return text;
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

    // 슬라이드 파일들 찾기 (ppt/slides/slide1.xml 등)
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
        alert("해당 파일 형식은 텍스트 추출을 지원하지 않습니다. 지원 가능한 포맷은 다음과 같습니다: PDF, DOCX, PPTX, TXT");
        return false;
    }
    return true;
}


export async function fileUpload(file, userId = null, companyId = null) {
    // 1. 텍스트 추출
    let extractedText = "";
    try {
        if (file.type === "application/pdf") {
            extractedText = await extractTextFromPDF(file);
        } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            extractedText = await extractTextFromDocx(file);
        } else if (file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
            extractedText = await extractTextFromPptx(file);
        } else if (file.type === "text/plain") {
            extractedText = await extractTextFromTxt(file);
        }
    } catch (err) {
        console.warn("Text extraction failed, continuing with upload anyway:", err);
    }

    // 2. Base64 변환 및 업로드
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const base64Content = reader.result.split(',')[1];

            const payload = {
                table: 'files',
                action: 'upload',
                file_name: file.name,
                content: base64Content,
                is_base64: true,
                content_type: file.type || 'application/octet-stream',
                summary: extractedText.trim(), // 추출된 텍스트를 요약 필드에 자동 삽입
                userId: userId,
                companyId: companyId,
                scanMode: false
            };

            try {
                const response = await APIcall(payload, LAMBDA_URL, {
                    'Content-Type': 'application/json'
                });
                resolve(response);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (error) => reject(new Error('파일 읽기 실패'));
    });
}

export async function fileDelete(fileId, fileName, userId, companyId = null) {
    const payload = {
        table: 'files',      // 추가
        action: 'delete',
        fileId: fileId,
        file_name: fileName,
        userId: userId,
        companyId: companyId // 선택 사항
    };

    try {
        const response = await APIcall(payload, LAMBDA_URL, {
            'Content-Type': 'application/json'
        });
        return response;
    } catch (error) {
        throw error;
    }
}


export function countTokens(text) {
    if (!text) return 0;
    try {
        const enc = getEncoding("cl100k_base");
        const tokens = enc.encode(text);
        return tokens.length;
    } catch (e) {
        console.warn('tiktoken failed, falling back to heuristic:', e);
        return Math.ceil(text.length * 1.1);
    }
}
