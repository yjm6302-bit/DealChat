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
    url: 'https://afitwguexwihnepyutqw.supabase.co',
    anonKey: 'sb_publishable_ZRX8BCMSV4A1WDgzVh5q-A_sz5vaNH5',
    uploadHandlerUrl: 'https://afitwguexwihnepyutqw.supabase.co/functions/v1/upload-handler',
    aiHandlerUrl: 'https://afitwguexwihnepyutqw.supabase.co/functions/v1/ai-handler'
  },
  ai: {
    model: 'gemini-2.0-flash', 
    tokenLimits: {
      'gemini-2.0-flash': { maxContextTokens: 1000000, maxOutputTokens: 8192, safetyMargin: 1000 },
      'gemini-1.5-pro': { maxContextTokens: 2000000, maxOutputTokens: 8192, safetyMargin: 2000 },
      'gemini-1.5-flash': { maxContextTokens: 1000000, maxOutputTokens: 8192, safetyMargin: 1000 },
      'gemini-1.5-flash-8b': { maxContextTokens: 1000000, maxOutputTokens: 8192, safetyMargin: 1000 }
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
