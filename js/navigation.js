// ── NAVIGATION ────────────────────────────────────────────────
function showPage(id){
  var validPages={home:true,dashboard:true,results:true,apply:true,about:true,admin:true,vote:true};
  if(!validPages[id])id='home';
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active');});
  var pg=el('page-'+id); if(pg)pg.classList.add('active');
  ['Home','Dash','Results','Apply','About','Admin'].forEach(function(n){
    var l=el('n'+n); if(l)l.classList.remove('active');
  });
  var navMap={home:'nHome',dashboard:'nDash',results:'nResults',apply:'nApply',about:'nAbout',admin:'nAdmin',vote:'nHome'};
  if(navMap[id]){var l=el(navMap[id]);if(l)l.classList.add('active');}
  window.scrollTo(0,0);
  applyElectionUiState();
  if(id==='home'){updateHomeStats();renderHomePosCards();}
  if(id==='results'){renderResults();}
  if(id==='dashboard'){renderDashboard();}
  if(id==='admin'){if(S.adminRole)showAdminDash();}
  if(id==='apply'){populateApplyPositions();}
  if(window.location.hash.replace('#','')!==id){
    window.history.replaceState(null,'','#'+id);
  }
}
function goHome(){showPage('home');}

// ── COUNTDOWN ─────────────────────────────────────────────────
function updateCountdown(){
  var target=S.electionActive?S.electionEnd:S.electionStart;
  var diff=target?(target-Date.now()):0; if(diff<0)diff=0;
  var d=Math.floor(diff/86400000),h=Math.floor((diff%86400000)/3600000),
      m=Math.floor((diff%3600000)/60000),s=Math.floor((diff%60000)/1000);
  function pad(n){return String(n).padStart(2,'0');}
  setText('cd-d',pad(d)); setText('cd-h',pad(h)); setText('cd-m',pad(m)); setText('cd-s',pad(s));
  setText('adm-cd-d',pad(d)); setText('adm-cd-h',pad(h)); setText('adm-cd-m',pad(m)); setText('adm-cd-s',pad(s));
}
setInterval(updateCountdown,1000);
