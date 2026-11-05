export const fontOptions = [
  { id: 'dm-sans', name: 'DM Sans', family: 'DM Sans Variable', description: 'Soft & simple' },
  { id: 'inter', name: 'Inter', family: 'Inter Variable', description: 'Clean & familiar' },
  { id: 'manrope', name: 'Manrope', family: 'Manrope Variable', description: 'Rounded & calm' },
  { id: 'plus-jakarta-sans', name: 'Plus Jakarta Sans', family: 'Plus Jakarta Sans Variable', description: 'Airy & friendly' },
  { id: 'geist', name: 'Geist', family: 'Geist Variable', description: 'Crisp & minimal' },
] as const;
const preferenceKey = 'soundroom-font';
export function selectedFont() {
  try { return fontOptions.find(font => font.id === localStorage.getItem(preferenceKey)) ?? fontOptions[0]; }
  catch { return fontOptions[0]; }
}
export function applyFont(font: typeof fontOptions[number]) {
  document.documentElement.style.setProperty('--ui-font', `"${font.family}", system-ui, sans-serif`);
  try { localStorage.setItem(preferenceKey, font.id); } catch { /* Preview still works if storage is unavailable. */ }
}
