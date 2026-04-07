/**
 * utils.js — 프로젝트 전체에서 공유하는 순수 유틸리티 함수 모음
 *
 * 브라우저/Node 양쪽에서 동작하는 순수 함수만 포함합니다.
 * DOM 접근, Supabase 호출, jQuery 의존 코드는 넣지 않습니다.
 */

/**
 * HTML 특수 문자를 이스케이프합니다.
 * XSS 방지 목적으로 사용자 입력을 DOM에 삽입하기 전에 호출합니다.
 *
 * @param {*} unsafe - 이스케이프할 값 (문자열 외 타입은 String으로 변환)
 * @returns {string}
 */
export function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * escapeHtml과 동일하지만 줄바꿈(\n)을 <br>로 변환합니다.
 * 채팅 메시지처럼 멀티라인 텍스트를 HTML로 표시할 때 사용합니다.
 *
 * @param {*} text
 * @returns {string}
 */
export function escapeForDisplay(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>');
}

/**
 * 함수 호출을 delay ms 동안 지연시키는 디바운스 래퍼입니다.
 * 검색 입력처럼 빠른 연속 이벤트에서 마지막 호출만 실행할 때 사용합니다.
 *
 * @param {Function} fn - 래핑할 함수
 * @param {number} delay - 지연 시간 (밀리초)
 * @returns {Function}
 */
export function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * 잘린 JSON 문자열을 닫히지 않은 괄호를 추가해 복구를 시도합니다.
 * AI 응답이 최대 토큰 한도로 잘렸을 때 JSON.parse 전에 호출합니다.
 *
 * @param {string} str - 불완전할 수 있는 JSON 문자열
 * @returns {string} 복구 시도된 JSON 문자열
 */
export function tryRepairJson(str) {
    let repaired = str.trim();

    // 마지막이 쉼표로 끝난다면 제거
    if (repaired.endsWith(',')) {
        repaired = repaired.slice(0, -1);
    }

    const stack = [];
    for (let i = 0; i < repaired.length; i++) {
        if (repaired[i] === '{') stack.push('}');
        else if (repaired[i] === '[') stack.push(']');
        else if (repaired[i] === '}') {
            if (stack[stack.length - 1] === '}') stack.pop();
        } else if (repaired[i] === ']') {
            if (stack[stack.length - 1] === ']') stack.pop();
        }
    }

    // 닫히지 않은 괄호를 스택 역순으로 추가
    while (stack.length > 0) {
        repaired += stack.pop();
    }

    return repaired;
}

/**
 * 텍스트에서 식별 키워드를 ○○○으로 마스킹합니다.
 * 비밀유지 의무가 있는 정보를 표시할 때 사용합니다.
 *
 * @param {string} text - 원본 텍스트
 * @param {string[]} keywords - 마스킹할 키워드 배열
 * @returns {string}
 */
export function applyKeywordsMasking(text, keywords) {
    if (!text || !keywords || keywords.length === 0) return text;
    let result = text;
    keywords.forEach(kw => {
        if (!kw) return;
        const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedKw, 'gi');
        result = result.replace(regex, '○○○');
    });
    return result;
}

/**
 * 산업군 select 값을 최종 저장 문자열로 변환합니다.
 * '기타' 선택 시 직접 입력값을 검증하고 "기타: {값}" 형태로 반환합니다.
 *
 * @param {string} industryBase - select 요소의 현재 값
 * @param {string} otherVal - '기타' 선택 시 직접 입력된 값
 * @returns {{ value: string } | { error: string }}
 */
export function resolveIndustry(industryBase, otherVal) {
    if (!industryBase) return { error: '산업을 선택해주세요.' };
    if (industryBase === '기타') {
        const trimmed = (otherVal || '').trim();
        if (!trimmed) return { error: '기타 산업명을 직접 입력해주세요.' };
        return { value: `기타: ${trimmed}` };
    }
    return { value: industryBase };
}

/**
 * 관리 현황 칩 값을 최종 저장 문자열로 변환합니다.
 * '기타' 선택 시 직접 입력값을 검증하고 "기타: {값}" 형태로 반환합니다.
 *
 * @param {string} status - 선택된 칩의 data-value
 * @param {string} otherVal - '기타' 선택 시 직접 입력된 값
 * @returns {{ value: string } | { error: string }}
 */
export function resolveMgmtStatus(status, otherVal) {
    if (!status) return { error: '관리 현황을 선택해주세요.' };
    if (status === '기타') {
        const trimmed = (otherVal || '').trim();
        if (!trimmed) return { error: '기타 관리 현황을 직접 입력해주세요.' };
        return { value: `기타: ${trimmed}` };
    }
    return { value: status };
}

/**
 * 재무 데이터 배열을 AI 컨텍스트용 텍스트로 변환합니다.
 *
 * @param {Array<{year: string, revenue: string, profit: string, net: string}>} rows
 * @returns {string}
 */
export function buildFinancialString(rows) {
    if (!rows || rows.length === 0) return '';
    return rows
        .filter(r => r.year || r.revenue || r.profit || r.net)
        .map(r => `- ${r.year}년: 매출 ${r.revenue}원, 영업이익 ${r.profit}원, 순이익 ${r.net}원`)
        .join('\n');
}

/**
 * 투자 데이터 배열을 AI 컨텍스트용 텍스트로 변환합니다.
 *
 * @param {Array<{year: string, stage: string, valuation: string, amount: string, investor: string}>} rows
 * @returns {string}
 */
export function buildInvestmentString(rows) {
    if (!rows || rows.length === 0) return '';
    return rows
        .filter(r => r.year || r.stage || r.valuation || r.amount || r.investor)
        .map(r => `- ${r.year}년: ${r.stage || '단계미상'}, 밸류 ${r.valuation}원, 투자금 ${r.amount}원, 투자사 ${r.investor}`)
        .join('\n');
}

/**
 * AI 채팅에 전달할 기업 컨텍스트 문자열을 조립합니다.
 *
 * @param {{ name: string, industry: string, summary: string, financialStr: string, investmentStr: string, financialAnalysis: string, managerMemo: string, ragContext: string }} info
 * @returns {string}
 */
export function buildChatContext({ name, industry, summary, financialStr, investmentStr, financialAnalysis, managerMemo, ragContext }) {
    return `
[기업 기본 정보]
기업명: ${name || ''}
분야: ${industry || ''}
요약: ${summary || ''}

[재무 데이터]
${financialStr || '(등록된 데이터 없음)'}

[투자 데이터]
${investmentStr || '(등록된 데이터 없음)'}

[재무 분석 및 코멘트]
${financialAnalysis || ''}

[매니저 메모]
${managerMemo || ''}

[관련 문서/파일 참고 자료]
${ragContext || ''}
`.trim();
}
