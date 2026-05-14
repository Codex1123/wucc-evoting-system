// ── HELPERS ───────────────────────────────────────────────────
function el(id){return document.getElementById(id);}
function setHtml(id,v){var e=el(id);if(e)e.innerHTML=v;}
function setText(id,v){var e=el(id);if(e)e.textContent=v;}
function randHex(n){return Array.from({length:n},function(){return Math.floor(Math.random()*16).toString(16);}).join('');}
function watTime(){return new Date().toLocaleString('en-NG',{timeZone:'Africa/Lagos'});}
function logActivity(icon,msg,color){
  S.activityLog.unshift({icon:icon,msg:msg,color:color||'#1a3bc1',time:watTime()});
  if(S.activityLog.length>50)S.activityLog.pop();
}

function toDateTimeLocalValue(date){
  if(!date)return '';
  var d=date instanceof Date ? date : new Date(date);
  if(isNaN(d.getTime()))return '';
  function pad(n){return String(n).padStart(2,'0');}
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
}

function applyElectionUiState(){
  var electionTitle=S.electionTitle || 'WUCC Computing Election';
  var status=S.electionStatus || (S.electionActive ? 'active' : 'draft');
  S.electionActive=status==='active';

  setText('heroBadgeTxt',electionTitle);
  setText('heroElectionTitle',electionTitle);
  setText('db-title',electionTitle+' Dashboard');
  setText('adm-election-title',electionTitle);
  var rt=el('res-title'); if(rt)rt.textContent=electionTitle+' Results';
  if(document && document.title)document.title=electionTitle+' | WUCC eVoting';
  var title=el('el-title'); if(title && document.activeElement!==title)title.value=S.electionTitle || '';
  var start=el('el-start'); if(start && document.activeElement!==start)start.value=toDateTimeLocalValue(S.electionStart);
  var end=el('el-end'); if(end && document.activeElement!==end)end.value=toDateTimeLocalValue(S.electionEnd);
  var dot=el('el-dot');
  if(dot)dot.className=S.electionActive?'sdot-live':'sdot-off';
  var statusLabel=status==='active'?'Election is LIVE':status==='closed'?'Election has ended':status==='scheduled'?'Election scheduled':'Election not started';
  var statusSub=status==='active'?'Approved voters can now cast their votes':status==='closed'?'Voting is closed and results are final':status==='scheduled'?'Waiting for the scheduled start time':'Configure dates and click Start Election';
  setText('el-status-txt',statusLabel);
  setText('el-status-sub',statusSub);
  setText('cdLabel',S.electionActive?'Election ends in':'Election starts in');
  if(typeof updateNavPill==='function')updateNavPill();
}

function refreshElectionViews(){
  applyElectionUiState();
  if(typeof updateHomeStats==='function')updateHomeStats();
  if(typeof renderHomePosCards==='function')renderHomePosCards();
  if(typeof refreshAdminStats==='function')refreshAdminStats();
  if(typeof renderAdminResults==='function')renderAdminResults();
  if(typeof renderResults==='function')renderResults();
  if(typeof renderDashboard==='function')renderDashboard();
  if(typeof updateCountdown==='function')updateCountdown();
}

function positionIconClass(key){
  var icons={
    pres:'bi-award-fill',
    vp:'bi-patch-check-fill',
    gsec:'bi-journal-text',
    agsec:'bi-pencil-square',
    fsec:'bi-cash-coin',
    pro1:'bi-megaphone-fill',
    dwel:'bi-heart-pulse-fill',
    dh:'bi-hospital-fill',
    dsport:'bi-trophy-fill',
    dsoc:'bi-calendar-event-fill'
  };
  return icons[key] || 'bi-diagram-3-fill';
}

function positionIconHtml(key){
  return '<i class="bi '+positionIconClass(key)+'"></i>';
}

function initialsFromName(name){
  return String(name || 'Candidate').trim().split(/\s+/).slice(0,2).map(function(part){return part.charAt(0).toUpperCase();}).join('') || 'CA';
}

function avatarHtml(person,cls){
  var photo=person && person.photo;
  var name=(person && person.name) || person || 'Candidate';
  if(photo && photo.length>10)return '<img src="'+photo+'" alt="'+name+'">';
  return '<span class="'+(cls || 'avatar-initials')+'">'+initialsFromName(name)+'</span>';
}
