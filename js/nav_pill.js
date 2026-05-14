// ── NAV PILL ──────────────────────────────────────────────────
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


async function castVote(){
  if(window.WuccSupabase && window.WuccSupabase.isConfigured()){
    try{
      var receipt=await ElectionRepository.castBallot(S.currentUser,S.selections);
      if(receipt){
        S.lastTxHash=receipt.tx_hash;
        S.lastBlock=receipt.block_number;
        setText('c-hash',receipt.tx_hash);
        setText('c-block','#'+receipt.block_number);
        setText('c-time',new Date(receipt.created_at).toLocaleString('en-NG',{timeZone:'Africa/Lagos'}));
        var ru=S.currentUser;
        setText('idName',ru.name); setText('idMatric',ru.matric); setText('idDept',ru.dept);
        setText('idTx',receipt.tx_hash.slice(0,26)+'...');
      }
      updateHomeStats();renderResults();setStep(3);toast('Vote successfully recorded.');
      return;
    }catch(err){
      console.error(err);
      toast(err.message || 'Vote could not be recorded.',true);
      return;
    }
  }
  S.positions.forEach(function(p){var ci=S.selections[p.key];if(ci!==undefined)p.votes[ci]++;});
  S.totalVotes++; S.currentUser.hasVoted=true;
  var hash='0x'+randHex(64), vhash='0x'+randHex(16), block=S.blockNum++, now=watTime();
  S.txLog.unshift({block:block,hash:hash,vhash:vhash,time:now});
  S.lastTxHash=hash; S.lastBlock=block;
  setText('c-hash',hash); setText('c-block','#'+block); setText('c-time',now);
  var u=S.currentUser;
  setText('idName',u.name); setText('idMatric',u.matric); setText('idDept',u.dept);
  setText('idTx',hash.slice(0,26)+'…');
  var av=el('idAvatar'); if(av)av.innerHTML='<span class="avatar-initials">'+initialsFromName(u.name)+'</span>';
  logActivity('🗳','Vote cast by '+u.name,'#1a3bc1');
  updateHomeStats(); setStep(3); toast('Vote successfully recorded on the blockchain!');
}
