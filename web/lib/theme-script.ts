export const KEY = "hr-theme";
export const COLORS = { light: "#fafaf8", dark: "#121211" } as const;

/* Runs in <head> before paint so a dark choice never flashes white */
export const themeScript = `(function(){try{var c=localStorage.getItem("${KEY}");var d=c==="dark"||(c==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d){document.documentElement.dataset.theme="dark";document.addEventListener("DOMContentLoaded",function(){document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.content="${COLORS.dark}"})})}}catch(e){}})()`;
