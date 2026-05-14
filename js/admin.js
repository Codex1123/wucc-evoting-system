// ── NAV PILL ──────────────────────────────────────────────────
function updateNavPill(){
  var pill=el('navPill'),dot=el('navDot'),txt=el('navPillTxt'),pb=el('heroPanelBadge');
  if(S.electionActive){
    if(pill)pill.className='live-badge live'; if(dot)dot.className='dot-pulse live'; if(txt)txt.textContent='LIVE';
    if(pb){pb.className='hcard-badge';pb.textContent='ELECTION LIVE';}
  }else{
    if(pill)pill.className='live-badge inactive'; if(dot)dot.className='dot-pulse'; if(txt)txt.textContent='INACTIVE';
    if(pb){pb.className='hcard-badge off';pb.textContent='ELECTION INACTIVE';}
  }
}

// ── ELECTION CONTROL ──────────────────────────────────────────
async function startElection(){
  var role=ROLES[normalizeAdminRole(S.adminRole)]||ROLES.observer;
  if(!role.canControlElection){toast('Not permitted for your role.',true);return;}
  var ev=(el('el-end')||{}).value;
  var sv=(el('el-start')||{}).value;
  var start=sv?new Date(sv):new Date();
  var end=ev?new Date(ev):new Date(Date.now()+8*3600000);
  if(window.WuccSupabase && window.WuccSupabase.isConfigured()){
    try{await ElectionRepository.setElectionStatus('active',start,end);}
    catch(err){console.error(err);toast(err.message || 'Unable to start election.',true);return;}
  }
  S.electionActive=true;
  S.electionEnd=end;
  S.electionStart=start;
  var dot=el('el-dot'); if(dot)dot.className='sdot-live';
  setText('el-status-txt','Election is LIVE');
  setText('el-status-sub','Approved voters can now cast their votes');
  updateNavPill(); logActivity('▶','Election started','#1a3bc1'); toast('Election started — voting is now OPEN');
}
async function stopElection(){
  var role=ROLES[normalizeAdminRole(S.adminRole)]||ROLES.observer;
  if(!role.canControlElection){toast('Not permitted for your role.',true);return;}
  if(window.WuccSupabase && window.WuccSupabase.isConfigured()){
    try{await ElectionRepository.setElectionStatus('closed',S.electionStart,S.electionEnd);}
    catch(err){console.error(err);toast(err.message || 'Unable to end election.',true);return;}
  }
  S.electionActive=false;
  var dot=el('el-dot'); if(dot)dot.className='sdot-off';
  setText('el-status-txt','Election has ended');
  setText('el-status-sub','Voting is closed — results are final');
  updateNavPill(); logActivity('■','Election ended','#e84a1a'); toast('Election ended — voting is CLOSED');
}
function resetElection(){
  var role=ROLES[normalizeAdminRole(S.adminRole)]||ROLES.observer;
  if(!role.canControlElection){toast('Not permitted for your role.',true);return;}
  if(!confirm('Reset ALL election data? This cannot be undone.'))return;
  S.positions.forEach(function(p){p.votes=new Array(p.candidates.length).fill(0);});
  S.txLog=[];S.blockNum=1200;S.totalVotes=0;S.electionActive=false;S.activityLog=[];
  S.voters.forEach(function(v){v.hasVoted=false;});
  var dot=el('el-dot'); if(dot)dot.className='sdot-off';
  setText('el-status-txt','Election reset'); setText('el-status-sub','Configure and start the election');
  updateNavPill(); updateHomeStats(); refreshAdminStats(); toast('All election data reset');
}

function updateNavPill(){
  var pill=el('navPill'),dot=el('navDot'),txt=el('navPillTxt'),pb=el('heroPanelBadge');
  var live=S.electionStatus==='active' || S.electionActive;
  var ended=S.electionStatus==='closed';
  if(live){
    if(pill)pill.className='live-badge live'; if(dot)dot.className='dot-pulse live'; if(txt)txt.textContent='ACTIVE';
    if(pb){pb.className='hcard-badge';pb.textContent='ELECTION LIVE';}
  }else{
    if(pill)pill.className='live-badge inactive'; if(dot)dot.className='dot-pulse'; if(txt)txt.textContent=ended?'ENDED':'INACTIVE';
    if(pb){pb.className='hcard-badge off';pb.textContent=ended?'ELECTION ENDED':'ELECTION INACTIVE';}
  }
}

async function startElection(){
  var role=ROLES[normalizeAdminRole(S.adminRole)]||ROLES.observer;
  if(!role.canControlElection){toast('Not permitted for your role.',true);return;}
  var title=((el('el-title')||{}).value||S.electionTitle||'WUCC Computing Election').trim();
  var sv=(el('el-start')||{}).value;
  var ev=(el('el-end')||{}).value;
  var start=sv?new Date(sv):new Date();
  var end=ev?new Date(ev):new Date(Date.now()+8*3600000);
  if(end<=start){toast('End date must be after the start date.',true);return;}
  var previous={title:S.electionTitle,status:S.electionStatus,active:S.electionActive,start:S.electionStart,end:S.electionEnd};
  S.electionTitle=title; S.electionStatus='active'; S.electionActive=true; S.electionStart=start; S.electionEnd=end;
  refreshElectionViews();
  if(window.WuccSupabase && window.WuccSupabase.isConfigured()){
    try{await ElectionRepository.updateElectionSettings({title:title,status:'active',start:start,end:end});}
    catch(err){
      S.electionTitle=previous.title; S.electionStatus=previous.status; S.electionActive=previous.active; S.electionStart=previous.start; S.electionEnd=previous.end;
      refreshElectionViews();
      console.error(err);toast(err.message || 'Unable to start election.',true);return;
    }
  }
  refreshElectionViews();
  logActivity('START','Election started','#1a3bc1'); toast('Election started. Voting is now open.');
}

async function stopElection(){
  var role=ROLES[normalizeAdminRole(S.adminRole)]||ROLES.observer;
  if(!role.canControlElection){toast('Not permitted for your role.',true);return;}
  var title=((el('el-title')||{}).value||S.electionTitle||'WUCC Computing Election').trim();
  var sv=(el('el-start')||{}).value;
  var ev=(el('el-end')||{}).value;
  var start=sv?new Date(sv):S.electionStart;
  var end=ev?new Date(ev):new Date();
  var previous={title:S.electionTitle,status:S.electionStatus,active:S.electionActive,start:S.electionStart,end:S.electionEnd};
  S.electionTitle=title; S.electionStatus='closed'; S.electionActive=false; S.electionStart=start; S.electionEnd=end;
  refreshElectionViews();
  if(window.WuccSupabase && window.WuccSupabase.isConfigured()){
    try{await ElectionRepository.updateElectionSettings({title:title,status:'closed',start:start,end:end});}
    catch(err){
      S.electionTitle=previous.title; S.electionStatus=previous.status; S.electionActive=previous.active; S.electionStart=previous.start; S.electionEnd=previous.end;
      refreshElectionViews();
      console.error(err);toast(err.message || 'Unable to end election.',true);return;
    }
  }
  refreshElectionViews();
  logActivity('END','Election ended','#e84a1a'); toast('Election ended. Voting is closed.');
}

async function saveElectionSettings(statusOverride){
  var role=ROLES[normalizeAdminRole(S.adminRole)]||ROLES.observer;
  if(!role.canControlElection)return;
  var title=((el('el-title')||{}).value||'').trim();
  var sv=(el('el-start')||{}).value;
  var ev=(el('el-end')||{}).value;
  var start=sv?new Date(sv):null;
  var end=ev?new Date(ev):null;
  if(!title){toast('Election title is required.',true);return;}
  if(start && end && end<=start){toast('End date must be after the start date.',true);return;}
  var status=statusOverride || S.electionStatus || (S.electionActive?'active':'draft');
  var previous={title:S.electionTitle,status:S.electionStatus,active:S.electionActive,start:S.electionStart,end:S.electionEnd};
  S.electionTitle=title; S.electionStart=start; S.electionEnd=end; S.electionStatus=status; S.electionActive=status==='active';
  refreshElectionViews();
  if(window.WuccSupabase && window.WuccSupabase.isConfigured()){
    try{await ElectionRepository.updateElectionSettings({title:title,status:status,start:start,end:end});}
    catch(err){
      S.electionTitle=previous.title; S.electionStatus=previous.status; S.electionActive=previous.active; S.electionStart=previous.start; S.electionEnd=previous.end;
      refreshElectionViews();
      console.error(err);toast(err.message || 'Unable to save election settings.',true);return;
    }
  }
  refreshElectionViews();
  toast('Election settings updated.');
}

async function resetElection(){
  var role=ROLES[normalizeAdminRole(S.adminRole)]||ROLES.observer;
  if(!role.canControlElection){toast('Not permitted for your role.',true);return;}
  if(!confirm('Reset ALL election data? This cannot be undone.'))return;
  var previous={title:S.electionTitle,status:S.electionStatus,active:S.electionActive,start:S.electionStart,end:S.electionEnd,totalVotes:S.totalVotes,txLog:S.txLog.slice(),blockNum:S.blockNum,activityLog:S.activityLog.slice()};
  S.positions.forEach(function(p){p.votes=new Array(p.candidates.length).fill(0);});
  S.txLog=[];S.blockNum=1200;S.totalVotes=0;S.electionActive=false;S.electionStatus='draft';S.activityLog=[];
  S.voters.forEach(function(v){v.hasVoted=false;});
  refreshElectionViews();
  if(window.WuccSupabase && window.WuccSupabase.isConfigured()){
    try{await ElectionRepository.resetElectionData();}
    catch(err){
      S.electionTitle=previous.title; S.electionStatus=previous.status; S.electionActive=previous.active; S.electionStart=previous.start; S.electionEnd=previous.end;
      S.totalVotes=previous.totalVotes; S.txLog=previous.txLog; S.blockNum=previous.blockNum; S.activityLog=previous.activityLog;
      refreshElectionViews();
      console.error(err);toast(err.message || 'Unable to reset election data.',true);return;
    }
  }
  refreshElectionViews(); toast('Election data reset.');
}

// ── ROLE SYSTEM ───────────────────────────────────────────────
var ROLES={
  superadmin:{
    label:'Superadmin',icon:'🛡️',bannerClass:'superadmin',tabs:[0,1,2,3,4,5],
    canEditVoters:true,canEditPositions:true,canControlElection:true,canApproveApps:true,
    desc:'Full system access — all tabs and all controls enabled'
  },
  commissioner:{
    label:'Commissioner',icon:'📋',bannerClass:'commission',tabs:[0,1,2,3,5],
    canEditVoters:true,canEditPositions:true,canControlElection:true,canApproveApps:false,
    desc:'Manage voters, positions, election control, reports, and voter imports.'
  },
  observer:{
    label:'Observer',icon:'👁️',bannerClass:'observer',tabs:[3],
    canEditVoters:false,canEditPositions:false,canControlElection:false,canApproveApps:false,
    desc:'Read-only access to dashboard, reports, and results. No modifications permitted.'
  }
};

var DEMO_ACCOUNTS=[];

if(ROLES.superadmin)ROLES.superadmin.icon='SA';
if(ROLES.commissioner)ROLES.commissioner.icon='EC';
if(ROLES.observer)ROLES.observer.icon='OB';

function fillCreds(user,pass){
  var u=el('adm-user'),p=el('adm-pass');
  if(u)u.value=user; if(p)p.value=pass;
  var e=el('adm-err'); if(e)e.style.display='none';
}

function normalizeAdminRole(role){
  if(window.WuccRoles && typeof window.WuccRoles.normalizeRole==='function'){
    return window.WuccRoles.normalizeRole(role);
  }
  return String(role || '').trim().toLowerCase();
}

function showAdminError(message){
  var errEl=el('adm-err');
  if(!errEl)return;
  errEl.innerHTML='<i class="bi bi-exclamation-circle me-1"></i>';
  errEl.appendChild(document.createTextNode(message));
  errEl.style.display='flex';
}

async function adminLogin(){
  var user=((el('adm-user')||{}).value||'').trim();
  var pass=((el('adm-pass')||{}).value||'');
  var errEl=el('adm-err');
  if(errEl)errEl.style.display='none';

  if(window.WuccSupabase && window.WuccSupabase.isConfigured()){
    try{
      var profile=await ElectionRepository.signInAdmin(user,pass);
      S.adminRole=normalizeAdminRole(profile.role);
      S.adminName=profile.full_name;
      showPage('admin');
      showAdminDash();
      try{await ElectionRepository.loadInitialState();}
      catch(loadErr){
        console.error(loadErr);
        toast(loadErr.message || 'Admin data refresh failed. Check Supabase policies and migrations.',true);
      }
      showAdminDash();
      updateHomeStats();renderHomePosCards();applyElectionUiState();
      return;
    }catch(err){
      console.error(err);
      showAdminError(err.message || 'Unable to sign in. Check your Supabase Auth account and profile role.');
      return;
    }
  }

  if(!DEMO_ACCOUNTS.length){
    toast('Admin sign-in requires Supabase configuration.',true);
    showAdminError('Admin sign-in requires Supabase configuration.');
    return;
  }
  var account=null;
  for(var i=0;i<DEMO_ACCOUNTS.length;i++){
    if(DEMO_ACCOUNTS[i].user===user&&DEMO_ACCOUNTS[i].pass===pass){account=DEMO_ACCOUNTS[i];break;}
  }
  if(!account){showAdminError('Unable to sign in. Check the email and password.');return;}
  S.adminRole=normalizeAdminRole(account.role); S.adminName=account.name;
  showAdminDash();
}

function showAdminDash(){
  var login=el('admin-login'),dash=el('admin-dash');
  S.adminRole=normalizeAdminRole(S.adminRole);
  if(!ROLES[S.adminRole]){
    S.adminRole=null;
    S.adminName='';
    if(dash)dash.style.display='none';
    if(login)login.style.display='flex';
    showAdminError('Unauthorized access: this profile role cannot access the admin area.');
    return;
  }
  if(login)login.style.display='none';
  if(dash)dash.style.display='block';
  var role=ROLES[S.adminRole];

  // Sidebar role card
  var rc=el('adm-role-card'); if(rc)rc.style.display='block';
  setText('adm-role-avatar',role.icon);
  setText('adm-role-name',S.adminName);
  setText('adm-role-label',role.label);

  // Role banner
  var banner=el('role-banner');
  if(banner){banner.className='role-banner-pro '+role.bannerClass;banner.style.display='flex';}
  var rbIcon=el('rb-icon'); if(rbIcon)rbIcon.textContent=role.icon;
  setText('rb-title',S.adminName+' — '+role.label);
  setText('rb-desc',role.desc);
  var rb=el('adminRoleBadge'); if(rb){rb.style.display='inline';rb.textContent=role.label.toUpperCase();}
  var lb=el('adminLogoutBtn'); if(lb)lb.style.display='flex';

  // Lock/unlock nav tabs
  for(var i=0;i<6;i++){
    var btn=el('nav-tab-'+i); if(!btn)continue;
    if(role.tabs.indexOf(i)>=0){btn.classList.remove('locked');}
    else{btn.classList.add('locked');}
    btn.classList.remove('active');
  }
  // Show first permitted tab
  var firstTab=role.tabs[0];
  var firstBtn=el('nav-tab-'+firstTab); if(firstBtn)firstBtn.classList.add('active');
  for(var j=0;j<6;j++){var pane=el('ap'+j);if(pane)pane.classList.remove('active');}
  var fp=el('ap'+firstTab); if(fp)fp.classList.add('active');
  updateAdmPageTitle(firstTab);
  applyRoleLocks(role);
  updateAdminBadges();
  refreshAdminStats();
  if(role.tabs.indexOf(0)>=0)renderVoterTable();
  if(role.tabs.indexOf(1)>=0)renderPosManager();
  renderAdminResults();
  if(role.tabs.indexOf(4)>=0)renderApplicationsTable();
  populateApplyPositions();
  applyElectionUiState();
}

var PAGE_TITLES={
  0:{t:'Voter Management',      s:'Register, approve and manage registered voters'},
  1:{t:'Positions & Candidates',s:'Manage WUCC Computing positions and candidate lists'},
  2:{t:'Election Control',      s:'Configure dates, start and stop the election'},
  3:{t:'Reports & Statistics',  s:'View detailed election analytics and data'},
  4:{t:'Applications',          s:'Review and manage candidate applications'},
  5:{t:'CSV Import',            s:'Bulk import voter data from spreadsheet'}
};
function updateAdmPageTitle(n){
  var info=PAGE_TITLES[n]||{t:'Admin Panel',s:''};
  setText('adm-page-title',info.t); setText('adm-page-sub',info.s);
}

function updateAdminBadges(){
  var pending=S.voters.filter(function(v){return v.status==='pending';}).length;
  var pb=el('pending-badge'); if(pb){pb.style.display=pending>0?'inline':'none';pb.textContent=pending;}
  var pendingApps=S.applications.filter(function(a){return a.status==='pending';}).length;
  var ab=el('apps-badge'); if(ab){ab.style.display=pendingApps>0?'inline':'none';ab.textContent=pendingApps;}
}

function applyRoleLocks(role){
  ['btn-start-el','btn-stop-el','btn-save-el','btn-reset-el'].forEach(function(id){
    var b=el(id); if(!b)return;
    b.disabled=!role.canControlElection;
    b.style.opacity=role.canControlElection?'1':'0.4';
    b.style.pointerEvents=role.canControlElection?'':'none';
  });
  ['add-voter-btn','add-pending-btn'].forEach(function(id){
    var b=el(id); if(!b)return;
    b.disabled=!role.canEditVoters;
    b.style.opacity=role.canEditVoters?'1':'0.4';
    b.style.pointerEvents=role.canEditVoters?'':'none';
  });
}

async function adminLogout(){
  if(window.WuccSupabase && window.WuccSupabase.isConfigured()){
    await ElectionRepository.signOutAdmin();
  }
  S.adminRole=null; S.adminName='';
  var login=el('admin-login'),dash=el('admin-dash');
  if(login)login.style.display='flex'; if(dash)dash.style.display='none';
  var rc=el('adm-role-card'); if(rc)rc.style.display='none';
  var lb=el('adminLogoutBtn'); if(lb)lb.style.display='none';
  var banner=el('role-banner'); if(banner)banner.style.display='none';
  var rb=el('adminRoleBadge'); if(rb)rb.style.display='none';
  var u=el('adm-user'),p=el('adm-pass'); if(u)u.value=''; if(p)p.value='';
  var e=el('adm-err'); if(e)e.style.display='none';
  for(var i=0;i<6;i++){
    var b=el('nav-tab-'+i); if(b)b.classList.remove('active','locked');
    var pn=el('ap'+i); if(pn)pn.classList.remove('active');
  }
}

function adminTab(n,btn){
  var role=ROLES[S.adminRole]||ROLES.observer;
  if(role.tabs.indexOf(n)<0){toast('Access denied — '+role.label+' cannot view this tab.',true);return;}
  for(var i=0;i<6;i++){var p=el('ap'+i);if(p)p.classList.remove('active');}
  var pane=el('ap'+n); if(pane)pane.classList.add('active');
  document.querySelectorAll('.adm-nav-item').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');
  updateAdmPageTitle(n); applyRoleLocks(role);
  if(n===0)renderVoterTable();
  if(n===1)renderPosManager();
  if(n===3)renderAdminResults();
  if(n===4)renderApplicationsTable();
}

// ── ADMIN STATS ───────────────────────────────────────────────
function refreshAdminStats(){
  var total=S.voters.length;
  var approved=S.voters.filter(function(v){return v.status==='approved';}).length;
  var pending=S.voters.filter(function(v){return v.status==='pending';}).length;
  setHtml('admin-stats',
    '<div class="col-6 col-md-3"><div class="adm-stat-card">'+
      '<div class="adm-stat-icon" style="background:rgba(26,59,193,.1)"><i class="bi bi-people-fill" style="color:var(--cobalt)"></i></div>'+
      '<div><div class="adm-stat-n">'+total+'</div><div class="adm-stat-l">Registered</div></div></div></div>'+
    '<div class="col-6 col-md-3"><div class="adm-stat-card">'+
      '<div class="adm-stat-icon" style="background:rgba(8,145,178,.1)"><i class="bi bi-person-check-fill" style="color:var(--teal)"></i></div>'+
      '<div><div class="adm-stat-n">'+approved+'</div><div class="adm-stat-l">Approved</div></div></div></div>'+
    '<div class="col-6 col-md-3"><div class="adm-stat-card">'+
      '<div class="adm-stat-icon" style="background:rgba(224,136,0,.1)"><i class="bi bi-hourglass-split" style="color:var(--amber)"></i></div>'+
      '<div><div class="adm-stat-n">'+pending+'</div><div class="adm-stat-l">Pending</div></div></div></div>'+
    '<div class="col-6 col-md-3"><div class="adm-stat-card">'+
      '<div class="adm-stat-icon" style="background:rgba(232,74,26,.1)"><i class="bi bi-check2-circle" style="color:var(--coral)"></i></div>'+
      '<div><div class="adm-stat-n">'+S.totalVotes+'</div><div class="adm-stat-l">Votes Cast</div></div></div></div>'
  );
  updateAdminBadges();
}

// ── VOTER TABLE ───────────────────────────────────────────────
function filterVoters(){renderVoterTable();}
function renderVoterTable(){
  var search=((el('voter-search')||{}).value||'').toLowerCase();
  var sf=((el('voter-filter-status')||{}).value||'');
  var vv=S.voters.filter(function(v){
    return (!search||v.name.toLowerCase().indexOf(search)>=0||v.matric.toLowerCase().indexOf(search)>=0)&&(!sf||v.status===sf);
  });
  setText('voter-count-lbl',S.voters.length+' total · '+vv.length+' shown');
  var tb=el('voter-tbody'); if(!tb)return;
  if(!vv.length){tb.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--hint);padding:1.5rem">No voters found</td></tr>';return;}
  tb.innerHTML=vv.map(function(v){
    var i=S.voters.indexOf(v);
    var sg=v.status==='approved'?'bge-ok':v.status==='pending'?'bge-pend':'bge-rej';
    return '<tr>'+
      '<td><strong>'+v.name+'</strong></td>'+
      '<td style="font-family:\'JetBrains Mono\',monospace;font-size:.72rem">'+v.matric+'</td>'+
      '<td>'+v.dept+'</td><td>'+v.level+'</td>'+
      '<td><span class="'+sg+'">'+v.status.toUpperCase()+'</span></td>'+
      '<td><span style="background:'+(v.hasVoted?'rgba(8,145,178,.08)':'var(--border-soft)')+';color:'+(v.hasVoted?'var(--teal)':'var(--hint)')+';padding:.12rem .45rem;border-radius:4px;font-size:.6rem;font-family:\'JetBrains Mono\',monospace;font-weight:700">'+(v.hasVoted?'YES':'NO')+'</span></td>'+
      '<td>'+
        (v.status!=='approved'?'<button class="abtn abtn-ok" onclick="setVoterStatus('+i+',\'approved\')"><i class="bi bi-check-lg"></i></button>':'')+
        (v.status!=='rejected'?'<button class="abtn abtn-rej" onclick="setVoterStatus('+i+',\'rejected\')"><i class="bi bi-x-lg"></i></button>':'')+
        ' <button class="abtn abtn-rm" onclick="removeVoter('+i+')"><i class="bi bi-trash3"></i></button>'+
      '</td></tr>';
  }).join('');
}
async function setVoterStatus(i,status){
  var role=ROLES[S.adminRole]||ROLES.observer;
  if(!role.canEditVoters){toast('Not permitted for your role.',true);return;}
  if(window.WuccSupabase && window.WuccSupabase.isConfigured() && S.voters[i] && S.voters[i].id){
    try{await ElectionRepository.updateVoterStatus(S.voters[i].id,status);}
    catch(err){console.error(err);toast(err.message || 'Unable to update voter.',true);return;}
  }
  if(S.voters[i]){S.voters[i].status=status;renderVoterTable();refreshAdminStats();
    toast('Voter '+S.voters[i].name+' '+status);logActivity('👤','Voter '+status+': '+S.voters[i].name,'#1a3bc1');}
}
function removeVoter(i){
  var role=ROLES[S.adminRole]||ROLES.observer;
  if(!role.canEditVoters){toast('Not permitted.',true);return;}
  if(window.WuccSupabase && window.WuccSupabase.isConfigured()){
    toast('Use status changes instead of deleting audited voter records.',true);
    return;
  }
  if(!confirm('Remove '+S.voters[i].name+'?'))return;
  S.voters.splice(i,1);renderVoterTable();refreshAdminStats();toast('Voter removed');
}
async function addVoter(){
  var role=ROLES[S.adminRole]||ROLES.observer;
  if(!role.canEditVoters){toast('Not permitted.',true);return;}
  var name=((el('v-name')||{}).value||'').trim(),matric=((el('v-matric')||{}).value||'').trim();
  var dept=((el('v-dept')||{}).value||''),level=((el('v-level')||{}).value||'');
  var email=((el('v-email')||{}).value||'').trim();
  if(!name||!matric||!dept){toast('Name, matric and department required.',true);return;}
  if(window.WuccSupabase && window.WuccSupabase.isConfigured()){
    try{
      await ElectionRepository.insertVoter({name:name,matric:matric,dept:dept,level:level||'',email:email},'approved');
      await ElectionRepository.loadInitialState();
    }catch(err){console.error(err);toast(err.message || 'Unable to add voter.',true);return;}
  }else{
    S.voters.push({name:name,matric:matric,dept:dept,level:level||'—',email:email,status:'approved',hasVoted:false});
  }
  ['v-name','v-matric','v-email'].forEach(function(id){var e=el(id);if(e)e.value='';});
  renderVoterTable();refreshAdminStats();toast(name+' approved and added.');
  logActivity('✅','Voter added: '+name,'#0a8a7a');
}
async function addVoterPending(){
  var role=ROLES[S.adminRole]||ROLES.observer;
  if(!role.canEditVoters){toast('Not permitted.',true);return;}
  var name=((el('v-name')||{}).value||'').trim(),matric=((el('v-matric')||{}).value||'').trim();
  var dept=((el('v-dept')||{}).value||''),level=((el('v-level')||{}).value||'');
  var email=((el('v-email')||{}).value||'').trim();
  if(!name||!matric||!dept){toast('Name, matric and department required.',true);return;}
  if(window.WuccSupabase && window.WuccSupabase.isConfigured()){
    try{
      await ElectionRepository.insertVoter({name:name,matric:matric,dept:dept,level:level||'',email:email},'pending');
      await ElectionRepository.loadInitialState();
    }catch(err){console.error(err);toast(err.message || 'Unable to add voter.',true);return;}
  }else{
    S.voters.push({name:name,matric:matric,dept:dept,level:level||'—',email:email,status:'pending',hasVoted:false});
  }
  ['v-name','v-matric','v-email'].forEach(function(id){var e=el(id);if(e)e.value='';});
  renderVoterTable();refreshAdminStats();toast(name+' added as pending.');
}

// ── POSITION MANAGER ──────────────────────────────────────────
function renderPosManager(){
  var c=el('pos-manager'); if(!c)return;
  c.innerHTML=S.positions.map(function(p){
    var rows=p.candidates.map(function(cn,ci){
      var nm=cn.name||cn, id=cn.id||'';
      var avHtml=avatarHtml(cn);
      return '<div class="cand-row-adm">'+
        '<div class="cand-av-sm">'+avHtml+'</div>'+
        '<div style="flex:1;min-width:0"><div style="font-size:.79rem;font-weight:700;color:var(--ink)">'+nm+'</div>'+
        '<div style="font-family:\'JetBrains Mono\',monospace;font-size:.6rem;color:var(--hint)">'+id+'</div></div>'+
        '<button class="cand-rm-btn" onclick="removeCandidate(\''+p.key+'\','+ci+')" title="Remove"><i class="bi bi-x-circle-fill"></i></button>'+
        '</div>';
    }).join('');
    return '<div class="col-md-6"><div class="pos-admin-card">'+
      '<div class="pos-admin-card-head">'+
      '<div style="font-weight:800;font-size:.88rem;color:var(--ink);display:flex;align-items:center;gap:.45rem">'+positionIconHtml(p.key)+' '+p.name+'</div>'+
      '<span class="bge-ok">'+p.candidates.length+' candidates</span></div>'+
      '<div id="cml-'+p.key+'">'+rows+'</div>'+
      '<div class="add-row"><input type="text" class="add-inp" id="nc-'+p.key+'" placeholder="Candidate Name (MATRIC)">'+
      '<button class="add-btn" onclick="addCandidate(\''+p.key+'\')"><i class="bi bi-plus-lg"></i></button></div>'+
      '</div></div>';
  }).join('');
}
function addCandidate(key){
  var role=ROLES[S.adminRole]||ROLES.observer;
  if(!role.canEditPositions){toast('Not permitted for your role.',true);return;}
  if(window.WuccSupabase && window.WuccSupabase.isConfigured()){
    toast('Candidate changes should be made through approved applications or Supabase admin workflows.',true);
    return;
  }
  var inp=el('nc-'+key); if(!inp||!inp.value.trim()){toast('Enter candidate name.',true);return;}
  var p=S.positions.find(function(x){return x.key===key;}); if(!p)return;
  var val=inp.value.trim(),parts=val.split('(');
  var nm=parts[0].trim(),id=(parts[1]||'').replace(')','').trim();
  p.candidates.push({name:nm,id:id,manifesto:'',promises:[],emoji:AVS[p.candidates.length%10],photo:null});
  p.votes.push(0); inp.value='';
  renderPosManager(); toast('Candidate '+nm+' added.');
}
function removeCandidate(key,ci){
  var role=ROLES[S.adminRole]||ROLES.observer;
  if(!role.canEditPositions){toast('Not permitted for your role.',true);return;}
  if(window.WuccSupabase && window.WuccSupabase.isConfigured()){
    toast('Candidate records are audited in Supabase and cannot be removed from the browser.',true);
    return;
  }
  var p=S.positions.find(function(x){return x.key===key;}); if(!p)return;
  if(!confirm('Remove '+p.candidates[ci].name+'?'))return;
  p.candidates.splice(ci,1);p.votes.splice(ci,1);
  renderPosManager(); toast('Candidate removed.');
}

// ── ADMIN REPORTS ─────────────────────────────────────────────
function renderAdminResults(){
  var c=el('reportGrid'); if(!c)return;
  var approved=S.voters.filter(function(v){return v.status==='approved';}).length;
  var voted=S.voters.filter(function(v){return v.hasVoted;}).length;
  var leaders=S.positions.map(function(p){
    var mx=Math.max.apply(null,p.votes.concat(0)),li=p.votes.indexOf(mx);
    var ldr=li>=0&&p.candidates[li]?(p.candidates[li].name||p.candidates[li]):'—';
    return '<tr><td>'+p.name+'</td><td>'+ldr+'</td><td>'+(mx||0)+'</td></tr>';
  }).join('');
  var statRows=['approved','pending','rejected'].map(function(st){
    var n=S.voters.filter(function(v){return v.status===st;}).length;
    return '<tr><td style="text-transform:capitalize">'+st+'</td><td>'+n+'</td><td>'+(S.voters.length>0?Math.round(n/S.voters.length*100):0)+'%</td></tr>';
  }).join('');
  c.innerHTML=
    '<div class="col-md-6"><div class="rcard-v6"><div class="rcard-head"><div class="rcard-icon"><i class="bi bi-bar-chart-fill" style="color:var(--cobalt)"></i></div><div class="rcard-title">Turnout Summary</div></div>'+
    '<table class="rpt-tbl"><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>'+
    '<tr><td>Registered</td><td>'+S.voters.length+'</td></tr>'+
    '<tr><td>Approved</td><td>'+approved+'</td></tr>'+
    '<tr><td>Voted</td><td>'+voted+'</td></tr>'+
    '<tr><td>Turnout</td><td><strong style="color:var(--cobalt)">'+(approved>0?Math.round(voted/approved*100):0)+'%</strong></td></tr>'+
    '<tr><td>Blocks Mined</td><td>'+(S.blockNum-1200)+'</td></tr>'+
    '</tbody></table></div></div>'+
    '<div class="col-md-6"><div class="rcard-v6"><div class="rcard-head"><div class="rcard-icon"><i class="bi bi-trophy-fill" style="color:var(--amber)"></i></div><div class="rcard-title">Current Leaders</div></div>'+
    '<table class="rpt-tbl"><thead><tr><th>Position</th><th>Leader</th><th>Votes</th></tr></thead><tbody>'+leaders+'</tbody></table></div></div>'+
    '<div class="col-md-6"><div class="rcard-v6"><div class="rcard-head"><div class="rcard-icon"><i class="bi bi-people-fill" style="color:var(--cobalt)"></i></div><div class="rcard-title">Voter Status</div></div>'+
    '<table class="rpt-tbl"><thead><tr><th>Status</th><th>Count</th><th>%</th></tr></thead><tbody>'+statRows+'</tbody></table></div></div>'+
    '<div class="col-md-6"><div class="rcard-v6"><div class="rcard-head"><div class="rcard-icon"><i class="bi bi-envelope-fill" style="color:var(--teal)"></i></div><div class="rcard-title">Applications</div></div>'+
    '<table class="rpt-tbl"><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>'+
    '<tr><td>Total</td><td>'+S.applications.length+'</td></tr>'+
    '<tr><td>Pending</td><td>'+S.applications.filter(function(a){return a.status==='pending';}).length+'</td></tr>'+
    '<tr><td>Approved</td><td>'+S.applications.filter(function(a){return a.status==='approved';}).length+'</td></tr>'+
    '<tr><td>Rejected</td><td>'+S.applications.filter(function(a){return a.status==='rejected';}).length+'</td></tr>'+
    '</tbody></table></div></div>';
}

// ── APPLICATIONS ──────────────────────────────────────────────
function populateApplyPositions(){
  var sel=el('ca-pos'); if(!sel||sel.options.length>1)return;
  S.positions.forEach(function(p){
    var opt=document.createElement('option');opt.value=p.key;opt.textContent=p.name;
    sel.appendChild(opt);
  });
}

function markApplyField(id,invalid){
  var field=el(id);
  if(field)field.classList.toggle('field-invalid',Boolean(invalid));
}

function showApplyValidation(messages){
  var box=el('apply-validation');
  if(box){
    box.style.display=messages.length?'block':'none';
    box.innerHTML=messages.length?'<strong>Check these fields before submitting:</strong><ul>'+messages.map(function(m){return '<li>'+m+'</li>';}).join('')+'</ul>':'';
  }
  if(messages.length)toast(messages[0],true);
}

function previewPhoto(evt){
  var file=evt.target.files[0]; if(!file)return;
  if(file.size>2*1024*1024){toast('Photo must be under 2MB.',true);return;}
  var reader=new FileReader();
  reader.onload=function(e){
    var circle=el('photo-preview-circle');
    if(circle)circle.innerHTML='<img src="'+e.target.result+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
    var fn=el('photo-filename'); if(fn){fn.style.display='block';fn.textContent='✓ '+file.name;}
    S._pendingPhoto=e.target.result;
  };
  reader.readAsDataURL(file);
}

function previewPhoto(evt){
  var input=evt.target;
  var file=input.files[0]; if(!file)return;
  if(!/^image\/(jpeg|png|webp)$/i.test(file.type)){
    input.value=''; toast('Photo must be JPG, PNG or WEBP.',true); return;
  }
  if(file.size>2*1024*1024){
    input.value=''; toast('Photo must be under 2MB.',true); return;
  }
  var reader=new FileReader();
  reader.onload=function(e){
    var circle=el('photo-preview-circle');
    if(circle)circle.innerHTML='<img src="'+e.target.result+'" alt="Candidate photo preview">';
    var fn=el('photo-filename'); if(fn){fn.style.display='block';fn.textContent=file.name+' - ready for review';}
    markApplyField('ca-photo',false);
    S._pendingPhoto=e.target.result;
  };
  reader.readAsDataURL(file);
}

async function submitApplication(){
  var name=((el('ca-name')||{}).value||'').trim();
  var matric=((el('ca-matric')||{}).value||'').trim();
  var dept=((el('ca-dept')||{}).value||'');
  var level=((el('ca-level')||{}).value||'');
  var email=((el('ca-email')||{}).value||'').trim();
  var phone=((el('ca-phone')||{}).value||'').trim();
  var pos=((el('ca-pos')||{}).value||'');
  var manifesto=((el('ca-manifesto')||{}).value||'').trim();
  var promises=((el('ca-promises')||{}).value||'').trim();
  var cgpa=((el('ca-cgpa')||{}).value||'').trim();
  var prevRole=((el('ca-role')||{}).value||'').trim();
  var agree=(el('ca-agree')||{checked:false}).checked;
  var photo=S._pendingPhoto||null;
  var selectedPosition=S.positions.find(function(p){return p.key===pos && p.id;}) || S.positions.find(function(p){return p.key===pos;});
  var errors=[];
  ['ca-name','ca-matric','ca-dept','ca-email','ca-pos','ca-manifesto','ca-agree','ca-photo'].forEach(function(id){markApplyField(id,false);});
  if(!name){errors.push('Full name is required.');markApplyField('ca-name',true);}
  if(!matric){errors.push('Matric number is required.');markApplyField('ca-matric',true);}
  if(!dept){errors.push('Select your department.');markApplyField('ca-dept',true);}
  if(!email){errors.push('Email address is required.');markApplyField('ca-email',true);}
  if(!selectedPosition){errors.push('Select a valid WUCC position.');markApplyField('ca-pos',true);}
  if(!manifesto){errors.push('Manifesto is required.');markApplyField('ca-manifesto',true);}
  if(!photo){errors.push('Upload a passport photo for review.');markApplyField('ca-photo',true);}
  if(!agree){errors.push('Accept the declaration before submitting.');markApplyField('ca-agree',true);}
  if(errors.length){showApplyValidation(errors);return;}
  var ref='APP-'+Date.now().toString(36).toUpperCase();
  var promisesList=promises.split('\n').map(function(s){return s.replace(/^[•\-\*]\s*/,'').trim();}).filter(Boolean);
  var application={name:name,matric:matric,dept:dept,level:level,email:email,phone:phone,
    pos:pos,manifesto:manifesto,promises:promisesList,cgpa:cgpa,prevRole:prevRole,
    photo:photo,ref:ref,status:'pending',time:watTime()};
  if(window.WuccSupabase && window.WuccSupabase.isConfigured()){
    try{await ElectionRepository.submitApplication(application);}
    catch(err){console.error(err);toast(err.message || 'Unable to submit application.',true);return;}
  }else{
    S.applications.push(application);
  }
  setText('apply-ref',ref);
  var fc=el('apply-form-card'),sc=el('apply-success');
  if(fc)fc.style.display='none'; if(sc)sc.style.display='block';
  showApplyValidation([]);
  S._pendingPhoto=null;
  logActivity('📬','Application submitted: '+name,'#b07d20');
  toast('Application submitted! Ref: '+ref);
  updateAdminBadges();
}

function resetApplyForm(){
  var fc=el('apply-form-card'),sc=el('apply-success');
  if(fc)fc.style.display='block'; if(sc)sc.style.display='none';
  ['ca-name','ca-matric','ca-email','ca-phone','ca-manifesto','ca-promises','ca-cgpa','ca-role'].forEach(function(id){var e=el(id);if(e)e.value='';});
  ['ca-dept','ca-level','ca-gender','ca-pos'].forEach(function(id){var e=el(id);if(e)e.selectedIndex=0;});
  var agree=el('ca-agree'); if(agree)agree.checked=false;
  var circle=el('photo-preview-circle'); if(circle)circle.innerHTML='📷';
  var fn=el('photo-filename'); if(fn)fn.style.display='none';
  var mc=el('manifest-count'); if(mc)mc.textContent='0';
  S._pendingPhoto=null;
}

function resetApplyForm(){
  var fc=el('apply-form-card'),sc=el('apply-success');
  if(fc)fc.style.display='block'; if(sc)sc.style.display='none';
  ['ca-name','ca-matric','ca-email','ca-phone','ca-manifesto','ca-promises','ca-cgpa','ca-role'].forEach(function(id){var e=el(id);if(e)e.value='';});
  ['ca-dept','ca-level','ca-gender','ca-pos'].forEach(function(id){var e=el(id);if(e)e.selectedIndex=0;});
  var agree=el('ca-agree'); if(agree)agree.checked=false;
  var circle=el('photo-preview-circle'); if(circle)circle.innerHTML='<i class="bi bi-person-bounding-box"></i>';
  var fn=el('photo-filename'); if(fn)fn.style.display='none';
  var mc=el('manifest-count'); if(mc)mc.textContent='0';
  showApplyValidation([]);
  ['ca-name','ca-matric','ca-dept','ca-email','ca-pos','ca-manifesto','ca-agree','ca-photo'].forEach(function(id){markApplyField(id,false);});
  S._pendingPhoto=null;
}

function renderApplicationsTable(){
  var tb=el('applications-tbody'); if(!tb)return;
  var role=ROLES[S.adminRole]||ROLES.observer;
  if(!S.applications.length){
    tb.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--hint);padding:2rem">No applications submitted yet</td></tr>';return;
  }
  tb.innerHTML=S.applications.map(function(a,i){
    var p=S.positions.find(function(x){return x.key===a.pos;});
    var sg=a.status==='approved'?'bge-ok':a.status==='pending'?'bge-pend':'bge-rej';
    var photoHtml=a.photo
      ?'<img src="'+a.photo+'" style="width:38px;height:38px;border-radius:50%;object-fit:cover;border:2px solid var(--border)">'
      :'<div style="width:38px;height:38px;border-radius:50%;background:var(--cobalt-soft);display:flex;align-items:center;justify-content:center;font-size:1.1rem">👤</div>';
    var actHtml=role.canApproveApps
      ?'<button class="abtn abtn-ok" onclick="setAppStatus('+i+',\'approved\')"><i class="bi bi-check-lg"></i></button> '+
        '<button class="abtn abtn-rej" onclick="setAppStatus('+i+',\'rejected\')"><i class="bi bi-x-lg"></i></button>'
      :'<span style="font-size:.65rem;color:var(--hint)">View only</span>';
    return '<tr><td>'+photoHtml+'</td>'+
      '<td><strong>'+a.name+'</strong><br><span style="font-family:\'JetBrains Mono\',monospace;font-size:.6rem;color:var(--hint)">'+a.matric+'</span></td>'+
      '<td style="font-family:\'JetBrains Mono\',monospace;font-size:.7rem">'+a.matric+'</td>'+
      '<td>'+(p?p.name:a.pos)+'</td>'+
      '<td style="font-family:\'JetBrains Mono\',monospace;font-size:.63rem;color:var(--hint)">'+a.time+'</td>'+
      '<td><span class="'+sg+'">'+a.status.toUpperCase()+'</span></td>'+
      '<td>'+actHtml+'</td></tr>';
  }).join('');
}

async function setAppStatus(i,status){
  var role=ROLES[S.adminRole]||ROLES.observer;
  if(!role.canApproveApps){toast('Not permitted for your role.',true);return;}
  if(!S.applications[i])return;
  if(window.WuccSupabase && window.WuccSupabase.isConfigured() && S.applications[i].id){
    try{
      await ElectionRepository.updateApplicationStatus(S.applications[i].id,status);
      await ElectionRepository.loadInitialState();
      renderApplicationsTable(); updateAdminBadges();
      toast('Application '+status+'.');
      return;
    }catch(err){console.error(err);toast(err.message || 'Unable to update application.',true);return;}
  }
  S.applications[i].status=status;
  if(status==='approved'){
    var a=S.applications[i];
    var pos=S.positions.find(function(p){return p.key===a.pos;});
    if(pos){
      var promisesList=a.promises||[];
      pos.candidates.push({name:a.name,id:a.matric,bio:a.dept+', '+a.level+(a.cgpa?' · CGPA '+a.cgpa:''),
        manifesto:a.manifesto,promises:promisesList,photo:a.photo||null,emoji:AVS[pos.candidates.length%10]});
      pos.votes.push(0);
      renderPosManager();
      toast(a.name+' approved and added as candidate for '+(pos.name));
    }
  }
  renderApplicationsTable(); updateAdminBadges();
}

// ── BIO MODAL ─────────────────────────────────────────────────
function openBio(ci,posKey){
  var p=S.positions.find(function(x){return x.key===posKey;}); if(!p)return;
  var c=p.candidates[ci]; if(!c)return;
  var m=el('bioModal'); if(!m)return;
  var av=el('bioAv');
  if(av){
    av.innerHTML=avatarHtml(c);
    av.style.fontSize='0';
  }
  setText('bioName',c.name||c); setText('bioPos',p.name); setText('bioDept',c.id||'');
  setText('bioManifesto',c.manifesto||'No manifesto provided.');
  var promEl=el('bioPromises');
  if(promEl){
    if(c.promises&&c.promises.length){
      promEl.innerHTML=c.promises.map(function(pr){return '<li>'+pr+'</li>';}).join('');
    }else{promEl.innerHTML='<li>No key promises listed yet.</li>';}
  }
  m.classList.add('open');
}
function closeBioModal(){var m=el('bioModal');if(m)m.classList.remove('open');}

// ── SMS MODAL ─────────────────────────────────────────────────
function showSmsModal(){
  if(!S.lastTxHash){toast('No vote to confirm yet.',true);return;}
  var u=S.currentUser||{name:'Voter',matric:'—'};
  setText('smsBubble',(S.electionTitle || 'WUCC Computing Election')+'\nYour vote has been recorded.\nTX: '+S.lastTxHash.slice(0,20)+'…\nVoter: '+u.name+'\nBlock: #'+S.lastBlock+'\n✅ CONFIRMED & IMMUTABLE');
  setText('smsTime',watTime()+' WAT');
  var m=el('smsModal'); if(m)m.classList.add('open');
}
function sendSMS(){
  var phone=((el('sms-phone-inp')||{}).value||'').trim();
  if(!phone){toast('Enter a phone number.',true);return;}
  var m=el('smsModal'); if(m)m.classList.remove('open');
  toast('SMS confirmation sent to '+phone);
  logActivity('📱','SMS sent to '+phone,'#0a8a7a');
}

// ── EXPORT / PRINT ────────────────────────────────────────────
function printIdCard(){
  var card=el('voterIdCard'); if(!card){toast('No ID card to print.',true);return;}
  var w=window.open('','','width=420,height=320');
  w.document.write('<html><head><title>Voter ID<\/title><style>body{margin:0;background:#fff;font-family:sans-serif}<\/style><\/head><body>'+card.outerHTML+'<\/body><\/html>');
  w.document.close(); w.print();
}
function printReport(){window.print();}
function exportCSV(){
  var rows=[['Position','Candidate','ID','Votes','Percentage']];
  S.positions.forEach(function(p){
    var total=p.votes.reduce(function(a,b){return a+b;},0);
    p.candidates.forEach(function(c,i){
      rows.push([p.name,c.name||c,c.id||'',p.votes[i]||0,total>0?Math.round((p.votes[i]||0)/total*100)+'%':'0%']);
    });
  });
  var csv=rows.map(function(r){return r.map(function(f){return '"'+String(f).replace(/"/g,'""')+'"';}).join(',');}).join('\n');
  var a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
  a.download='wucc_results_'+Date.now()+'.csv';a.click();
  toast('Results exported as CSV');
}
function exportPDF(){toast('Use Ctrl+P to save as PDF.',false,true);window.print();}
function downloadCSVTemplate(){
  var csv='Name,Matric,Department,Level,Email\n"Emeka Okafor","COSC/21045","Computing","300L","emeka@wucc.edu.ng"';
  var a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
  a.download='voter_template.csv';a.click();
}
function handleCSV(evt){
  var role=ROLES[normalizeAdminRole(S.adminRole)]||ROLES.observer;
  if(!role.canEditVoters){toast('Not permitted for your role.',true);return;}
  var file=evt.target.files[0]; if(!file)return;
  var reader=new FileReader();
  reader.onload=function(e){
    var lines=e.target.result.split('\n').filter(function(l){return l.trim();});
    var added=0,errors=[];
    lines.slice(1).forEach(function(line,li){
      var parts=line.split(',').map(function(s){return s.replace(/"/g,'').trim();});
      if(parts.length<3){errors.push('Row '+(li+2));return;}
      S.voters.push({name:parts[0],matric:parts[1],dept:parts[2],level:parts[3]||'—',email:parts[4]||'',status:'pending',hasVoted:false});
      added++;
    });
    renderVoterTable();refreshAdminStats();
    var preview=el('csv-preview');
    if(preview)preview.innerHTML='<div style="background:rgba(8,145,178,.06);border:1px solid rgba(8,145,178,.2);border-radius:8px;padding:.75rem;font-size:.8rem;color:var(--teal)"><i class="bi bi-check-circle-fill me-2"></i>'+added+' voters imported'+(errors.length?' · '+errors.length+' errors':'')+' from '+file.name+'</div>';
    toast(added+' voters imported from CSV');
  };
  reader.readAsText(file);
}
