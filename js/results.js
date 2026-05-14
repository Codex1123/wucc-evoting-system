// RESULTS
function filterResults(type,btn){
  resultFilter=type;
  document.querySelectorAll('#fAll,#fTop').forEach(function(b){
    b.style.background='var(--white)';b.style.color='var(--muted)';b.style.borderColor='var(--border)';
  });
  if(btn){btn.style.background='var(--cobalt)';btn.style.color='#fff';btn.style.borderColor='var(--cobalt)';}
  renderResults();
}

function renderResults(){
  var filtered=resultFilter==='top'
    ?S.positions.map(function(p){
        var mx=Math.max.apply(null,p.votes.concat(0)),li=p.votes.indexOf(mx);
        return {key:p.key,icon:p.icon,name:p.name,candidates:[p.candidates[li]||p.candidates[0]],votes:[mx]};
      })
    :S.positions;
  var totalVotes=S.positions.reduce(function(sum,p){
    return sum+p.votes.reduce(function(a,b){return a+b;},0);
  },0);
  var activeRaces=S.positions.filter(function(p){
    return p.votes.reduce(function(a,b){return a+b;},0)>0;
  }).length;
  var blocks=S.blockNum-1200;

  setText('res-total-votes',totalVotes);
  setText('res-position-count',S.positions.length);
  setText('res-active-races',activeRaces);
  setText('res-block-count',blocks);

  setHtml('all-results',filtered.map(function(p){
    var total=p.votes.reduce(function(a,b){return a+b;},0);
    var maxV=Math.max.apply(null,p.votes.concat(0));
    var rows=p.candidates.map(function(cn,ci){
      var nm=cn.name||cn, id=cn.id||'', votes=p.votes[ci]||0;
      var pct=total>0?Math.round(votes/total*100):0;
      var lead=votes===maxV&&total>0&&maxV>0;
      var avHtml=avatarHtml(cn);
      return '<div class="rc-row-v6'+(lead?' lead-row':'')+'">'
        +'<div class="rc-av-v6'+(lead?' lead':'')+'" style="background:'+AVC[ci%10]+'14;border-color:'+(lead?'var(--cobalt)':AVC[ci%10]+'44')+'">'+avHtml+'</div>'
        +'<div class="rc-info">'
          +'<div class="rc-nm">'+nm+(lead?'<span class="lead-crown">LEADING</span>':'')+'</div>'
          +'<div class="rc-bar-track"><div class="rc-bar-fill'+(lead?' lead':'')+'" style="width:'+pct+'%"></div></div>'
          +'<div class="rc-sub">'
            +'<span class="rc-votes-badge'+(lead?' lead':'')+'">'+votes+(votes===1?' vote':' votes')+'</span>'
            +'<span>'+id+'</span>'
          +'</div>'
        +'</div>'
        +'<div class="rc-pct-wrap">'
          +'<div class="rc-pct'+(lead?' lead':'')+'">'+pct+'%</div>'
          +'<div class="rc-pct-sub">of votes</div>'
        +'</div>'
      +'</div>';
    }).join('');
    return '<div class="rcard-v6">'
      +'<div class="rcard-head">'
        +'<div class="rcard-icon">'+p.icon+'</div>'
        +'<div class="rcard-title">'+p.name
          +'<span class="rcard-total-badge">'+total+(total===1?' vote':' votes')+'</span>'
        +'</div>'
      +'</div>'
      +rows
    +'</div>';
  }).join(''));

  setText('block-cnt',blocks+' blocks');
  var tbody=el('tx-tbody'); if(!tbody)return;
  if(!S.txLog.length){
    tbody.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--hint);padding:2rem">No transactions recorded yet</td></tr>';
    return;
  }
  tbody.innerHTML=S.txLog.slice(0,20).map(function(tx){
    return '<tr><td data-label="Block">#'+tx.block+'</td>'
      +'<td data-label="TX Hash" class="hash-link">'+tx.hash.slice(0,22)+'...</td>'
      +'<td data-label="Voter Hash" class="hash-link">'+tx.vhash+'...</td>'
      +'<td data-label="Timestamp">'+tx.time+'</td>'
      +'<td data-label="Status"><span class="badge-confirmed">CONFIRMED</span></td></tr>';
  }).join('');
}
