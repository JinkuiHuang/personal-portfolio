const config = window.PORTFOLIO_SUPABASE || {};
const warning = document.querySelector("[data-setup-warning]");
const loginForm = document.querySelector("[data-login-form]");
const loginStatus = document.querySelector("[data-login-status]");
const editor = document.querySelector("[data-editor]");
const editorStatus = document.querySelector("[data-editor-status]");
const jsonEditor = document.querySelector("[data-json-editor]");
const signOutButton = document.querySelector("[data-sign-out]");
const saveButton = document.querySelector("[data-save-profile]");
const formatButton = document.querySelector("[data-format-json]");
const loadDefaultButton = document.querySelector("[data-load-default]");
const signUpButton = document.querySelector("[data-sign-up]");

const profileId = config.profileId || "main";
let supabase = null;
let localDefault = null;

function hasConfig() {
  return Boolean(config.url && config.anonKey);
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

async function loadLocalDefault() {
  localDefault = await fetch("../data/profile.json").then((response) => response.json());
  return localDefault;
}

function showEditor() {
  loginForm.hidden = true;
  editor.hidden = false;
  signOutButton.hidden = false;
}

function showLogin() {
  loginForm.hidden = false;
  editor.hidden = true;
  signOutButton.hidden = true;
}

async function loadProfile() {
  const fallback = localDefault || (await loadLocalDefault());
  const { data, error } = await supabase
    .from("portfolio_profiles")
    .select("content")
    .eq("id", profileId)
    .maybeSingle();

  if (error) throw error;
  jsonEditor.value = JSON.stringify(data?.content || fallback, null, 2);
}

async function saveProfile() {
  let parsed;
  try {
    parsed = JSON.parse(jsonEditor.value);
  } catch (error) {
    setStatus(editorStatus, `JSON 格式错误：${error.message}`, true);
    return;
  }

  const { error } = await supabase.from("portfolio_profiles").upsert({
    id: profileId,
    content: parsed,
  });

  if (error) {
    setStatus(editorStatus, `保存失败：${error.message}`, true);
    return;
  }

  jsonEditor.value = JSON.stringify(parsed, null, 2);
  setStatus(editorStatus, "已保存到 Supabase。公开页面刷新后会读取最新资料。");
}

async function init() {
  await loadLocalDefault();

  if (!hasConfig()) {
    warning.hidden = false;
    loginForm.hidden = true;
    editor.hidden = false;
    jsonEditor.value = JSON.stringify(localDefault, null, 2);
    setStatus(editorStatus, "当前仅可预览编辑 JSON；配置 Supabase 后才能在线保存。");
    return;
  }

  const module = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  supabase = module.createClient(config.url, config.anonKey);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    showEditor();
    await loadProfile();
    return;
  }

  showLogin();
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(loginStatus, "Signing in...");

  const formData = new FormData(loginForm);
  const email = formData.get("email");
  const password = formData.get("password");
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    setStatus(loginStatus, `登录失败：${error.message}`, true);
    return;
  }

  setStatus(loginStatus, "");
  showEditor();
  await loadProfile();
});

signUpButton?.addEventListener("click", async () => {
  setStatus(loginStatus, "Creating account...");

  const formData = new FormData(loginForm);
  const email = formData.get("email");
  const password = formData.get("password");

  if (!email || !password) {
    setStatus(loginStatus, "请输入邮箱和密码后再创建账号。", true);
    return;
  }

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    setStatus(loginStatus, `创建失败：${error.message}`, true);
    return;
  }

  if (data.session) {
    setStatus(loginStatus, "");
    showEditor();
    await loadProfile();
    return;
  }

  setStatus(loginStatus, "账号已创建。请到邮箱中点击 Supabase 确认链接，然后回来登录。");
});

signOutButton?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  showLogin();
});

saveButton?.addEventListener("click", saveProfile);

formatButton?.addEventListener("click", () => {
  try {
    jsonEditor.value = JSON.stringify(JSON.parse(jsonEditor.value), null, 2);
    setStatus(editorStatus, "JSON 已格式化。");
  } catch (error) {
    setStatus(editorStatus, `JSON 格式错误：${error.message}`, true);
  }
});

loadDefaultButton?.addEventListener("click", async () => {
  const fallback = localDefault || (await loadLocalDefault());
  jsonEditor.value = JSON.stringify(fallback, null, 2);
  setStatus(editorStatus, "已载入本地默认资料，保存后会覆盖数据库当前内容。");
});

init().catch((error) => {
  setStatus(loginStatus, `初始化失败：${error.message}`, true);
  setStatus(editorStatus, `初始化失败：${error.message}`, true);
});
