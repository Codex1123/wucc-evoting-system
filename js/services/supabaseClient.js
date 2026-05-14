(function(window){
  function getConfig(){
    return window.WUCC_CONFIG || {};
  }

  function getSupabaseUrl(){
    var raw=(getConfig().supabaseUrl || '').trim();
    if(!raw)return '';
    try{
      var parsed=new URL(raw);
      return parsed.origin.replace(/\/+$/,'');
    }catch(_){
      return raw
        .replace(/\/(?:rest|auth|storage)\/v1\/?$/,'')
        .replace(/\/+$/,'');
    }
  }

  function getSupabaseKey(){
    return (getConfig().supabaseAnonKey || '').trim();
  }

  function isConfigured(){
    var url=getSupabaseUrl();
    var key=getSupabaseKey();
    return Boolean(
      url &&
      key &&
      /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) &&
      url.indexOf('YOUR_PROJECT_REF')<0 &&
      key.indexOf('YOUR_SUPABASE_ANON_KEY')<0 &&
      !getConfig().demoMode
    );
  }

  function getClient(){
    if(!isConfigured())return null;
    if(!window.supabase || !window.supabase.createClient){
      throw new Error('Supabase SDK was not loaded.');
    }
    if(!window.WUCC_SUPABASE){
      window.WUCC_SUPABASE=window.supabase.createClient(getSupabaseUrl(),getSupabaseKey(),{
        auth:{
          persistSession:true,
          autoRefreshToken:true,
          detectSessionInUrl:true
        }
      });
    }
    return window.WUCC_SUPABASE;
  }

  window.WuccSupabase = {
    isConfigured:isConfigured,
    getSupabaseUrl:getSupabaseUrl,
    getSupabaseKey:getSupabaseKey,
    getClient:getClient
  };
})(window);
