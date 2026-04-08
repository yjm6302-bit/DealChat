/**
 * pagination_utils.js - 프로젝트 전체에서 공유하는 페이지네이션 유틸리티
 * 
 * [사용법]
 * import { renderPagination } from './pagination_utils.js';
 * 
 * renderPagination({
 *     containerId: 'pagination-container',
 *     totalItems: filteredList.length,
 *     itemsPerPage: 15,
 *     currentPage: currentPage,
 *     onPageChange: (newPage) => {
 *         currentPage = newPage;
 *         renderList(); // 데이터 렌더링 함수 호출
 *     },
 *     scrollToSelector: '.search-and-actions' // 페이지 변경 시 스크롤할 위치 (선택사항)
 * });
 */

/**
 * 페이지네이션 버튼을 생성하고 클릭 이벤트를 설정합니다.
 * @param {Object} options - 설정 옵션
 */
export function renderPagination(options) {
    const {
        containerId = 'pagination-container',
        totalItems,
        itemsPerPage,
        currentPage,
        onPageChange,
        scrollToSelector = null
    } = options;

    const $container = $(`#${containerId}`);
    if (!$container.length) return;

    $container.empty();
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages < 1) return;

    // 전역 changePage 함수 등록
    window.changePage = (page) => {
        if (page < 1 || page > totalPages || page === currentPage) return;
        
        // 1. 외부 콜백 호출 (데이터 렌더링 등)
        onPageChange(page);
        
        // 2. 내부에서 다시 렌더링 (새로운 현재 페이지 반영)
        renderPagination({
            ...options,
            currentPage: page
        });
        
        // 3. 스크롤 이동
        if (scrollToSelector) {
            const $target = $(scrollToSelector);
            if ($target.length) {
                $target[0].scrollIntoView({ behavior: 'smooth' });
            }
        }
    };

    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';

    // [Standard 디자인: my_companies.html 기준]
    // 처음으로
    $container.append(`<button class="pg-btn" ${prevDisabled} onclick="changePage(1)"><span class="material-symbols-outlined">keyboard_double_arrow_left</span></button>`);
    // 이전
    $container.append(`<button class="pg-btn" ${prevDisabled} onclick="changePage(${currentPage - 1})"><span class="material-symbols-outlined">chevron_left</span></button>`);

    // 숫자 버튼 범위 계산 (현재 페이지 기준 앞뒤 2개씩, 총 5개)
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }

    for (let i = startPage; i <= endPage; i++) {
        const activeClass = i === currentPage ? 'active' : '';
        $container.append(`<button class="pg-btn ${activeClass}" onclick="changePage(${i})">${i}</button>`);
    }

    // 다음
    $container.append(`<button class="pg-btn" ${nextDisabled} onclick="changePage(${currentPage + 1})"><span class="material-symbols-outlined">chevron_right</span></button>`);
    // 마지막으로
    $container.append(`<button class="pg-btn" ${nextDisabled} onclick="changePage(${totalPages})"><span class="material-symbols-outlined">keyboard_double_arrow_right</span></button>`);
}
