// ── DASHBOARD ─────────────────────────────────────────────────
function renderDashboard(){
  var approved=S.voterStats ? Number(S.voterStats.approved_voters || 0) : S.voters.filter(function(v){return v.status==='approved';}).length;
  var voted=S.voterStats ? Number(S.voterStats.voted_voters || 0) : S.voters.filter(function(v){return v.hasVoted;}).length;
  var pct=approved>0?Math.round(voted/approved*100):0;
  var blocks=S.blockNum-1200;

  // KPI cards
  setText('db-kpi-votes',  S.totalVotes);
  setText('db-kpi-voters', approved);
  setText('db-kpi-turnout',pct+'%');
  setText('db-kpi-blocks', blocks);
  setText('db-kpi-voters-sub', (S.voterStats ? Number(S.voterStats.pending_voters || 0) : S.voters.filter(function(v){return v.status==='pending';}).length)+' pending approval');
  setText('db-kpi-turnout-sub', voted+' of '+approved+' have voted');

  // Bar chart
  var bc=el('barChart');
  if(bc){
    if(_bci){_bci.destroy();_bci=null;}
    var barColors=S.positions.map(function(_,i){
      var cols=['rgba(26,59,193,.75)','rgba(232,74,26,.75)','rgba(8,145,178,.75)','rgba(176,125,32,.75)',
                'rgba(124,58,237,.75)','rgba(13,110,58,.75)','rgba(26,59,193,.75)','rgba(157,23,77,.75)',
                'rgba(2,132,199,.75)','rgba(180,83,9,.75)'];
      return cols[i%cols.length];
    });
    var barBorders=S.positions.map(function(_,i){
      var cols=['#1a3bc1','#e84a1a','#0891b2','#b07d20','#7c3aed','#0d6e3a','#1a3bc1','#9d174d','#0284c7','#b45309'];
      return cols[i%cols.length];
    });
    _bci=new Chart(bc.getContext('2d'),{
      type:'bar',
      data:{
        labels:S.positions.map(function(p){
          var w=p.name.split(' ');return w.length>2?w[0]+' '+w[1]:p.name;
        }),
        datasets:[{
          label:'Leading votes',
          data:S.positions.map(function(p){return Math.max.apply(null,p.votes.concat(0));}),
          backgroundColor:barColors,
          borderColor:barBorders,
          borderWidth:1.5,
          borderRadius:8,
          borderSkipped:false
        }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{
            callbacks:{
              title:function(items){
                var p=S.positions[items[0].dataIndex];
                return p?p.name:items[0].label;
              },
              label:function(item){
                var p=S.positions[item.dataIndex];
                var mx=item.raw,total=p?p.votes.reduce(function(a,b){return a+b;},0):0;
                var pct=total>0?Math.round(mx/total*100):0;
                return ' '+mx+' votes ('+pct+'%)';
              }
            },
            backgroundColor:'rgba(12,15,30,.85)',
            titleFont:{family:'DM Serif Display',size:13},
            bodyFont:{family:'Fira Code',size:11},
            padding:10,cornerRadius:8
          }
        },
        scales:{
          x:{ticks:{color:'#94a3b8',font:{size:10},maxRotation:30},grid:{display:false},border:{display:false}},
          y:{ticks:{color:'#94a3b8',font:{size:10}},grid:{color:'rgba(0,0,0,.04)'},border:{display:false}}
        }
      }
    });
  }

  // Doughnut
  var dc=el('doughnutChart');
  if(dc){
    if(_dci){_dci.destroy();_dci=null;}
    _dci=new Chart(dc.getContext('2d'),{
      type:'doughnut',
      data:{
        labels:['Voted','Not Voted'],
        datasets:[{
          data:[voted, Math.max(approved-voted,0)],
          backgroundColor:['#1a3bc1','#eef1fd'],
          borderColor:['#1a3bc1','#e2e5f0'],
          borderWidth:2,
          hoverOffset:4
        }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        cutout:'72%'
      }
    });
  }
  setText('turnoutPct',pct+'%');

  // Leaders table
  var tb=el('db-leaders-tbody');
  if(tb){
    if(!S.positions.length){
      tb.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--hint);padding:1.5rem">No data yet</td></tr>';
    } else {
      tb.innerHTML=S.positions.map(function(p,pi){
        var total=p.votes.reduce(function(a,b){return a+b;},0);
        var mx=Math.max.apply(null,p.votes.concat(0));
        var li=p.votes.indexOf(mx);
        var ldr=li>=0&&p.candidates[li]?p.candidates[li]:{name:'—',id:'',emoji:'?',photo:null};
        var ldrName=ldr.name||'—';
        var pct2=total>0?Math.round(mx/total*100):0;
        var avHtml=avatarHtml(ldr);
        var AVC2=['#1a3bc1','#e84a1a','#0891b2','#b07d20','#7c3aed','#0d6e3a','#1a3bc1','#9d174d','#0284c7','#b45309'];
        return '<tr>'
          +'<td data-label="Photo"><div class="leader-av" style="background:'+AVC2[pi%10]+'14;border:1.5px solid '+AVC2[pi%10]+'33">'+avHtml+'</div></td>'
          +'<td data-label="Position" style="font-size:.78rem;font-weight:600;color:var(--ink)">'+p.name+'</td>'
          +'<td data-label="Leader"><div style="font-size:.8rem;font-weight:800;color:var(--ink)">'+ldrName+'</div>'
             +'<div style="font-family:\'Fira Code\',monospace;font-size:.58rem;color:var(--hint)">'+mx+' votes</div></td>'
          +'<td data-label="Votes"><span style="font-family:\'DM Serif Display\',serif;font-size:1rem;color:var(--cobalt)">'+pct2+'%</span></td>'
          +'<td data-label="Progress" style="min-width:90px"><div class="leader-bar-wrap">'
             +'<div class="leader-bar-bg"><div class="leader-bar-fill" style="width:'+pct2+'%;background:'+AVC2[pi%10]+'"></div></div>'
           +'</div></td>'
          +'</tr>';
      }).join('');
    }
  }

  // Activity feed
  var ac=el('recentActivity'); if(!ac)return;
  if(!S.activityLog.length){
    ac.innerHTML='<p style="color:var(--muted);font-size:.83rem;padding:.3rem 0">No activity recorded yet.</p>';
    return;
  }
  ac.innerHTML=S.activityLog.slice(0,12).map(function(a){
    return '<div class="act-row-v6">'
      +'<div class="act-ic-v6" style="background:'+a.color+'14;border:1px solid '+a.color+'22">'+a.icon+'</div>'
      +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:.79rem;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+a.msg+'</div>'
        +'<div style="font-family:\'Fira Code\',monospace;font-size:.59rem;color:var(--hint);margin-top:.1rem">'+a.time+'</div>'
      +'</div>'
    +'</div>';
  }).join('');
}
