/**
 * Config
 * -------------------------------------------------------------------------------------
 * ! IMPORTANT: Make sure you clear the browser local storage In order to see the config changes in the template.
 * ! To clear local storage: (https://www.leadshook.com/help/how-to-clear-local-storage-in-google-chrome-browser/).
 */

'use strict';

window.assetsPath = document.documentElement.getAttribute('data-assets-path');
window.templateName = document.documentElement.getAttribute('data-template');

// JS global variables
window.config = {
  // global color variables for charts except chartjs
  colors: {
    black: '#1a1c1e',
    white: '#ffffff',
    cardColor: '#ffffff'
  },
  supabase: {
    url: 'https://pqhqmvymssjtjhmiloga.supabase.co',
    anonKey: 'sb_publishable_NSrXrC4dpsKnPBviNDl-7g_fcNZeH4I',
    uploadHandlerUrl: 'https://pqhqmvymssjtjhmiloga.supabase.co/functions/v1/upload-handler',
    aiHandlerUrl: 'https://pqhqmvymssjtjhmiloga.supabase.co/functions/v1/ai-handler'
  },
  ai: {
    model: 'gpt-4o-mini', // Current model in use (best cost-performance)
    tokenLimits: {
      // 1. gpt-4o-mini - Best value: Fastest, cheapest, 128k context
      'gpt-4o-mini': {
        maxContextTokens: 128000,
        maxOutputTokens: 16384,
        safetyMargin: 5000
      },
      // 2. gpt-5-mini - Entry-level GPT-5: 256k context
      'gpt-5-mini': {
        maxContextTokens: 256000,
        maxOutputTokens: 32768,
        safetyMargin: 10000
      },
      // 3. gpt-5-nano - Compact GPT-5: 512k context
      'gpt-5-nano': {
        maxContextTokens: 512000,
        maxOutputTokens: 65536,
        safetyMargin: 20000
      },
      // 4. gpt-5.2 - Advanced GPT-5: 1M context
      'gpt-5.2': {
        maxContextTokens: 1000000,
        maxOutputTokens: 100000,
        safetyMargin: 50000
      },
      // 5. chatgpt-4o - ChatGPT flagship: 200k context
      'chatgpt-4o': {
        maxContextTokens: 200000,
        maxOutputTokens: 16384,
        safetyMargin: 10000
      }
    }
  }
};
/**
 * TemplateCustomizer settings
 * -------------------------------------------------------------------------------------
 * cssPath: Core CSS file path
 * themesPath: Theme CSS file path
 * displayCustomizer: true(Show customizer), false(Hide customizer)
 * lang: To set default language, Add more langues and set default. Fallback language is 'en'
 * controls: [ 'rtl', 'style', 'headerType', 'contentLayout', 'layoutCollapsed', 'layoutNavbarOptions', 'themes' ] | Show/Hide customizer controls
 * defaultTheme: 'light', 'dark', 'system' (Mode)
 * defaultTextDir: 'ltr', 'rtl' (Direction)
 */

if (typeof TemplateCustomizer !== 'undefined') {
  window.templateCustomizer = new TemplateCustomizer({
    displayCustomizer: false,
    // defaultTextDir: 'rtl',
    // defaultTheme: 'dark',
    controls: ['color', 'theme', 'rtl']
  });
}
