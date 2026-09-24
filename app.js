// ==========================================================
//  BITLAB News — фронтенд (чистый JS)
//  Логин, регистрация, лента, создание новости, авто-refresh.
// ==========================================================

const API_BASE = "http://localhost:8080";

// Токены и пользователь — ТОЛЬКО в памяти (не в localStorage).
let accessToken = null;
let refreshToken = null;
let currentUser = null; // { email, role }

// ----------------------------------------------------------
//  Вспомогательные функции
// ----------------------------------------------------------

// Показать один экран, спрятать остальные
function showView(id) {
  document.querySelectorAll(".view").forEach(el => el.classList.add("hidden"));
  const view = document.getElementById(id);
  if (view) view.classList.remove("hidden");
}

// Разобрать JWT и достать роль (читаем payload токена)
function parseJwt(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
    );
    return JSON.parse(json);
  } catch (e) {
    return {};
  }
}

// Универсальный запрос к API: добавляет токен и при 401 пробует обновить его
async function apiFetch(path, options = {}, isRetry = false) {
  options.headers = options.headers || {};
  if (accessToken) options.headers["Authorization"] = "Bearer " + accessToken;

  const res = await fetch(API_BASE + path, options);

  // Если токен протух (401) — пробуем обновить и повторить один раз
  if (res.status === 401 && accessToken && !isRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return apiFetch(path, options, true);
    } else {
      forceLogout();
    }
  }
  return res;
}

// Обновление accessToken по refreshToken
async function tryRefresh() {
  if (!refreshToken) return false;
  try {
    const res = await fetch(API_BASE + "/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });
    if (!res.ok) return false;
    const data = await res.json();
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
    return true;
  } catch (e) {
    return false;
  }
}

// Выкидываем на экран входа (токен недействителен)
function forceLogout() {
  accessToken = null;
  refreshToken = null;
  currentUser = null;
  document.getElementById("navbar").classList.add("hidden");
  showView("view-login");
}

// ----------------------------------------------------------
//  Вход в приложение после успешного логина
// ----------------------------------------------------------
function enterApp() {
  const navbar = document.getElementById("navbar");
  navbar.classList.remove("hidden");

  document.getElementById("user-info").textContent =
    currentUser.email + " · " + currentUser.role;

  // Кнопка "Создать новость" — только для ADMIN
  const createBtn = document.getElementById("nav-create");
  if (currentUser.role === "ADMIN") {
    createBtn.classList.remove("hidden");
  } else {
    createBtn.classList.add("hidden");
  }

  loadNews();
  showView("view-news");
}

// ----------------------------------------------------------
//  ЛОГИН
// ----------------------------------------------------------
async function login() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";

  try {
    const res = await fetch(API_BASE + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
      errorEl.textContent = res.status === 401
        ? "Неверный email или пароль"
        : "Ошибка входа (код " + res.status + ")";
      return;
    }

    const data = await res.json();
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
    const payload = parseJwt(accessToken);
    currentUser = { email: payload.sub || email, role: payload.role || "STUDENT" };

    // очистим поля
    document.getElementById("login-password").value = "";
    enterApp();
  } catch (e) {
    errorEl.textContent = "Не удалось связаться с сервером. Бэкенд запущен?";
  }
}

// ----------------------------------------------------------
//  РЕГИСТРАЦИЯ
// ----------------------------------------------------------
async function register() {
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const errorEl = document.getElementById("reg-error");
  const successEl = document.getElementById("reg-success");
  errorEl.textContent = "";
  successEl.textContent = "";

  try {
    const res = await fetch(API_BASE + "/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    if (res.status === 201) {
      successEl.textContent = "Готово! Теперь войдите.";
      document.getElementById("reg-email").value = "";
      document.getElementById("reg-password").value = "";
      return;
    }
    if (res.status === 409) {
      errorEl.textContent = "Этот email уже зарегистрирован";
      return;
    }
    if (res.status === 400) {
      errorEl.textContent = "Проверьте поля: email корректный, пароль не короче 8 символов";
      return;
    }
    errorEl.textContent = "Ошибка регистрации (код " + res.status + ")";
  } catch (e) {
    errorEl.textContent = "Не удалось связаться с сервером. Бэкенд запущен?";
  }
}

// ----------------------------------------------------------
//  ЛЕНТА НОВОСТЕЙ
// ----------------------------------------------------------
async function loadNews() {
  const listEl = document.getElementById("news-list");
  const errorEl = document.getElementById("news-error");
  listEl.innerHTML = "";
  errorEl.textContent = "";

  try {
    const res = await apiFetch("/api/news");
    if (!res.ok) {
      errorEl.textContent = "Не удалось загрузить новости (код " + res.status + ")";
      return;
    }
    const news = await res.json();

    if (!Array.isArray(news) || news.length === 0) {
      listEl.textContent = "Пока новостей нет.";
      return;
    }

    news.forEach(item => {
      const card = document.createElement("div");
      card.className = "news-item";

      const title = document.createElement("h3");
      title.textContent = item.title || "(без заголовка)"; // textContent = защита от XSS
      card.appendChild(title);

      const meta = document.createElement("div");
      meta.className = "meta";
      const author = item.author ? item.author : "—";
      const date = item.publishedDate ? item.publishedDate : "";
      meta.textContent = "Автор: " + author + (date ? " · " + date : "");
      card.appendChild(meta);

      card.addEventListener("click", () => openNews(item.id));
      listEl.appendChild(card);
    });
  } catch (e) {
    errorEl.textContent = "Не удалось связаться с сервером.";
  }
}

// ----------------------------------------------------------
//  ОДНА НОВОСТЬ (GET /api/news/{id})
// ----------------------------------------------------------
async function openNews(id) {
  try {
    const res = await apiFetch("/api/news/" + id);
    if (!res.ok) {
      alert("Не удалось открыть новость (код " + res.status + ")");
      return;
    }
    const item = await res.json();

    document.getElementById("detail-title").textContent = item.title || "";
    const author = item.author ? item.author : "—";
    const date = item.publishedDate ? item.publishedDate : "";
    document.getElementById("detail-meta").textContent =
      "Автор: " + author + (date ? " · " + date : "");
    document.getElementById("detail-content").textContent = item.content || "";

    showView("view-news-detail");
  } catch (e) {
    alert("Не удалось связаться с сервером.");
  }
}

// ----------------------------------------------------------
//  СОЗДАНИЕ НОВОСТИ (только ADMIN)
// ----------------------------------------------------------
async function createNews() {
  const title = document.getElementById("create-title").value.trim();
  const content = document.getElementById("create-content").value.trim();
  const author = document.getElementById("create-author").value.trim();
  const errorEl = document.getElementById("create-error");
  errorEl.textContent = "";

  const today = new Date().toISOString().slice(0, 10); // ГГГГ-ММ-ДД

  try {
    const res = await apiFetch("/api/news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, author, publishedDate: today })
    });

    if (res.status === 201) {
      document.getElementById("create-title").value = "";
      document.getElementById("create-content").value = "";
      document.getElementById("create-author").value = "";
      await loadNews();
      showView("view-news");
      return;
    }
    if (res.status === 403) {
      errorEl.textContent = "Недостаточно прав (нужна роль ADMIN)";
      return;
    }
    if (res.status === 400) {
      errorEl.textContent = "Заполните все поля";
      return;
    }
    errorEl.textContent = "Ошибка создания (код " + res.status + ")";
  } catch (e) {
    errorEl.textContent = "Не удалось связаться с сервером.";
  }
}

// ----------------------------------------------------------
//  ВЫХОД
// ----------------------------------------------------------
async function logout() {
  try {
    if (refreshToken) {
      await fetch(API_BASE + "/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken })
      });
    }
  } catch (e) { /* игнорируем */ }
  forceLogout();
}

// ----------------------------------------------------------
//  Привязка кнопок
// ----------------------------------------------------------
document.getElementById("go-register").addEventListener("click", () => showView("view-register"));
document.getElementById("go-login").addEventListener("click", () => showView("view-login"));

document.getElementById("btn-login").addEventListener("click", login);
document.getElementById("btn-register").addEventListener("click", register);
document.getElementById("btn-create").addEventListener("click", createNews);

document.getElementById("nav-news").addEventListener("click", () => { loadNews(); showView("view-news"); });
document.getElementById("nav-create").addEventListener("click", () => showView("view-create"));
document.getElementById("back-to-news").addEventListener("click", () => showView("view-news"));
document.getElementById("nav-logout").addEventListener("click", logout);

// Старт: экран входа
showView("view-login");
