// Runs in <head> before the first paint so the page never flashes the wrong
// theme. Keep the key and logic in step with src/lib/theme.ts.
export const THEME_KEY = "crowdmap-theme";
export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem('${THEME_KEY}');var d=c==='dark'||(c!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
