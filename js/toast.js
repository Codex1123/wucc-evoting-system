// ── TOAST ─────────────────────────────────────────────────────
function toast(msg,isErr,isInfo){
  var t=el('toast'); if(!t)return;
  var icon=isErr?'<i class="bi bi-exclamation-circle-fill me-2" style="color:var(--coral)"></i>'
           :isInfo?'<i class="bi bi-info-circle-fill me-2" style="color:var(--cobalt)"></i>'
                  :'<i class="bi bi-check-circle-fill me-2" style="color:var(--teal)"></i>';
  t.innerHTML=icon+msg;
  t.className='toast-v6'+(isErr?' err':' ok');
  t.classList.add('show');
  clearTimeout(t._t);
  t._t=setTimeout(function(){t.classList.remove('show');},3500);
}

