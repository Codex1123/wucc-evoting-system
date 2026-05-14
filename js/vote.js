// ── VOTE FLOW ─────────────────────────────────────────────────
function setStep(n){
  for(var i=1;i<=3;i++){
    var panel=el('sp'+i); if(panel)panel.classList.toggle('active',i===n);
    var b=el('vs'+i);
    if(b){b.className='sbadge '+(i===n?'cur':i<n?'done':'');
          b.innerHTML=i<n?'<i class="bi bi-check-lg" style="font-size:.66rem"><\/i>':String(i);}
    if(i>1){var lbl=el('vs'+i+'l');if(lbl)lbl.className='slbl '+(i===n?'cur':i<n?'done':'');}
  }
  window.scrollTo(0,0);
}

async function verifyVoter(){
  var matric=((el('inp-matric')||{}).value||'').trim();
  var dept=((el('inp-dept')||{}).value||'');
  var email=((el('inp-email')||{}).value||'').trim();
  var errEl=el('auth-err');
  function showErr(m){if(errEl){errEl.textContent=m;errEl.style.display='block';}}
  if(errEl)errEl.style.display='none';
  if(!matric||!dept||!email){showErr('Please fill in all fields.');return;}
  if(!S.electionActive){showErr('The election is not currently active.');return;}
  var voter=null;
  if(window.WuccSupabase && window.WuccSupabase.isConfigured()){
    try{
      var remote=await ElectionRepository.verifyVoter(matric,dept,email);
      if(remote){
        voter={id:remote.id,name:remote.full_name,matric:remote.matric,dept:remote.department,level:remote.level,email:remote.email,status:remote.status,hasVoted:remote.has_voted};
      }
    }catch(err){
      console.error(err);
      showErr(err.message || 'Unable to verify voter.');
      return;
    }
  }else{
    for(var i=0;i<S.voters.length;i++){
      var v=S.voters[i];
      if(v.matric.toLowerCase()===matric.toLowerCase()&&v.dept===dept&&v.email.toLowerCase()===email.toLowerCase()){voter=v;break;}
    }
  }
  if(!voter){showErr('Voter not found. Please check your credentials.');return;}
  if(voter.status==='pending'){showErr('Registration pending approval. Contact the Electoral Commission.');return;}
  if(voter.status==='rejected'){showErr('Registration rejected. Contact the Electoral Commission.');return;}
  if(voter.hasVoted){showErr('You have already voted in this election.');return;}
  S.currentUser=voter; S.selections={};
  buildVoteSections(); setStep(2); updateProgress();
  toast('Identity verified. Please make your selections.');
}

function buildVoteSections(){
  var c=el('vote-sections'); if(!c)return;
  c.innerHTML=S.positions.map(function(p,pi){
    var cands=p.candidates.map(function(cn,ci){
      var nm=cn.name||cn, id=cn.id||'';
      var avHtml=avatarHtml(cn);
      return '<div class="col-6 col-sm-4 col-md-3">'
        +'<div class="ccard-v6" id="vc-'+p.key+'-'+ci+'" onclick="selectVote(\''+p.key+'\','+ci+',this)">'
        +'<div class="ccard-av" style="background:'+AVC[ci%10]+'18;border-color:'+AVC[ci%10]+'44;overflow:hidden">'+avHtml+'<\/div>'
        +'<div class="ccard-nm">'+nm+'<\/div>'
        +'<div class="ccard-id">'+id+'<\/div>'
        +'<div class="ccard-chk"><i class="bi bi-check-lg" style="font-size:.6rem"><\/i><\/div>'
        +'<button class="ccard-bio" onclick="event.stopPropagation();openBio('+ci+',\''+p.key+'\')">'
        +'<i class="bi bi-person-fill me-1"><\/i>View Profile<\/button>'
        +'<\/div><\/div>';
    }).join('');
    return '<div class="vsec-v6">'
      +'<div class="vsec-head-v6">'
      +'<span class="vsec-num-v6">'+String(pi+1).padStart(2,'0')+'<\/span>'
      +'<span class="vsec-name-v6">'+p.icon+' '+p.name+'<\/span>'
      +'<span class="vsec-sub-v6">Select one candidate<\/span>'
      +'<\/div><div class="vsec-body-v6"><div class="row g-2">'+cands+'<\/div><\/div><\/div>';
  }).join('');
}

function selectVote(posKey,ci,elem){
  var p=S.positions.find(function(x){return x.key===posKey;}); if(!p)return;
  p.candidates.forEach(function(_,i){var card=el('vc-'+posKey+'-'+i);if(card)card.classList.remove('sel');});
  if(elem)elem.classList.add('sel');
  S.selections[posKey]=ci; updateProgress();
}

function updateProgress(){
  var count=Object.keys(S.selections).length;
  var pct=Math.round(count/S.positions.length*100);
  setText('sel-count',count);
  var bar=el('sel-bar'); if(bar)bar.style.width=pct+'%';
  var btn=el('castBtn');
  if(count===S.positions.length){if(btn)btn.disabled=false;setText('vote-warn','');}
  else{if(btn)btn.disabled=true;setText('vote-warn',(S.positions.length-count)+' position(s) remaining');}
}
