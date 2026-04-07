/**
 * modal_loader.js
 * 공유 관련 공통 모달 3개를 페이지에 동기적으로 주입합니다.
 *
 * 사용 방법:
 *   1. <body> 태그에 data-share-entity 속성 추가 (예: data-share-entity="기업")
 *   2. <body> 태그에 theme-mode-{type} 클래스 추가 (예: class="theme-mode-companies")
 *   3. 페이지별 JS 로드 직전에 이 스크립트를 <script> 태그로 포함
 *
 * 지원 테마: theme-mode-companies / theme-mode-sellers / theme-mode-buyers
 */
(function () {
    var entity = document.body.dataset.shareEntity || '정보';

    var modalsHTML = `
    <!-- =========================================================
         1. Share Options Modal (공유 방식 선택)
         ========================================================= -->
    <div class="modal" id="share-options-modal" tabindex="-1" aria-labelledby="shareOptionsLabel" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-0" style="border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); overflow: hidden;">
                <div class="modal-header border-0 pb-0 pt-4 px-4 bg-white">
                    <h5 class="modal-title fw-bold" id="shareOptionsLabel" style="font-size: 18px; color: #1e293b;">
                        ${entity} 공유 방식 선택
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body p-4 bg-white">
                    <div class="d-flex flex-column gap-3">

                        <!-- 팀원에게 직접 공유 -->
                        <button type="button" id="btn-share-with-user-trigger"
                            class="share-option-btn share-option-user d-flex align-items-center justify-content-between p-3 rounded-4"
                            style="font-weight: 600; font-size: 15px; transition: all 0.2s; border: 1.5px solid #e2e8f0; background: #ffffff;">
                            <div class="d-flex align-items-center gap-3">
                                <span class="material-symbols-outlined p-2"
                                    style="background: var(--page-theme-light); color: var(--page-theme-color); border-radius: 12px; font-size: 24px; transition: all 0.2s;">group</span>
                                <div class="text-start">
                                    <div style="color: var(--page-theme-color); font-weight: 600; transition: all 0.2s;">팀원에게 직접 공유</div>
                                    <div style="font-size: 12px; color: #94a3b8; font-weight: normal;">딜챗 멤버에게 ${entity}를 전달합니다.</div>
                                </div>
                            </div>
                            <span class="material-symbols-outlined" style="color: var(--page-theme-color); transition: all 0.2s;">chevron_right</span>
                        </button>

                        <!-- 외부 공유 링크 생성 -->
                        <button type="button" id="btn-external-share-trigger"
                            class="share-option-btn share-option-external d-flex align-items-center justify-content-between p-3 rounded-4"
                            style="font-weight: 600; font-size: 15px; transition: all 0.2s; border: 1.5px solid #e2e8f0; background: #ffffff;">
                            <div class="d-flex align-items-center gap-3">
                                <span class="material-symbols-outlined p-2"
                                    style="background: var(--page-theme-light); color: var(--page-theme-color); border-radius: 12px; font-size: 24px; transition: all 0.2s;">share</span>
                                <div class="text-start">
                                    <div style="color: var(--page-theme-color); font-weight: 600; transition: all 0.2s;">외부 공유 링크 생성 (48h)</div>
                                    <div style="font-size: 12px; color: #94a3b8; font-weight: normal;">비회원용 보안 접근 키와 링크를 생성합니다.</div>
                                </div>
                            </div>
                            <span class="material-symbols-outlined" style="color: var(--page-theme-color); transition: all 0.2s;">chevron_right</span>
                        </button>

                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- =========================================================
         2. External Share Modal (48시간 외부 공유)
         ========================================================= -->
    <div class="modal" id="external-share-modal" tabindex="-1" aria-hidden="true" style="z-index: 1065;">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-0" style="border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.15); overflow: hidden;">
                <div class="modal-header border-0 pb-0 pt-4 px-4 bg-white">
                    <h5 class="modal-title fw-bold" style="font-size: 18px; color: #1e293b;">외부 공유하기 (48시간 한정)</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body p-4 bg-white">
                    <div class="row g-2 mb-3">
                        <div class="col-6">
                            <label class="form-label fw-bold" style="font-size: 13px; color: #64748b; margin-bottom: 6px;">이름</label>
                            <input type="text" id="ext-share-recipient" class="form-control" placeholder="성함을 입력하세요"
                                style="border-radius: 12px; font-size: 14px; padding: 12px 16px; border: 1.5px solid #e2e8f0; background: #ffffff;">
                        </div>
                        <div class="col-6">
                            <label class="form-label fw-bold" style="font-size: 13px; color: #64748b; margin-bottom: 6px;">소속</label>
                            <input type="text" id="ext-share-org" class="form-control" placeholder="소속 기관명"
                                style="border-radius: 12px; font-size: 14px; padding: 12px 16px; border: 1.5px solid #e2e8f0; background: #ffffff;">
                        </div>
                    </div>

                    <div id="ext-share-input-row" class="row g-2 align-items-end mb-4">
                        <div class="col-9">
                            <label class="form-label fw-bold" style="font-size: 13px; color: #64748b; margin-bottom: 6px;">공유 목적</label>
                            <input type="text" id="ext-share-reason" class="form-control" placeholder="공유 목적을 간략하게 적어주세요"
                                style="border-radius: 12px; font-size: 14px; padding: 12px 16px; border: 1.5px solid #e2e8f0; background: #ffffff;">
                        </div>
                        <div class="col-3">
                            <button type="button" id="btn-generate-ext-share" class="btn w-100 fw-bold"
                                style="background: var(--page-theme-color); color: #ffffff; border: none; border-radius: 12px; font-size: 14px; height: 48px; box-shadow: 0 4px 12px var(--page-theme-shadow); display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                                키 생성
                            </button>
                        </div>
                    </div>

                    <div id="ext-share-result-area">
                        <div id="ext-share-key-area"
                            style="background: #f8fafc; border-radius: 16px; padding: 24px; border: 1.5px solid #e2e8f0; margin-bottom: 24px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.04); transition: all 0.2s;">
                            <div id="ext-share-key-label" style="font-size: 13px; color: #94a3b8; margin-bottom: 8px; font-weight: 600;">생성된 보안 접근 키</div>
                            <div id="ext-share-key-display"
                                style="font-size: 36px; font-weight: 800; color: #94a3b8; letter-spacing: 4px; margin-bottom: 8px; font-family: 'Outfit', sans-serif;">------</div>
                            <div id="ext-share-expiry" style="font-size: 12px; color: #94a3b8;">생성 후 48시간 동안 유효합니다</div>
                        </div>

                        <div class="mb-4">
                            <label class="form-label fw-bold" style="font-size: 13px; color: #64748b; margin-bottom: 6px;">안내 문구</label>
                            <div id="ext-share-guidance-box"
                                style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 16px; padding: 20px; text-align: left; font-size: 14px; color: #94a3b8; min-height: 140px; white-space: pre-wrap; line-height: 1.6; transition: all 0.2s;">
                                <div class="text-muted">키 생성 후 안내 문구가 이곳에 표시됩니다.</div>
                            </div>
                        </div>

                        <button type="button" id="btn-copy-ext-share" class="btn w-100 py-3 fw-bold"
                            style="background: #94a3b8; color: #ffffff; border: none; border-radius: 12px; font-size: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;" disabled>
                            <span class="material-symbols-outlined" style="font-size: 20px;">content_copy</span>
                            안내문 복사하기
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- =========================================================
         3. Share Modal — User-to-User (팀원 직접 공유)
         ========================================================= -->
    <div class="modal" id="share-modal" tabindex="-1" aria-labelledby="shareModalLabel" aria-hidden="true" style="z-index: 1060;">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-0" style="border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.1);">
                <div class="modal-header border-0 pb-0 pt-4 px-4">
                    <h5 class="modal-title fw-bold" id="shareModalLabel" style="font-size: 20px; color: #1e293b;">
                        ${entity} 공유하기
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body px-4 pt-3 pb-4">
                    <p style="font-size: 14px; color: #64748b; margin-bottom: 20px;">공유할 대상을 선택하고 메모를 남겨주세요.</p>
                    <div class="mb-3 position-relative">
                        <label class="form-label fw-bold" style="font-size: 14px; color: #334155;">수신자 선택</label>
                        <div class="input-group">
                            <span class="input-group-text bg-white border-end-0"
                                style="border-radius: 10px 0 0 10px; border-color: #e2e8f0;">
                                <span class="material-symbols-outlined" style="font-size: 20px; color: #64748b;">search</span>
                            </span>
                            <input type="text" id="share-user-search" class="form-control border-start-0"
                                placeholder="팀원 이름 검색..."
                                style="border-radius: 0 10px 10px 0; font-size: 14px; padding: 10px 12px; border-color: #e2e8f0;">
                        </div>
                        <div id="user-search-results"
                            class="position-absolute w-100 mt-1 shadow-lg border rounded-3 bg-white"
                            style="display: none; z-index: 1050; max-height: 200px; overflow-y: auto;"></div>
                        <div id="selected-users-container" class="d-flex flex-wrap gap-2 p-2 mt-2"
                            style="min-height: 45px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc;">
                            <span class="text-muted p-1" style="font-size: 13px;">이름으로 팀원을 검색하세요.</span>
                        </div>
                    </div>

                    <!-- 파일 첨부 섹션 -->
                    <div class="mb-4">
                        <label class="form-label fw-bold" style="font-size: 14px; color: #334155;">파일 첨부 (선택사항)</label>
                        <div id="share-file-selection-list" class="p-3" 
                            style="max-height: 160px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc;">
                            <div class="text-muted" style="font-size: 13px; text-align: center; padding: 10px 0;">
                                첨부할 수 있는 파일 목록을 불러오는 중입니다...
                            </div>
                        </div>
                    </div>

                    <div class="mb-3">
                        <label for="share-memo" class="form-label fw-bold" style="font-size: 14px; color: #334155;">메모 (선택사항)</label>
                        <textarea id="share-memo" class="form-control" rows="3" placeholder="공유하는 목적이나 참고사항을 적어주세요."
                            style="border-radius: 10px; font-size: 14px; resize: none; border: 1px solid #e2e8f0;"></textarea>
                    </div>
                </div>
                <div class="modal-footer border-0 px-4 pb-4 pt-0">
                    <button type="button" class="btn px-4 py-2 rounded-pill fw-bold" data-bs-dismiss="modal"
                        style="background: #f1f5f9; color: #475569; font-size: 14px;">취소</button>
                    <button type="button" id="btn-submit-share" class="btn px-4 py-2 rounded-pill fw-bold"
                        style="background: var(--page-theme-color); color: #ffffff; border: none; font-size: 14px; box-shadow: 0 4px 12px var(--page-theme-shadow);">보내기</button>
                </div>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalsHTML);

    // Fix: blur any focused element inside a modal before Bootstrap sets aria-hidden="true",
    // which would otherwise trigger the "Blocked aria-hidden on focused element" warning.
    ['share-options-modal', 'external-share-modal', 'share-modal'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('hide.bs.modal', function() {
                if (document.activeElement && el.contains(document.activeElement)) {
                    document.activeElement.blur();
                }
            });
        }
    });
})();
