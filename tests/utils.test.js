/**
 * utils.js 테스트
 *
 * 목적: 리팩토링으로 추출된 공통 순수 함수의 동작을 기록하고 보호한다.
 *   - escapeHtml: HTML 특수 문자 이스케이프
 *   - resolveIndustry: 산업군 select 값 → 저장 문자열 변환
 *   - resolveMgmtStatus: 관리 현황 칩 값 → 저장 문자열 변환
 *   - escapeForDisplay: escapeHtml + 줄바꿈 → <br>
 *   - debounce: 디바운스 동작
 *   - tryRepairJson: 잘린 JSON 복구
 *   - applyKeywordsMasking: 키워드 마스킹
 */
import { escapeHtml, escapeForDisplay, debounce, tryRepairJson, applyKeywordsMasking, resolveIndustry, resolveMgmtStatus, buildFinancialString, buildInvestmentString, buildChatContext } from '../js/utils.js';

// ─── escapeHtml ────────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
    test('& < > " \' 를 엔티티로 변환', () => {
        expect(escapeHtml('a & b')).toBe('a &amp; b');
        expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
        expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
        expect(escapeHtml("it's")).toBe("it&#039;s");
    });

    test('특수 문자 없는 문자열은 그대로 반환', () => {
        expect(escapeHtml('hello world')).toBe('hello world');
    });

    test('null / undefined → 빈 문자열', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });

    test('숫자 0은 빈 문자열이 아닌 "0" 반환', () => {
        expect(escapeHtml(0)).toBe('0');
    });

    test('숫자는 문자열로 변환', () => {
        expect(escapeHtml(42)).toBe('42');
    });
});

// ─── escapeForDisplay ──────────────────────────────────────────────────────────

describe('escapeForDisplay', () => {
    test('HTML 특수 문자를 이스케이프', () => {
        expect(escapeForDisplay('<b>bold</b>')).toBe('&lt;b&gt;bold&lt;/b&gt;');
    });

    test('줄바꿈(\\n)을 <br>로 변환', () => {
        expect(escapeForDisplay('line1\nline2')).toBe('line1<br>line2');
    });

    test('빈/falsy 값 → 빈 문자열', () => {
        expect(escapeForDisplay('')).toBe('');
        expect(escapeForDisplay(null)).toBe('');
        expect(escapeForDisplay(undefined)).toBe('');
    });

    test('복합 케이스: 특수 문자 + 줄바꿈', () => {
        expect(escapeForDisplay('<b>\ntest')).toBe('&lt;b&gt;<br>test');
    });
});

// ─── debounce ──────────────────────────────────────────────────────────────────

describe('debounce', () => {
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });

    test('delay 이내 연속 호출 시 마지막 한 번만 실행', () => {
        const fn = jest.fn();
        const debounced = debounce(fn, 200);

        debounced();
        debounced();
        debounced();
        expect(fn).not.toHaveBeenCalled();

        jest.advanceTimersByTime(200);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    test('delay 초과 후 각 호출이 독립적으로 실행', () => {
        const fn = jest.fn();
        const debounced = debounce(fn, 100);

        debounced();
        jest.advanceTimersByTime(100);
        debounced();
        jest.advanceTimersByTime(100);

        expect(fn).toHaveBeenCalledTimes(2);
    });

    test('인수를 올바르게 전달', () => {
        const fn = jest.fn();
        const debounced = debounce(fn, 50);

        debounced('hello', 42);
        jest.advanceTimersByTime(50);

        expect(fn).toHaveBeenCalledWith('hello', 42);
    });
});

// ─── tryRepairJson ─────────────────────────────────────────────────────────────

describe('tryRepairJson', () => {
    test('완전한 JSON은 그대로 반환', () => {
        const input = '{"name":"test"}';
        expect(tryRepairJson(input)).toBe(input);
    });

    test('닫히지 않은 중괄호를 자동으로 닫음', () => {
        const repaired = tryRepairJson('{"name":"test"');
        expect(() => JSON.parse(repaired)).not.toThrow();
        expect(JSON.parse(repaired)).toEqual({ name: 'test' });
    });

    test('닫히지 않은 배열을 자동으로 닫음', () => {
        const repaired = tryRepairJson('[1, 2, 3');
        expect(() => JSON.parse(repaired)).not.toThrow();
        expect(JSON.parse(repaired)).toEqual([1, 2, 3]);
    });

    test('중첩 구조 복구', () => {
        const repaired = tryRepairJson('{"a": [1, 2');
        expect(() => JSON.parse(repaired)).not.toThrow();
    });

    test('끝에 쉼표가 있으면 제거', () => {
        const repaired = tryRepairJson('{"name":"test",');
        // 복구 후 파싱 가능해야 함
        expect(() => JSON.parse(repaired)).not.toThrow();
    });

    test('앞뒤 공백을 무시', () => {
        const repaired = tryRepairJson('  {"x":1}  ');
        expect(JSON.parse(repaired)).toEqual({ x: 1 });
    });
});

// ─── applyKeywordsMasking ──────────────────────────────────────────────────────

describe('applyKeywordsMasking', () => {
    test('키워드를 ○○○으로 대체', () => {
        expect(applyKeywordsMasking('삼성전자 주식', ['삼성전자'])).toBe('○○○ 주식');
    });

    test('대소문자 구분 없이 마스킹 (영문)', () => {
        expect(applyKeywordsMasking('Apple is good', ['apple'])).toBe('○○○ is good');
    });

    test('여러 키워드 동시 마스킹', () => {
        const result = applyKeywordsMasking('가나다 라마바', ['가나다', '라마바']);
        expect(result).toBe('○○○ ○○○');
    });

    test('키워드 배열이 비어 있으면 원본 반환', () => {
        expect(applyKeywordsMasking('hello', [])).toBe('hello');
    });

    test('텍스트가 빈 문자열이면 빈 문자열 반환', () => {
        expect(applyKeywordsMasking('', ['keyword'])).toBe('');
    });

    test('텍스트가 null이면 null 반환', () => {
        expect(applyKeywordsMasking(null, ['keyword'])).toBe(null);
    });

    test('정규식 특수 문자가 포함된 키워드도 안전하게 처리', () => {
        expect(applyKeywordsMasking('가격: (주)삼성', ['(주)삼성'])).toBe('가격: ○○○');
    });
});

// ─── resolveIndustry ───────────────────────────────────────────────────────────

describe('resolveIndustry', () => {
    test('일반 산업군 선택 → value 반환', () => {
        expect(resolveIndustry('AI', '')).toEqual({ value: 'AI' });
        expect(resolveIndustry('바이오·헬스케어', '')).toEqual({ value: '바이오·헬스케어' });
    });

    test('빈 값 선택 → error 반환', () => {
        expect(resolveIndustry('', '')).toHaveProperty('error');
        expect(resolveIndustry(null, '')).toHaveProperty('error');
    });

    test('기타 선택 + 직접 입력값 있음 → "기타: {값}" 반환', () => {
        expect(resolveIndustry('기타', '반도체')).toEqual({ value: '기타: 반도체' });
    });

    test('기타 선택 + 직접 입력값 없음 → error 반환', () => {
        expect(resolveIndustry('기타', '')).toHaveProperty('error');
        expect(resolveIndustry('기타', '   ')).toHaveProperty('error');
    });

    test('기타 직접 입력값 앞뒤 공백 제거', () => {
        expect(resolveIndustry('기타', '  우주항공  ')).toEqual({ value: '기타: 우주항공' });
    });
});

// ─── resolveMgmtStatus ─────────────────────────────────────────────────────────

describe('resolveMgmtStatus', () => {
    test('일반 칩 선택 → value 반환', () => {
        expect(resolveMgmtStatus('발굴기업', '')).toEqual({ value: '발굴기업' });
        expect(resolveMgmtStatus('투자검토', '')).toEqual({ value: '투자검토' });
    });

    test('빈/미선택 → error 반환', () => {
        expect(resolveMgmtStatus('', '')).toHaveProperty('error');
        expect(resolveMgmtStatus(null, '')).toHaveProperty('error');
        expect(resolveMgmtStatus(undefined, '')).toHaveProperty('error');
    });

    test('기타 선택 + 직접 입력값 있음 → "기타: {값}" 반환', () => {
        expect(resolveMgmtStatus('기타', '파트너십')).toEqual({ value: '기타: 파트너십' });
    });

    test('기타 선택 + 직접 입력값 없음 → error 반환', () => {
        expect(resolveMgmtStatus('기타', '')).toHaveProperty('error');
        expect(resolveMgmtStatus('기타', '   ')).toHaveProperty('error');
    });

    test('기타 직접 입력값 앞뒤 공백 제거', () => {
        expect(resolveMgmtStatus('기타', '  검토중  ')).toEqual({ value: '기타: 검토중' });
    });
});

// ─── buildFinancialString ──────────────────────────────────────────────────────

describe('buildFinancialString', () => {
    test('정상 데이터 → 형식에 맞는 문자열', () => {
        const rows = [{ year: '2023', revenue: '1000', profit: '100', net: '50' }];
        expect(buildFinancialString(rows)).toBe('- 2023년: 매출 1000원, 영업이익 100원, 순이익 50원');
    });

    test('여러 행 → 줄바꿈으로 구분', () => {
        const rows = [
            { year: '2022', revenue: '800', profit: '80', net: '40' },
            { year: '2023', revenue: '1000', profit: '100', net: '50' },
        ];
        const result = buildFinancialString(rows);
        expect(result).toContain('2022년');
        expect(result).toContain('2023년');
        expect(result.split('\n')).toHaveLength(2);
    });

    test('모든 값이 빈 행은 제외', () => {
        const rows = [
            { year: '', revenue: '', profit: '', net: '' },
            { year: '2023', revenue: '500', profit: '50', net: '25' },
        ];
        const result = buildFinancialString(rows);
        expect(result.split('\n')).toHaveLength(1);
        expect(result).toContain('2023년');
    });

    test('빈 배열 → 빈 문자열', () => {
        expect(buildFinancialString([])).toBe('');
    });

    test('null/undefined → 빈 문자열', () => {
        expect(buildFinancialString(null)).toBe('');
        expect(buildFinancialString(undefined)).toBe('');
    });
});

// ─── buildInvestmentString ─────────────────────────────────────────────────────

describe('buildInvestmentString', () => {
    test('정상 데이터 → 형식에 맞는 문자열', () => {
        const rows = [{ year: '2023', stage: 'Series A', valuation: '50000', amount: '5000', investor: '카카오벤처스' }];
        const result = buildInvestmentString(rows);
        expect(result).toContain('2023년');
        expect(result).toContain('Series A');
        expect(result).toContain('카카오벤처스');
    });

    test('stage 없으면 "단계미상" 표시', () => {
        const rows = [{ year: '2023', stage: '', valuation: '10000', amount: '1000', investor: '투자사A' }];
        expect(buildInvestmentString(rows)).toContain('단계미상');
    });

    test('모든 값이 빈 행은 제외', () => {
        const rows = [
            { year: '', stage: '', valuation: '', amount: '', investor: '' },
            { year: '2023', stage: 'Seed', valuation: '5000', amount: '500', investor: 'VC' },
        ];
        const result = buildInvestmentString(rows);
        expect(result.split('\n')).toHaveLength(1);
    });

    test('빈 배열 → 빈 문자열', () => {
        expect(buildInvestmentString([])).toBe('');
    });
});

// ─── buildChatContext ──────────────────────────────────────────────────────────

describe('buildChatContext', () => {
    const base = {
        name: '테스트기업',
        industry: 'AI',
        summary: '회사 소개',
        financialStr: '- 2023년: 매출 1000원',
        investmentStr: '- 2023년: Seed',
        financialAnalysis: '성장세 양호',
        managerMemo: '중요 미팅 예정',
        ragContext: '문서 내용',
    };

    test('모든 필드가 결과 문자열에 포함', () => {
        const result = buildChatContext(base);
        expect(result).toContain('테스트기업');
        expect(result).toContain('AI');
        expect(result).toContain('회사 소개');
        expect(result).toContain('2023년: 매출 1000원');
        expect(result).toContain('성장세 양호');
        expect(result).toContain('중요 미팅 예정');
        expect(result).toContain('문서 내용');
    });

    test('financialStr 없으면 "(등록된 데이터 없음)" 표시', () => {
        const result = buildChatContext({ ...base, financialStr: '' });
        expect(result).toContain('(등록된 데이터 없음)');
    });

    test('investmentStr 없으면 "(등록된 데이터 없음)" 표시', () => {
        const result = buildChatContext({ ...base, investmentStr: '' });
        expect(result).toContain('(등록된 데이터 없음)');
    });

    test('결과가 trim된 문자열 (앞뒤 공백 없음)', () => {
        const result = buildChatContext(base);
        expect(result).toBe(result.trim());
    });

    test('[기업 기본 정보] 섹션 헤더 포함', () => {
        expect(buildChatContext(base)).toContain('[기업 기본 정보]');
    });
});
