(function(window){
  function client(){
    return window.WuccSupabase && window.WuccSupabase.getClient();
  }

  function requireClient(){
    var sb=client();
    if(!sb)throw new Error('Supabase is not configured. Update js/config/app.config.js and set demoMode to false.');
    return sb;
  }

  var ROLE_ALIASES={
    superadmn:'superadmin',
    super_admin:'superadmin',
    superadmin:'superadmin',
    commisiner:'commissioner',
    comissioner:'commissioner',
    commissioner:'commissioner',
    commission:'commissioner',
    observer:'observer',
    voter:'voter'
  };
  var ADMIN_ROLES=['superadmin','commissioner','observer'];

  function normalizeRole(role){
    var key=String(role || '').trim().toLowerCase().replace(/[\s-]+/g,'_');
    return ROLE_ALIASES[key] || key;
  }

  function isAdminRole(role){
    return ADMIN_ROLES.indexOf(normalizeRole(role))>=0;
  }

  var syncChannel=null;
  var syncTimer=null;

  function normalizeCandidate(row){
    return {
      id: row.matric || row.id,
      dbId: row.id,
      name: row.full_name,
      bio: [row.department,row.level].filter(Boolean).join(', '),
      manifesto: row.manifesto || '',
      promises: row.promises || [],
      emoji: row.avatar || null,
      photo: row.photo_url || null
    };
  }

  function hydrateState(payload){
    if(!payload)return;
    var election=payload.election || {};
    S.electionTitle=election.title || S.electionTitle || 'WUCC Computing Election';
    S.electionStatus=election.status || 'draft';
    S.electionActive=S.electionStatus==='active';
    S.electionStart=election.starts_at ? new Date(election.starts_at) : null;
    S.electionEnd=election.ends_at ? new Date(election.ends_at) : null;

    S.voters=(payload.voters || []).map(function(v){
      return {
        id:v.id,
        name:v.full_name,
        matric:v.matric,
        dept:v.department,
        level:v.level || '',
        email:v.email,
        status:v.status,
        hasVoted:Boolean(v.has_voted)
      };
    });

    S.applications=(payload.applications || []).map(function(a){
      var position=(payload.positions || []).find(function(p){return p.id===a.position_id;});
      return {
        id:a.id,
        name:a.full_name,
        matric:a.matric,
        dept:a.department,
        level:a.level,
        email:a.email,
        phone:a.phone,
        pos:position ? position.slug : a.position_id,
        manifesto:a.manifesto,
        promises:a.promises || [],
        cgpa:a.cgpa,
        prevRole:a.previous_role,
        photo:a.photo_url,
        ref:a.reference,
        status:a.status,
        time:new Date(a.created_at).toLocaleString('en-NG',{timeZone:'Africa/Lagos'})
      };
    });

    var resultByCandidate={};
    (payload.results || []).forEach(function(r){resultByCandidate[r.candidate_id]=Number(r.vote_count || 0);});
    S.positions=(payload.positions || []).map(function(p){
      var candidates=(p.candidates || []).map(normalizeCandidate);
      return {
        id:p.id,
        key:p.slug,
        icon:p.icon || '',
        name:p.title,
        candidates:candidates,
        votes:candidates.map(function(c){return resultByCandidate[c.dbId] || 0;})
      };
    });

    S.voterStats=payload.stats || null;
    S.totalVotes=S.voterStats ? Number(S.voterStats.voted_voters || 0) : (payload.ballots || []).length;
    S.txLog=(payload.ballots || []).map(function(tx){
      return {
        block:tx.block_number,
        hash:tx.tx_hash,
        vhash:tx.voter_hash,
        time:new Date(tx.created_at).toLocaleString('en-NG',{timeZone:'Africa/Lagos'})
      };
    });
    var maxBlock=S.txLog.reduce(function(max,tx){return Math.max(max,Number(tx.block || 1200));},1200);
    S.blockNum=maxBlock+1;
  }

  async function loadInitialState(){
    var sb=requireClient();
    var electionReq=sb.from('elections').select('*').order('created_at',{ascending:false}).limit(1).maybeSingle();
    var positionReq=sb.from('positions').select('*, candidates(*)').eq('is_active',true).order('display_order',{ascending:true});
    var resultReq=sb.rpc('get_candidate_results_safe');
    var ballotReq=sb.from('ballots').select('block_number, tx_hash, voter_hash, created_at').order('created_at',{ascending:false}).limit(25);
    var voterReq=sb.from('voters').select('*').order('full_name',{ascending:true});
    var statsReq=sb.rpc('get_election_stats_safe').maybeSingle();
    var appsReq=sb.from('candidate_applications').select('*').order('created_at',{ascending:false});
    var responses=await Promise.all([electionReq,positionReq,resultReq,ballotReq,voterReq,statsReq,appsReq]);
    responses.slice(0,4).forEach(function(res){if(res.error)throw res.error;});
    hydrateState({
      election:responses[0].data,
      positions:responses[1].data,
      results:responses[2].data,
      ballots:responses[3].data,
      voters:responses[4].error ? [] : responses[4].data,
      stats:responses[5].error ? null : responses[5].data,
      applications:responses[6].error ? [] : responses[6].data
    });
  }

  async function getAdminProfile(user){
    var sb=requireClient();
    if(!user)return null;
    var profile=await sb.from('profiles').select('full_name, role').eq('id',user.id).maybeSingle();
    if(profile.error)throw profile.error;
    if(!profile.data){
      await sb.auth.signOut();
      throw new Error('Missing profile: this Supabase Auth user has no matching row in the profiles table.');
    }
    var normalizedRole=normalizeRole(profile.data.role);
    if(['superadmin','commissioner','observer','voter'].indexOf(normalizedRole)<0){
      await sb.auth.signOut();
      throw new Error('Invalid profile role: "'+profile.data.role+'". Use superadmin, commissioner, observer, or voter.');
    }
    if(!isAdminRole(normalizedRole)){
      await sb.auth.signOut();
      throw new Error('Unauthorized access: voters cannot access the admin area.');
    }
    return {
      full_name:profile.data.full_name || user.email || 'Admin User',
      role:normalizedRole
    };
  }

  async function signInAdmin(email,password){
    var sb=requireClient();
    var auth=await sb.auth.signInWithPassword({email:email,password:password});
    if(auth.error)throw auth.error;
    return getAdminProfile(auth.data.user);
  }

  async function getCurrentAdmin(){
    var sb=requireClient();
    var userRes=await sb.auth.getUser();
    if(userRes.error)throw userRes.error;
    if(!userRes.data.user)return null;
    return getAdminProfile(userRes.data.user);
  }

  async function signOutAdmin(){
    var sb=client();
    if(sb)await sb.auth.signOut();
  }

  async function verifyVoter(matric,department,email){
    var sb=requireClient();
    var res=await sb.rpc('verify_voter',{p_matric:matric,p_department:department,p_email:email});
    if(res.error)throw res.error;
    return res.data && res.data[0] ? res.data[0] : null;
  }

  async function castBallot(voter,selections){
    var sb=requireClient();
    var payload=Object.keys(selections).map(function(key){
      var p=S.positions.find(function(pos){return pos.key===key;});
      var ci=selections[key];
      return {position_id:p.id,candidate_id:p.candidates[ci].dbId};
    });
    var res=await sb.rpc('cast_ballot',{
      p_matric:voter.matric,
      p_department:voter.dept,
      p_email:voter.email,
      p_selections:payload
    });
    if(res.error)throw res.error;
    await loadInitialState();
    return res.data && res.data[0] ? res.data[0] : null;
  }

  async function updateVoterStatus(voterId,status){
    var sb=requireClient();
    var res=await sb.from('voters').update({status:status}).eq('id',voterId);
    if(res.error)throw res.error;
  }

  async function insertVoter(voter,status){
    var sb=requireClient();
    var res=await sb.from('voters').insert({
      full_name:voter.name,
      matric:voter.matric,
      department:voter.dept,
      level:voter.level,
      email:voter.email,
      status:status
    });
    if(res.error)throw res.error;
  }

  async function submitApplication(application){
    var sb=requireClient();
    var position=S.positions.find(function(p){return p.key===application.pos;});
    if(!position || !position.id)throw new Error('Select a valid position before submitting.');
    var election=await sb.from('elections').select('id').order('created_at',{ascending:false}).limit(1).single();
    if(election.error)throw election.error;
    var res=await sb.from('candidate_applications').insert({
      election_id:election.data.id,
      position_id:position.id,
      full_name:application.name,
      matric:application.matric,
      department:application.dept,
      level:application.level,
      email:application.email,
      phone:application.phone,
      manifesto:application.manifesto,
      promises:application.promises,
      cgpa:application.cgpa,
      previous_role:application.prevRole,
      photo_url:application.photo,
      reference:application.ref
    });
    if(res.error)throw res.error;
  }

  async function updateApplicationStatus(applicationId,status){
    var sb=requireClient();
    var res=await sb.from('candidate_applications').update({status:status}).eq('id',applicationId);
    if(res.error)throw res.error;
  }

  async function setElectionStatus(status,start,end){
    var sb=requireClient();
    var payload={
      p_status:status,
      p_starts_at:start ? start.toISOString() : null,
      p_ends_at:end ? end.toISOString() : null
    };
    var res=await sb.rpc('set_current_election_status',payload);
    if(res.error){
      await updateCurrentElectionRow({
        status:status,
        starts_at:payload.p_starts_at,
        ends_at:payload.p_ends_at
      });
    }
    await loadInitialState();
  }

  async function updateElectionSettings(settings){
    var sb=requireClient();
    var payload={
      p_title:settings.title,
      p_status:settings.status,
      p_starts_at:settings.start ? settings.start.toISOString() : null,
      p_ends_at:settings.end ? settings.end.toISOString() : null
    };
    var res=await sb.rpc('update_current_election_settings',payload);
    if(res.error){
      await updateCurrentElectionRow({
        title:settings.title,
        status:settings.status,
        starts_at:payload.p_starts_at,
        ends_at:payload.p_ends_at
      });
    }
    await loadInitialState();
  }

  async function updateCurrentElectionRow(values){
    var sb=requireClient();
    var current=await sb.from('elections').select('id,title,status,starts_at,ends_at').order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(current.error)throw current.error;
    if(!current.data){
      var inserted=await sb.from('elections').insert({
        title:values.title || S.electionTitle || 'WUCC Computing Election',
        status:values.status || 'draft',
        starts_at:values.starts_at || null,
        ends_at:values.ends_at || null
      });
      if(inserted.error)throw inserted.error;
      return;
    }
    var update={
      title:values.title || current.data.title,
      status:values.status || current.data.status,
      starts_at:Object.prototype.hasOwnProperty.call(values,'starts_at') ? values.starts_at : current.data.starts_at,
      ends_at:Object.prototype.hasOwnProperty.call(values,'ends_at') ? values.ends_at : current.data.ends_at,
      updated_at:new Date().toISOString()
    };
    var updated=await sb.from('elections').update(update).eq('id',current.data.id);
    if(updated.error)throw updated.error;
  }

  async function resetElectionData(){
    var sb=requireClient();
    var res=await sb.rpc('reset_current_election_data');
    if(res.error)throw res.error;
    await loadInitialState();
  }

  function startRealtimeSync(onSynced){
    var sb=client();
    if(!sb || syncChannel)return syncChannel;

    function refresh(){
      window.clearTimeout(syncTimer);
      syncTimer=window.setTimeout(async function(){
        try{
          await loadInitialState();
          if(typeof onSynced==='function')onSynced();
        }catch(err){
          console.error(err);
          if(window.toast)toast('Supabase sync failed. Check connection and policies.',true);
        }
      },350);
    }

    syncChannel=sb.channel('wucc-election-sync');
    [
      'elections',
      'positions',
      'candidates',
      'ballots',
      'vote_selections',
      'candidate_applications',
      'voters'
    ].forEach(function(table){
      syncChannel.on('postgres_changes',{event:'*',schema:'public',table:table},refresh);
    });
    syncChannel.subscribe(function(status){
      if(status==='SUBSCRIBED')logActivity('SYNC','Supabase realtime sync connected','#0891b2');
    });
    return syncChannel;
  }

  async function stopRealtimeSync(){
    var sb=client();
    window.clearTimeout(syncTimer);
    syncTimer=null;
    if(sb && syncChannel)await sb.removeChannel(syncChannel);
    syncChannel=null;
  }

  window.ElectionRepository = {
    loadInitialState:loadInitialState,
    startRealtimeSync:startRealtimeSync,
    stopRealtimeSync:stopRealtimeSync,
    signInAdmin:signInAdmin,
    getCurrentAdmin:getCurrentAdmin,
    signOutAdmin:signOutAdmin,
    verifyVoter:verifyVoter,
    castBallot:castBallot,
    updateVoterStatus:updateVoterStatus,
    insertVoter:insertVoter,
    submitApplication:submitApplication,
    updateApplicationStatus:updateApplicationStatus,
    setElectionStatus:setElectionStatus,
    updateElectionSettings:updateElectionSettings,
    resetElectionData:resetElectionData
  };
  window.WuccRoles = {
    normalizeRole:normalizeRole,
    isAdminRole:isAdminRole
  };
})(window);
