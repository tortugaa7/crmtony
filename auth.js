(() => {
  'use strict';

  const config = window.CRM_CONFIG || {};
  const overlay = document.getElementById('authOverlay');
  const form = document.getElementById('authForm');
  const modeButton = document.getElementById('authModeBtn');
  const submitButton = document.getElementById('authSubmitBtn');
  const title = document.getElementById('authTitle');
  const subtitle = document.getElementById('authSubtitle');
  const error = document.getElementById('authError');
  const status = document.getElementById('authStatus');
  const password = document.getElementById('authPassword');
  const passwordConfirm = document.getElementById('authPasswordConfirm');
  const passwordConfirmField = document.getElementById('authPasswordConfirmField');
  const userEmail = document.getElementById('currentUserEmail');
  const logoutButton = document.getElementById('logoutBtn');
  let isRegistration = false;
  let client = null;
  let readyResolver;
  const ready = new Promise(resolve => { readyResolver = resolve; });

  const configured = () => /^https:\/\/.+\.supabase\.co$/i.test(String(config.supabaseUrl || '').trim())
    && /^(eyJ|sb_publishable_)/.test(String(config.supabaseAnonKey || '').trim());

  function setError(message = '') { error.textContent = message; error.classList.toggle('hidden', !message); }
  function setStatus(message = '') { status.textContent = message; status.classList.toggle('hidden', !message); }
  function setBusy(busy) { submitButton.disabled = busy; modeButton.disabled = busy; submitButton.textContent = busy ? 'Aguarde…' : (isRegistration ? 'Criar acesso' : 'Entrar no CRM'); }
  function showOverlay() { overlay.classList.remove('hidden'); document.body.classList.add('auth-open'); }
  function hideOverlay() { overlay.classList.add('hidden'); document.body.classList.remove('auth-open'); }
  function updateMode() {
    title.textContent = isRegistration ? 'Criar acesso' : 'Entrar no CRM';
    subtitle.textContent = isRegistration ? 'Crie seu e-mail e senha para usar o CRM compartilhado.' : 'Entre para acessar os dados compartilhados da equipe.';
    passwordConfirmField.classList.toggle('hidden', !isRegistration);
    passwordConfirm.required = isRegistration;
    submitButton.textContent = isRegistration ? 'Criar acesso' : 'Entrar no CRM';
    modeButton.textContent = isRegistration ? 'Já tenho acesso' : 'Criar meu acesso';
    setError(); setStatus();
  }

  async function finish(session) {
    if (!session?.user) return;
    userEmail.textContent = session.user.email || 'Usuário conectado';
    hideOverlay();
    readyResolver(session);
  }

  async function init() {
    if (!configured() || !window.supabase?.createClient) {
      showOverlay();
      title.textContent = 'Conexão pendente';
      subtitle.textContent = 'Preencha a URL e a chave pública do Supabase no arquivo config.js antes de usar o CRM online.';
      form.classList.add('hidden');
      modeButton.classList.add('hidden');
      setError('Nenhuma chave privada deve ser colocada no projeto. Use somente a chave pública (anon/publishable).');
      return;
    }
    client = window.supabase.createClient(config.supabaseUrl.trim(), config.supabaseAnonKey.trim());
    const { data } = await client.auth.getSession();
    if (data.session) await finish(data.session);
    else showOverlay();
    client.auth.onAuthStateChange((_event, session) => { if (session) finish(session); else showOverlay(); });
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!client) return;
    const email = document.getElementById('authEmail').value.trim();
    const pass = password.value;
    setError(); setStatus();
    if (pass.length < 8) { setError('Use uma senha com pelo menos 8 caracteres.'); return; }
    if (isRegistration && pass !== passwordConfirm.value) { setError('As senhas não conferem.'); return; }
    setBusy(true);
    try {
      if (isRegistration) {
        const { data, error: signupError } = await client.auth.signUp({ email, password: pass, options: { emailRedirectTo: window.location.origin } });
        if (signupError) throw signupError;
        if (data.session) await finish(data.session);
        else setStatus('Conta criada. Confira seu e-mail e confirme o acesso para entrar no CRM.');
      } else {
        const { data, error: signinError } = await client.auth.signInWithPassword({ email, password: pass });
        if (signinError) throw signinError;
        await finish(data.session);
      }
    } catch (authError) { setError(authError.message || 'Não foi possível concluir o acesso.'); }
    finally { setBusy(false); }
  });
  modeButton.addEventListener('click', () => { isRegistration = !isRegistration; updateMode(); });
  logoutButton.addEventListener('click', async () => { if (client) await client.auth.signOut(); });
  updateMode();
  window.CRM_AUTH = { ready, get client() { return client; }, configured, getWorkspaceId: () => String(config.supabaseWorkspaceId || 'tony-acabamentos').trim() || 'tony-acabamentos' };
  init();
})();
