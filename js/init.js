document.addEventListener('DOMContentLoaded',async function(){
  if(typeof applyTheme==='function')applyTheme();

  var ma=el('ca-manifesto');
  if(ma){ma.addEventListener('input',function(){setText('manifest-count',ma.value.length);});}

  ['bioModal','smsModal'].forEach(function(id){
    var m=el(id);
    if(m){m.addEventListener('click',function(e){if(e.target===m)m.classList.remove('open');});}
  });

  var ap=el('adm-pass');
  if(ap){ap.addEventListener('keydown',function(e){if(e.key==='Enter')adminLogin();});}

  if(window.WuccSupabase && window.WuccSupabase.isConfigured()){
    try{
      await ElectionRepository.loadInitialState();
      logActivity('DB','Supabase election data loaded','#1a3bc1');
      try{
        var adminProfile=await ElectionRepository.getCurrentAdmin();
        if(adminProfile){
          S.adminRole=window.WuccRoles ? window.WuccRoles.normalizeRole(adminProfile.role) : adminProfile.role;
          S.adminName=adminProfile.full_name;
        }
      }catch(authErr){
        console.error(authErr);
        if(typeof showAdminError==='function')showAdminError(authErr.message || 'Admin session could not be restored.');
        toast(authErr.message || 'Admin session could not be restored.',true);
      }
      ElectionRepository.startRealtimeSync(function(){
        refreshElectionViews();
        var page=(window.location.hash || '').replace('#','') || 'home';
        if(page==='results')renderResults();
        if(page==='dashboard')renderDashboard();
        if(page==='admin' && S.adminRole)showAdminDash();
      });
    }catch(err){
      console.error(err);
      toast('Supabase data could not be loaded. Check configuration and policies.',true);
    }
  }else{
    S.positions.forEach(function(p){
      p.votes=p.candidates.map(function(){return Math.floor(Math.random()*18)+2;});
    });
    S.totalVotes=S.positions[0].votes.reduce(function(a,b){return a+b;},0);
    for(var i=0;i<S.totalVotes;i++){
      S.txLog.push({block:S.blockNum+i,hash:'0x'+randHex(64),vhash:'0x'+randHex(16),time:watTime()});
      S.blockNum++;
    }
    S.voters.forEach(function(v,i){if(i<3)v.hasVoted=true;});
    S.electionActive=true;
    S.electionStatus='active';
    S.electionStart=new Date();
    S.electionEnd=new Date(Date.now()+8*3600000);
    logActivity('DEMO','Local demo mode active','#b07d20');
  }

  updateHomeStats();
  renderHomePosCards();
  applyElectionUiState();
  updateNavPill();
  updateCountdown();
  showPage((window.location.hash || '').replace('#','') || 'home');
});
