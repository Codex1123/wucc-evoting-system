function getSavedTheme(){
  try{return localStorage.getItem('wucc-theme');}
  catch(e){return null;}
}

function saveTheme(theme){
  try{localStorage.setItem('wucc-theme',theme);}
  catch(e){}
}

function prefersDarkTheme(){
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(theme){
  var mode=theme || getSavedTheme() || (prefersDarkTheme()?'dark':'light');
  var isDark=mode==='dark';
  document.documentElement.classList.toggle('theme-dark',isDark);
  if(document.body)document.body.classList.toggle('theme-dark',isDark);

  var label=isDark?'Switch to light mode':'Switch to dark mode';
  ['themeToggle','themeToggleMobile'].forEach(function(id){
    var btn=el(id);
    if(btn){
      btn.setAttribute('aria-label',label);
      btn.setAttribute('title',label);
    }
  });

  var iconClass=isDark?'bi-sun-fill':'bi-moon-stars-fill';
  ['themeToggleIcon','themeToggleMobileIcon'].forEach(function(id){
    var icon=el(id);
    if(icon)icon.className='bi '+iconClass;
  });

  setText('themeToggleMobileText',isDark?'Light mode':'Dark mode');
}

function toggleTheme(){
  var next=document.documentElement.classList.contains('theme-dark')?'light':'dark';
  saveTheme(next);
  applyTheme(next);
}
