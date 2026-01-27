import { APIcall } from "./APIcallFunction.js";
import { countTokens } from "./File_Functions.js";

export function addAiResponse(userInput, sourceTexts) {
    const AI_LAMBDA_URL = 'https://iocc4lp5btcyfcrgmyux4s3mea0lnbko.lambda-url.ap-northeast-2.on.aws/';

    // 토큰 제한 설정 (Lambda 타임아웃 및 페이로드 제한을 고려하여 30k 정도로 제한)
    const MAX_TOKEN = 120000;
    const SAFETY_MARGIN = 5000; // 프롬프트 템플릿과 사용자 입력을 위한 여유 공간

    let truncatedSource = sourceTexts || "";

    // 1. 소스 텍스트가 너무 길면 우선적으로 자름
    if (countTokens(truncatedSource) > (MAX_TOKEN - SAFETY_MARGIN)) {
        console.warn(`Source text too long, truncating to stay under ${MAX_TOKEN} tokens...`);
        // 한글 기준 1자당 약 1.1토큰 가정
        const charLimit = Math.floor((MAX_TOKEN - SAFETY_MARGIN) / 1.1);
        truncatedSource = truncatedSource.substring(0, charLimit) + "\n\n... (내용이 너무 길어 일부 생략되었습니다) ...";
    }

    // 2. 프롬프트 개선: 역할 부여, 문맥 구분, 출력 가이드라인 추가
    let prompts = `
        [Role]
        You are a professional investment analyst and corporate analysis expert. Based on the provided materials, you must provide objective and accurate answers to the user's questions.

        [Context Documents]
        ${truncatedSource}

        [User Question]
        ${userInput}

        [Instructions]
        1. Answer strictly based on the [Context Documents].
        2. Do not make up information not present in the documents (No Hallucination).
        3. If the answer cannot be found in the documents, reply "I cannot find the relevant information in the provided documents."
        4. Answer in Korean, maintaining a professional and trustworthy tone.
        5. Use appropriate line breaks and markdown (bullet points, etc.) for readability.
        6. Write the answer in Korean.
    `.trim();

    // 3. 최종 토큰 수 확인
    const tokenCount = countTokens(prompts);
    console.log('Total token count:', tokenCount);

    if (tokenCount > MAX_TOKEN) {
        alert(`토큰 수가 너무 많습니다. (${tokenCount} / ${MAX_TOKEN})\n문서 내용이나 질문을 줄여주세요.`);
        return Promise.reject(new Error('Token limit exceeded'));
    }

    // API 호출 (Promise를 반환하므로 호출부에서 처리가 필요할 수 있습니다)
    return APIcall({ body: prompts }, AI_LAMBDA_URL, { 'Content-Type': 'application/json' });
}

export function getRAGdata() {
    return 'No special data';
}
