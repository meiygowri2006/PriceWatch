const API_BASE_URL = 'https://pricewatch-2wsu.onrender.com';
const TOKEN_KEY = 'pricewatch_token';

const loginPanel = document.getElementById('login-panel');
const registerPanel = document.getElementById('register-panel');
const loginStandard = document.getElementById('login-standard');
const googleFinalize = document.getElementById('google-finalize');
const authMessage = document.getElementById('auth-message');
const tabs = document.querySelectorAll('.auth-tab');
const loginForm = document.getElementById('login-form');

let pendingGoogleEmail = '';
let pendingGoogleIdToken = '';
let googleClientId = '';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function redirectToDashboard() {
  window.location.href = 'index.html';
}

function showMessage(text, type = 'error') {
  authMessage.textContent = text;
  authMessage.className = `auth-message visible ${type}`;
}

function hideMessage() {
  authMessage.className = 'auth-message';
  authMessage.textContent = '';
}

function setLoading(button, isLoading, defaultText) {
  button.disabled = isLoading;
  button.textContent = isLoading ? 'Please wait...' : defaultText;
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return { message: 'Unexpected server response.' };
  }
}

function initPasswordToggles() {
  document.querySelectorAll('.password-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;

      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.classList.toggle('visible', isPassword);
    });
  });
}

function showLoginPanel() {
  loginPanel.classList.add('active');
  registerPanel.classList.remove('active');
  hideMessage();
}

function showRegisterPanel() {
  loginPanel.classList.remove('active');
  registerPanel.classList.add('active');
  hideMessage();
}

function resetGoogleFinalize() {
  pendingGoogleEmail = '';
  pendingGoogleIdToken = '';
  document.getElementById('finalize-username').value = '';
  document.getElementById('finalize-password').value = '';
  document.getElementById('finalize-confirm').value = '';
  loginStandard.classList.remove('hidden');
  googleFinalize.classList.add('hidden');
}

function showGoogleFinalizeForm(email) {
  switchTab('login');
  pendingGoogleEmail = email;
  document.getElementById('finalize-email-display').textContent = email;
  loginStandard.classList.add('hidden');
  googleFinalize.classList.remove('hidden');
  tabs.forEach((tab) => tab.classList.add('hidden'));
  hideMessage();
}

function switchTab(tabName) {
  tabs.forEach((tab) => {
    tab.classList.remove('hidden');
    const isActive = tab.dataset.tab === tabName;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive);
  });

  if (tabName === 'login') {
    showLoginPanel();
  } else {
    resetGoogleFinalize();
    showRegisterPanel();
  }
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    resetGoogleFinalize();
    switchTab(tab.dataset.tab);
  });
});

if (getToken()) {
  redirectToDashboard();
}

initPasswordToggles();

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMessage();

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const submitBtn = document.getElementById('login-submit');

  setLoading(submitBtn, true, 'Sign In');

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await parseJsonResponse(response);

    if (response.ok) {
      setToken(data.token);
      showMessage('Login successful. Redirecting...', 'success');
      setTimeout(redirectToDashboard, 800);
      return;
    }

    if (data.requiresPasswordSetup) {
      pendingGoogleIdToken = '';
      showGoogleFinalizeForm(data.email || email);
      showMessage('Please complete your account setup.', 'error');
      return;
    }

    showMessage(data.message || 'Login failed.');
  } catch (error) {
    console.error('Login error:', error);
    showMessage('Cannot connect to server. Is the backend running?');
  } finally {
    setLoading(submitBtn, false, 'Sign In');
  }
});

document.getElementById('complete-account-btn').addEventListener('click', async () => {
  hideMessage();

  const username = document.getElementById('finalize-username').value.trim();
  const password = document.getElementById('finalize-password').value;
  const confirm = document.getElementById('finalize-confirm').value;
  const btn = document.getElementById('complete-account-btn');

  if (!pendingGoogleEmail || !pendingGoogleIdToken) {
    showMessage('Google session expired. Please sign in with Google again.');
    resetGoogleFinalize();
    return;
  }

  if (username.length < 3) {
    showMessage('Username must be at least 3 characters.');
    return;
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    showMessage('Username may only contain letters, numbers, and underscores.');
    return;
  }

  if (password.length < 8) {
    showMessage('Password must be at least 8 characters.');
    return;
  }

  if (password !== confirm) {
    showMessage('Passwords do not match.');
    return;
  }

  setLoading(btn, true, 'Complete Account');

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/complete-google-registration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: pendingGoogleEmail,
        username,
        password,
        idToken: pendingGoogleIdToken
      })
    });

    const data = await parseJsonResponse(response);

    if (response.ok) {
      setToken(data.token);
      showMessage('Account created successfully. Redirecting...', 'success');
      setTimeout(redirectToDashboard, 800);
      return;
    }

    showMessage(data.message || 'Failed to complete registration.');
  } catch (error) {
    console.error('Complete registration error:', error);
    showMessage('Cannot connect to server. Is the backend running?');
  } finally {
    setLoading(btn, false, 'Complete Account');
  }
});

async function handleGoogleCredential(response) {
  hideMessage();
  pendingGoogleIdToken = response.credential;

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: response.credential })
    });

    const data = await parseJsonResponse(res);

    if (res.ok && data.token) {
      setToken(data.token);
      showMessage('Signed in with Google. Redirecting...', 'success');
      setTimeout(redirectToDashboard, 800);
      return;
    }

    if (data.requiresPasswordSetup) {
      showGoogleFinalizeForm(data.email);
      showMessage(data.message || 'Please complete your account details.', 'success');
      return;
    }

    showMessage(data.message || 'Google sign-in failed.');
  } catch (error) {
    console.error('Google auth error:', error);
    showMessage('Google sign-in failed. Please try again.');
  }
}

function getGoogleButtonWidth(container) {
  return Math.min(container.offsetWidth, 400);
}

function renderGoogleButtons() {
  if (!googleClientId || !window.google?.accounts?.id) return;

  google.accounts.id.initialize({
    client_id: googleClientId,
    callback: handleGoogleCredential
  });

  const loginContainer = document.getElementById('google-btn-login');
  const registerContainer = document.getElementById('google-btn-register');
  const buttonWidth = getGoogleButtonWidth(loginContainer);

  const buttonOptions = {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    width: buttonWidth,
    shape: 'rectangular'
  };

  google.accounts.id.renderButton(loginContainer, { ...buttonOptions, text: 'signin_with' });
  google.accounts.id.renderButton(registerContainer, { ...buttonOptions, text: 'signup_with' });
}

async function initGoogleSignIn() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/config`, {
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await parseJsonResponse(response);
    googleClientId = data.googleClientId || '';

    if (!googleClientId) {
      document.getElementById('google-btn-login').innerHTML =
        '<p class="panel-heading">Google sign-in is not configured on the server.</p>';
      document.getElementById('google-btn-register').innerHTML =
        '<p class="panel-heading">Google sign-up is not configured on the server.</p>';
      return;
    }

    const init = () => renderGoogleButtons();

    if (window.google?.accounts?.id) {
      init();
    } else {
      window.addEventListener('load', init);
    }

    window.addEventListener('resize', () => {
      document.getElementById('google-btn-login').innerHTML = '';
      document.getElementById('google-btn-register').innerHTML = '';
      renderGoogleButtons();
    });
  } catch (error) {
    console.error('Failed to init Google Sign-In:', error);
    showMessage('Unable to load Google sign-in. Check that the server is running.');
  }
}

initGoogleSignIn();
