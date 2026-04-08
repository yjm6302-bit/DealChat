/**
 * DealChat 리포트 모드 공통 유틸리티 (ES Module)
 * 
 * 주요 기능:
 * 1. applyReportMode(config): 리포트 전용 스타일 적용, 워터마크 추가, 입력 필드 비활성화 및 텍스트 변환
 * 2. removeReportMode(): 리포트 모드 해제 및 원래 상태 복구
 */

export function applyReportMode(config) {
  const {
    primaryColor = '#8b5cf6',
    cardWidth = '900px',
    hideSelectors = '',
    textareaIds = [],
    afterApply = null
  } = config;

  // 1. 중복 적용 방지
  if ($('#report-mode-css').length > 0) return;

  // 2. 리포트 모드 전용 CSS 주입
  const styleTag = `
<style id="report-mode-css">
:root {
  --report-primary: ${primaryColor};
  --report-bg: #ffffff;
  --report-text: #475569;
  --report-text-dark: #1e293b;
  --report-border: #e2e8f0;
  --report-table-header: #f8fafc;
}

body { 
  background: #f8fafc !important; 
  overflow-y: auto !important; 
  height: auto !important; 
}

.app-container { 
  display: block !important; 
  padding: 60px 0 !important; 
  height: auto !important; 
  background: #f8fafc !important; 
}

.sidebar, #report-share-container {
  width: ${cardWidth} !important; 
  max-width: 95% !important;
  margin: 0 auto !important; 
  display: block !important; 
  box-sizing: border-box !important;
}

.sidebar {
  background: var(--report-bg) !important; 
  border: 1px solid var(--report-border) !important;
  border-radius: 20px !important; 
  height: auto !important; 
  overflow: visible !important;
  box-shadow: 0 12px 48px rgba(0,0,0,0.08) !important;
}

.sidebar .panel-header {
  background: var(--report-primary) !important; 
  color: #fff !important;
  border-radius: 19px 19px 0 0 !important;
}

.sidebar-nav { 
  padding: 40px !important; 
  gap: 32px !important; 
  height: auto !important; 
}

.report-text-content {
  font-size: 14px; 
  color: var(--report-text); 
  line-height: 1.6;
  white-space: pre-wrap; 
  word-break: break-word;
}

input:disabled, select:disabled {
  border: none !important; 
  background: transparent !important;
  color: var(--report-text) !important; 
  cursor: default !important;
  font-size: 14px !important; 
  font-weight: 500 !important;
  -webkit-text-fill-color: var(--report-text) !important;
}

textarea:disabled { 
  display: none !important; 
}

.main-content, .right-panel, .panel-resize-handle { 
  display: none !important; 
}

.report-table-header {
  background: var(--report-table-header) !important;
  border-top: 1.5px solid var(--report-primary) !important;
  border-bottom: 1.5px solid var(--report-primary) !important;
}

.report-table-row { 
  display: flex !important; 
  border-bottom: 1px solid #f1f5f9 !important; 
}

.report-table-cell {
  padding: 12px 10px !important; 
  font-size: 13.5px !important;
  flex: 1; 
  display: flex !important; 
  align-items: center;
  border-right: 1px solid var(--report-border) !important;
  color: var(--report-text) !important;
}

.report-table-cell:last-child { 
  border-right: none !important; 
}

.report-table-header .report-table-cell { 
  color: var(--report-primary) !important; 
  font-weight: 700 !important; 
}

${hideSelectors} { 
  display: none !important; 
}
</style>
`;
  $('head').append(styleTag);

  // 3. 워터마크 삽입
  if ($('#report-watermark').length === 0) {
    $('<div id="report-watermark">DealChat</div>')
      .css({
        'position': 'fixed',
        'top': '50%',
        'left': '50%',
        'transform': 'translate(-50%,-50%) rotate(-30deg)',
        'font-size': '100px',
        'font-weight': '900',
        'color': 'var(--report-primary)',
        'opacity': '0.03',
        'pointer-events': 'none',
        'z-index': '9999',
        'user-select': 'none',
        'white-space': 'nowrap'
      })
      .appendTo('body');
  }

  // 4. textarea 처리: 내용을 div로 교체하고 원본 textarea 숨김
  if (Array.isArray(textareaIds)) {
    textareaIds.forEach(id => {
      const $ta = $(`#${id}`);
      if ($ta.length > 0) {
        const content = $ta.val();
        $ta.after($('<div class="report-text-content">').text(content));
        $ta.hide();
      }
    });
  }

  // 5. 모든 입력 요소 비활성화 및 contenteditable 해제
  $('input, select, textarea').prop('disabled', true);
  $('[contenteditable]')
    .attr('contenteditable', 'false')
    .parent()
    .css({ 'background': 'transparent', 'border': 'none' });

  // 6. 적용 후 콜백 실행
  if (typeof afterApply === 'function') {
    afterApply();
  }
}

export function removeReportMode() {
  // 1. 추가된 스타일 및 워터마크 제거
  $('#report-mode-css, #report-watermark').remove();

  // 2. 변환된 텍스트 컨텐츠 제거 및 원본 textarea 복원
  $('.report-text-content').each(function() {
    $(this).prev('textarea').show();
    $(this).remove();
  });

  // 3. 입기 가능하도록 입력 요소 활성화
  $('input, select, textarea').prop('disabled', false);

  // 4. contenteditable 속성 복원
  $('[contenteditable]').attr('contenteditable', 'true');
}
