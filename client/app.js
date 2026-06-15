const API_BASE_URL = 'https://pricewatch-2wsu.onrender.com';
const TOKEN_KEY = 'pricewatch_token';

const trackForm = document.getElementById('track-form');
const formMessage = document.getElementById('form-message');
const productsGrid = document.getElementById('products-grid');
const logoutBtn = document.getElementById('logout-btn');
const navLinks = document.querySelectorAll('.nav-link');
const views = document.querySelectorAll('.view');

let currentUser = null;

const AVATAR_SVGS = {
  male: '<svg viewBox="0 0 80 80" class="avatar-svg" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="32" r="14" fill="#00684A"/><path d="M16 68c4-14 14-20 24-20s20 6 24 20" fill="#00684A"/></svg>',
  female: '<svg viewBox="0 0 80 80" class="avatar-svg" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="30" r="13" fill="#00684A"/><path d="M18 64c6-12 14-16 22-16s16 4 22 16" fill="#00684A"/><path d="M28 38c2-4 6-6 12-6s10 2 12 6" fill="none" stroke="#00684A" stroke-width="2"/></svg>',
  student: '<svg viewBox="0 0 80 80" class="avatar-svg" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="34" r="12" fill="#00684A"/><path d="M18 66c4-12 14-18 22-18s18 6 22 18" fill="#00684A"/><rect x="24" y="20" width="32" height="7" rx="2" fill="#001E2B"/><path d="M40 12L50 20H30z" fill="#001E2B"/></svg>'
};

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`
  };
}

function redirectToLogin() {
  window.location.href = 'login.html';
}

function handleUnauthorized() {
  localStorage.removeItem(TOKEN_KEY);
  redirectToLogin();
}

function showView(viewId) {
  views.forEach((view) => {
    view.classList.toggle('active', view.id === `view-${viewId}`);
  });

  navLinks.forEach((link) => {
    link.classList.toggle('active', link.dataset.view === viewId);
  });
}

function setMessage(text, type = '') {
  formMessage.textContent = text;
  formMessage.className = `message ${type}`;
}

function renderAvatar(avatarKey) {
  return AVATAR_SVGS[avatarKey] || AVATAR_SVGS.male;
}

function updateProfileUI() {
  if (!currentUser) return;

  const displayName = currentUser.username || currentUser.email.split('@')[0];
  document.getElementById('dashboard-username').textContent = displayName;
  document.getElementById('profile-username').textContent = currentUser.username || '—';
  document.getElementById('profile-email').textContent = currentUser.email;
  const avatarCircle = document.getElementById('profile-avatar-display')?.querySelector('.profile-avatar-circle');
  if (avatarCircle) {
    avatarCircle.innerHTML = renderAvatar(currentUser.avatar);
  }

  document.querySelectorAll('.avatar-option').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.avatar === currentUser.avatar);
  });
}

async function loadUserProfile() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: authHeaders()
    });

    if (response.status === 401) {
      handleUnauthorized();
      return;
    }

    const data = await response.json();

    if (response.ok) {
      currentUser = data.user;
      updateProfileUI();
    }
  } catch (error) {
    console.error('Error loading profile:', error);
  }
}

async function updateAvatar(avatar) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ avatar })
    });

    if (response.status === 401) {
      handleUnauthorized();
      return;
    }

    const data = await response.json();

    if (response.ok) {
      currentUser = data.user;
      updateProfileUI();
    }
  } catch (error) {
    console.error('Error updating avatar:', error);
  }
}

navLinks.forEach((link) => {
  link.addEventListener('click', () => showView(link.dataset.view));
});

document.querySelectorAll('.nav-jump').forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

document.getElementById('btn-create-tracker').addEventListener('click', () => {
  showView('tracker-form');
});

document.getElementById('btn-existing-trackers').addEventListener('click', () => {
  showView('wallet');
});

document.querySelectorAll('.avatar-option').forEach((btn) => {
  btn.addEventListener('click', () => updateAvatar(btn.dataset.avatar));
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  redirectToLogin();
});

const deleteAccountBtn = document.getElementById('delete-account-btn');
const deleteModal = document.getElementById('delete-modal');
const deleteModalOverlay = document.getElementById('delete-modal-overlay');
const deleteModalCancel = document.getElementById('delete-modal-cancel');
const deleteModalConfirm = document.getElementById('delete-modal-confirm');

function openDeleteModal() {
  deleteModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeDeleteModal() {
  deleteModal.classList.add('hidden');
  document.body.style.overflow = '';
}

async function deleteAccount() {
  const confirmBtn = deleteModalConfirm;
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Deleting...';

  try {
    const response = await fetch(`${API_BASE_URL}/api/users/me`, {
      method: 'DELETE',
      headers: authHeaders()
    });

    if (response.status === 401) {
      handleUnauthorized();
      return;
    }

    const data = await response.json();

    if (response.ok) {
      localStorage.clear();
      window.location.href = 'login.html';
      return;
    }

    alert(data.message || 'Failed to delete account.');
  } catch (error) {
    console.error('Delete account error:', error);
    alert('Cannot connect to backend server.');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Yes, Delete My Account';
    closeDeleteModal();
  }
}

deleteAccountBtn.addEventListener('click', openDeleteModal);
deleteModalCancel.addEventListener('click', closeDeleteModal);
deleteModalOverlay.addEventListener('click', closeDeleteModal);
deleteModalConfirm.addEventListener('click', deleteAccount);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !deleteModal.classList.contains('hidden')) {
    closeDeleteModal();
  }
});

if (!getToken()) {
  redirectToLogin();
}

trackForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const product_name = document.getElementById('product_name').value;
  const product_url = document.getElementById('product_url').value;
  const target_price = parseFloat(document.getElementById('target_price').value);

  setMessage('Sending request...');

  try {
    const response = await fetch(`${API_BASE_URL}/api/products`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ product_name, product_url, target_price })
    });

    if (response.status === 401) {
      handleUnauthorized();
      return;
    }

    const data = await response.json();

    if (response.ok) {
      setMessage(data.message, 'success');
      trackForm.reset();
      addProductCardToUI(data.product);
      setTimeout(() => showView('wallet'), 1200);
    } else {
      setMessage(data.message || 'Submission failed.', 'error');
    }
  } catch (error) {
    console.error('Frontend Fetch Error:', error);
    setMessage('Cannot connect to backend server.', 'error');
  }
});

function addProductCardToUI(product) {
  const emptyState = productsGrid.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const currentStatus = product.current_price != null
    ? `₹${product.current_price.toFixed(2)}`
    : 'Waiting for scraper...';

  const card = document.createElement('div');
  card.className = 'product-card';
  card.dataset.productId = product._id;
  card.innerHTML = `
    <h3>${product.product_name}</h3>
    <p>Target: <span class="price-tag">₹${product.target_price.toFixed(2)}</span></p>
    <p>Current: <span class="price-tag">${currentStatus}</span></p>
    <p class="product-meta"><a href="${product.product_url}" target="_blank" rel="noopener">View Product</a></p>
    <button type="button" class="btn-delete">Delete</button>
  `;

  productsGrid.prepend(card);
}

async function deleteProduct(productId, card) {
  const deleteBtn = card.querySelector('.btn-delete');
  deleteBtn.disabled = true;
  deleteBtn.textContent = 'Deleting...';

  try {
    const response = await fetch(`${API_BASE_URL}/api/products/${productId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });

    if (response.status === 401) {
      handleUnauthorized();
      return;
    }

    const data = await response.json();

    if (response.ok) {
      card.remove();
      if (productsGrid.children.length === 0) {
        productsGrid.innerHTML = '<p class="empty-state">No products tracked yet. Create a new tracker to get started!</p>';
      }
    } else {
      deleteBtn.disabled = false;
      deleteBtn.textContent = 'Delete';
      alert(data.message || 'Failed to delete product.');
    }
  } catch (error) {
    console.error('Error deleting product:', error);
    deleteBtn.disabled = false;
    deleteBtn.textContent = 'Delete';
    alert('Cannot connect to backend server.');
  }
}

productsGrid.addEventListener('click', (e) => {
  if (!e.target.classList.contains('btn-delete')) return;
  const card = e.target.closest('.product-card');
  const productId = card?.dataset.productId;
  if (productId) deleteProduct(productId, card);
});

async function loadProducts() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/products`, {
      headers: authHeaders()
    });

    if (response.status === 401) {
      handleUnauthorized();
      return;
    }

    const products = await response.json();

    if (response.ok) {
      productsGrid.innerHTML = '';

      if (products.length === 0) {
        productsGrid.innerHTML = '<p class="empty-state">No products tracked yet. Create a new tracker to get started!</p>';
        return;
      }

      products.forEach((product) => addProductCardToUI(product));
    }
  } catch (error) {
    console.error('Error loading products:', error);
    productsGrid.innerHTML = '<p class="empty-state" style="color:#B91C1C;">Cannot load products. Is the server running?</p>';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  loadUserProfile();
  loadProducts();
});
