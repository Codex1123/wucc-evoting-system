// ── HOME STATS ────────────────────────────────────────────────
function updateHomeStats(){
  var approved=S.voterStats ? Number(S.voterStats.approved_voters || 0) : S.voters.filter(function(v){return v.status==='approved';}).length;
  var pct=approved>0?Math.round(S.totalVotes/approved*100):0;
  ['st-votes','hp-votes'].forEach(function(id){setText(id,S.totalVotes);});
  ['st-voters','hp-voters'].forEach(function(id){setText(id,approved);});
  ['st-pct','hp-pct'].forEach(function(id){setText(id,pct+'%');});
  var pb=el('heroPanelBadge');
  if(pb){
    var status=S.electionStatus || (S.electionActive?'active':'draft');
    pb.className=S.electionActive?'hcard-badge':'hcard-badge off';
    pb.textContent=S.electionActive?'ELECTION LIVE':(status==='closed'?'ELECTION ENDED':'ELECTION INACTIVE');
  }
  setText('heroBadgeTxt',S.electionTitle || 'WUCC Computing Election');
}

// ── HOME POSITIONS ────────────────────────────────────────────
function renderHomePosCards(){
  var c=el('homePosList'); if(!c)return;
  var PALETTES=[
    {accent:'#1a3bc1',iconBg:'#eef1fd',iconBorder:'#c7d1fc',badgeBg:'#eef1fd',badgeBorder:'#c7d1fc'},
    {accent:'#e84a1a',iconBg:'#fff0eb',iconBorder:'#fcc5af',badgeBg:'#fff0eb',badgeBorder:'#fcc5af'},
    {accent:'#0891b2',iconBg:'#e0f5f9',iconBorder:'#a5d8e6',badgeBg:'#e0f5f9',badgeBorder:'#a5d8e6'},
    {accent:'#b07d20',iconBg:'#fff8e6',iconBorder:'#f0d08a',badgeBg:'#fff8e6',badgeBorder:'#f0d08a'},
    {accent:'#7c3aed',iconBg:'#ede9fe',iconBorder:'#c4b5fd',badgeBg:'#ede9fe',badgeBorder:'#c4b5fd'},
    {accent:'#0d6e3a',iconBg:'#dcfce7',iconBorder:'#86efac',badgeBg:'#dcfce7',badgeBorder:'#86efac'},
    {accent:'#1a3bc1',iconBg:'#eef1fd',iconBorder:'#c7d1fc',badgeBg:'#eef1fd',badgeBorder:'#c7d1fc'},
    {accent:'#9d174d',iconBg:'#fce7f3',iconBorder:'#f9a8d4',badgeBg:'#fce7f3',badgeBorder:'#f9a8d4'},
    {accent:'#0284c7',iconBg:'#e0f2fe',iconBorder:'#93c5fd',badgeBg:'#e0f2fe',badgeBorder:'#93c5fd'},
    {accent:'#b45309',iconBg:'#fef3c7',iconBorder:'#fcd34d',badgeBg:'#fef3c7',badgeBorder:'#fcd34d'},
  ];
  c.innerHTML=S.positions.map(function(p,i){
    var pal=PALETTES[i%PALETTES.length];
    return '<div class="pos-card-v6" onclick="showPage(\'results\')" style="'
      +'--card-accent:'+pal.accent+';'
      +'--card-icon-bg:'+pal.iconBg+';'
      +'--card-icon-border:'+pal.iconBorder+';'
      +'--card-badge-bg:'+pal.badgeBg+';'
      +'--card-badge-border:'+pal.badgeBorder+';">'
        +'<div class="pos-card-num">Position '+String(i+1).padStart(2,'0')+'</div>'
        +'<div class="pos-card-icon-wrap">'+positionIconHtml(p.key)+'</div>'
        +'<div class="pos-card-name">'+p.name+'</div>'
        +'<div class="pos-card-footer">'
          +'<span class="pos-card-badge">'+p.candidates.length+' candidate'+(p.candidates.length!==1?'s':'')+'</span>'
          +'<span class="pos-card-arrow"><i class="bi bi-arrow-right"></i></span>'
        +'</div>'
      +'</div>';
  }).join('');
}
