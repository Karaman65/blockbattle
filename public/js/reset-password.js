const params = new URLSearchParams(window.location.search);
const mode = params.get('mode');
const oobCode = params.get('oobCode');
const form = document.getElementById('reset-form');
const submitBtn = document.getElementById('submit-btn');
const message = document.getElementById('message');
const loginLink = document.getElementById('login-link');
const intro = document.getElementById('intro');

function showMessage(text, type) {
  message.textContent = text;
  message.className = `message show ${type}`;
}

function disableForm() {
  form.classList.add('hidden');
}

if (mode !== 'resetPassword' || !oobCode) {
  disableForm();
  intro.textContent = 'Bu şifre yenileme bağlantısı geçerli görünmüyor.';
  showMessage('Mailindeki son şifre sıfırlama bağlantısını tekrar açmayı dene.', 'error');
  loginLink.classList.remove('hidden');
} else {
  auth.verifyPasswordResetCode(oobCode).catch(() => {
    disableForm();
    intro.textContent = 'Bu bağlantı artık kullanılamıyor.';
    showMessage('Bağlantının süresi dolmuş veya daha önce kullanılmış olabilir. Giriş ekranından yeni şifre sıfırlama maili iste.', 'error');
    loginLink.classList.remove('hidden');
  });
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const password = document.getElementById('password').value;
  const confirmation = document.getElementById('password-confirm').value;
  if (password.length < 6) {
    showMessage('Şifre en az 6 karakter olmalı.', 'error');
    return;
  }
  if (password !== confirmation) {
    showMessage('Şifreler aynı değil.', 'error');
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = 'Güncelleniyor...';
  try {
    await auth.confirmPasswordReset(oobCode, password);
    disableForm();
    intro.textContent = 'Şifren başarıyla güncellendi.';
    showMessage('Artık yeni şifrenle Block Battle hesabına giriş yapabilirsin.', 'success');
    loginLink.classList.remove('hidden');
  } catch (err) {
    showMessage('Şifre güncellenemedi. Bağlantı süresi dolmuş olabilir.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Şifreyi Güncelle';
  }
});
