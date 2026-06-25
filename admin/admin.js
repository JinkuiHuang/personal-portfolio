const config = window.PORTFOLIO_SUPABASE || {};
const warning = document.querySelector("[data-setup-warning]");
const loginForm = document.querySelector("[data-login-form]");
const loginStatus = document.querySelector("[data-login-status]");
const editor = document.querySelector("[data-editor]");
const editorMount = document.querySelector("[data-editor-mount]");
const editorStatus = document.querySelector("[data-editor-status]");
const signOutButton = document.querySelector("[data-sign-out]");
const signUpButton = document.querySelector("[data-sign-up]");
const resendConfirmationButton = document.querySelector("[data-resend-confirmation]");

const profileId = config.profileId || "main";
let supabase = null;
let localDefault = null;
let currentProfile = null;

function hasConfig() {
  return Boolean(config.url && config.anonKey);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function getValue(path, source = currentProfile) {
  return path.split(".").reduce((value, key) => value?.[key], source) ?? "";
}

function setValue(path, value, target = currentProfile) {
  const keys = path.split(".");
  const last = keys.pop();
  const parent = keys.reduce((object, key) => {
    object[key] = object[key] || {};
    return object[key];
  }, target);
  parent[last] = value;
}

function field(label, path, options = {}) {
  const id = `field-${path.replaceAll(".", "-")}`;
  const value = getValue(path);
  const hint = options.hint ? `<small>${escapeHtml(options.hint)}</small>` : "";

  if (options.textarea) {
    return `
      <label class="admin-field" for="${id}">
        <span>${escapeHtml(label)}</span>
        <textarea id="${id}" data-path="${escapeHtml(path)}" rows="${options.rows || 3}">${escapeHtml(value)}</textarea>
        ${hint}
      </label>
    `;
  }

  return `
    <label class="admin-field" for="${id}">
      <span>${escapeHtml(label)}</span>
      <input id="${id}" data-path="${escapeHtml(path)}" type="${options.type || "text"}" value="${escapeHtml(value)}" />
      ${hint}
    </label>
  `;
}

function section(title, body) {
  return `
    <section class="admin-card">
      <div class="admin-card-heading">
        <h3>${escapeHtml(title)}</h3>
      </div>
      ${body}
    </section>
  `;
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

function renderDetails() {
  return section(
    "个人资料",
    `
      ${field("区块标题", "details.heading")}
      <div class="admin-list" data-list="details">
        ${(currentProfile.details?.items || [])
          .map(
            (item, index) => `
              <div class="admin-list-item" data-detail-row>
                <label>
                  <span>字段名</span>
                  <input data-detail-label value="${escapeHtml(item.label)}" />
                </label>
                <label>
                  <span>内容</span>
                  <textarea data-detail-value rows="2">${escapeHtml(item.value)}</textarea>
                </label>
                <button class="icon-button danger" type="button" data-remove="details" data-index="${index}" aria-label="删除">×</button>
              </div>
            `,
          )
          .join("")}
      </div>
      <button class="button secondary" type="button" data-add="details">Add detail</button>
    `,
  );
}

function renderSkills() {
  return section(
    "技能",
    `
      ${field("区块标题", "skills.heading")}
      <div class="admin-list">
        ${(currentProfile.skills?.groups || [])
          .map(
            (group, groupIndex) => `
              <div class="admin-nested-card" data-skill-group>
                <div class="admin-inline-grid">
                  <label>
                    <span>图标</span>
                    <input data-skill-icon value="${escapeHtml(group.icon)}" />
                  </label>
                  <label>
                    <span>分类名称</span>
                    <input data-skill-title value="${escapeHtml(group.title)}" />
                  </label>
                  <button class="icon-button danger" type="button" data-remove="skillGroup" data-index="${groupIndex}" aria-label="删除">×</button>
                </div>
                ${(group.items || [])
                  .map(
                    (item, itemIndex) => `
                      <div class="admin-inline-grid skill-row" data-skill-item>
                        <label>
                          <span>技能名</span>
                          <input data-skill-label value="${escapeHtml(item.label)}" />
                        </label>
                        <label>
                          <span>熟练度 0-100</span>
                          <input data-skill-level type="number" min="0" max="100" value="${escapeHtml(item.level)}" />
                        </label>
                        <button class="icon-button danger" type="button" data-remove="skillItem" data-group-index="${groupIndex}" data-index="${itemIndex}" aria-label="删除">×</button>
                      </div>
                    `,
                  )
                  .join("")}
                <button class="button secondary compact" type="button" data-add="skillItem" data-group-index="${groupIndex}">Add skill</button>
              </div>
            `,
          )
          .join("")}
      </div>
      <button class="button secondary" type="button" data-add="skillGroup">Add skill group</button>
    `,
  );
}

function renderExperience() {
  return section(
    "经历",
    `
      ${field("区块标题", "experience.heading")}
      <div class="admin-list">
        ${(currentProfile.experience?.items || [])
          .map(
            (item, index) => `
              <div class="admin-list-item experience-row" data-experience-row>
                <label>
                  <span>时间</span>
                  <input data-experience-period value="${escapeHtml(item.period)}" />
                </label>
                <label>
                  <span>职位</span>
                  <input data-experience-role value="${escapeHtml(item.role)}" />
                </label>
                <label>
                  <span>公司/地点</span>
                  <input data-experience-company value="${escapeHtml(item.company)}" />
                </label>
                <label>
                  <span>描述</span>
                  <textarea data-experience-description rows="3">${escapeHtml(item.description)}</textarea>
                </label>
                <button class="icon-button danger" type="button" data-remove="experience" data-index="${index}" aria-label="删除">×</button>
              </div>
            `,
          )
          .join("")}
      </div>
      <button class="button secondary" type="button" data-add="experience">Add experience</button>
    `,
  );
}

function renderProjects() {
  return section(
    "项目作品",
    `
      ${field("区块标题", "projects.heading")}
      <div class="admin-list">
        ${(currentProfile.projects?.items || [])
          .map(
            (project, index) => `
              <div class="admin-list-item project-row" data-project-row>
                <label>
                  <span>项目名称</span>
                  <input data-project-title value="${escapeHtml(project.title)}" />
                </label>
                <label>
                  <span>项目描述</span>
                  <textarea data-project-description rows="3">${escapeHtml(project.description)}</textarea>
                </label>
                <label>
                  <span>图片路径</span>
                  <input data-project-image value="${escapeHtml(project.image)}" />
                </label>
                <label>
                  <span>图片说明</span>
                  <input data-project-alt value="${escapeHtml(project.imageAlt)}" />
                </label>
                <label>
                  <span>案例链接</span>
                  <input data-project-case value="${escapeHtml(project.caseStudyUrl)}" />
                </label>
                <label>
                  <span>演示链接</span>
                  <input data-project-demo value="${escapeHtml(project.demoUrl)}" />
                </label>
                <button class="icon-button danger" type="button" data-remove="project" data-index="${index}" aria-label="删除">×</button>
              </div>
            `,
          )
          .join("")}
      </div>
      <button class="button secondary" type="button" data-add="project">Add project</button>
    `,
  );
}

function renderContactLinks() {
  return section(
    "联系与社交链接",
    `
      ${field("联系区标题", "contact.heading")}
      ${field("联系区说明", "contact.body", { textarea: true, rows: 3 })}
      ${field("按钮文字", "contact.buttonLabel")}
      ${field("右侧标题", "contact.connectHeading")}
      <div class="admin-list">
        ${(currentProfile.contact?.links || [])
          .map(
            (link, index) => `
              <div class="admin-list-item link-row" data-link-row>
                <label>
                  <span>显示文字</span>
                  <input data-link-label value="${escapeHtml(link.label)}" />
                </label>
                <label>
                  <span>链接</span>
                  <input data-link-url value="${escapeHtml(link.url)}" />
                </label>
                <button class="icon-button danger" type="button" data-remove="link" data-index="${index}" aria-label="删除">×</button>
              </div>
            `,
          )
          .join("")}
      </div>
      <button class="button secondary" type="button" data-add="link">Add link</button>
    `,
  );
}

function renderForm() {
  editorMount.innerHTML = `
    <div class="editor-toolbar">
      <div>
        <h2>Profile Editor</h2>
        <p>直接修改表单内容，然后保存。刷新公开页面后会看到最新资料。</p>
      </div>
      <div class="editor-actions">
        <button class="button secondary" type="button" data-load-default>Load local default</button>
        <button class="button secondary" type="button" data-toggle-json>Advanced JSON</button>
        <button class="button primary" type="button" data-save-profile>Save to database</button>
      </div>
    </div>

    <form class="profile-form" data-profile-form>
      ${section(
        "首页与基础信息",
        `
          <div class="admin-form-grid">
            ${field("浏览器标题", "site.title")}
            ${field("页脚文字", "site.footer")}
            ${field("品牌左半部分", "hero.brandFirst")}
            ${field("品牌强调部分", "hero.brandAccent")}
            ${field("首页姓名", "hero.name")}
            ${field("作品集标题", "hero.portfolioTitle")}
            ${field("一句话定位", "hero.headline")}
            ${field("头像路径", "hero.image")}
            ${field("简历下载链接", "hero.resumeUrl")}
          </div>
          ${field("个人简介", "hero.summary", { textarea: true, rows: 4 })}
          <div class="admin-form-grid">
            ${field("城市/位置", "hero.facts.0.text")}
            ${field("邮箱", "hero.facts.1.text")}
            ${field("个人网站", "hero.facts.2.text")}
          </div>
        `,
      )}
      ${renderDetails()}
      ${renderSkills()}
      ${renderExperience()}
      ${renderProjects()}
      ${renderContactLinks()}
    </form>

    <details class="json-details">
      <summary>Advanced JSON</summary>
      <textarea class="json-editor" data-json-editor spellcheck="false">${escapeHtml(
        JSON.stringify(currentProfile, null, 2),
      )}</textarea>
      <button class="button secondary" type="button" data-apply-json>Apply JSON to form</button>
    </details>
  `;
}

function collectProfileFromForm() {
  const next = clone(currentProfile);

  editorMount.querySelectorAll("[data-path]").forEach((input) => {
    setValue(input.dataset.path, input.value, next);
  });

  next.details.items = [...editorMount.querySelectorAll("[data-detail-row]")].map((row) => ({
    label: row.querySelector("[data-detail-label]").value,
    value: row.querySelector("[data-detail-value]").value,
  }));

  next.skills.groups = [...editorMount.querySelectorAll("[data-skill-group]")].map((group) => ({
    icon: group.querySelector("[data-skill-icon]").value,
    title: group.querySelector("[data-skill-title]").value,
    items: [...group.querySelectorAll("[data-skill-item]")].map((item) => ({
      label: item.querySelector("[data-skill-label]").value,
      level: Math.max(0, Math.min(100, Number(item.querySelector("[data-skill-level]").value) || 0)),
    })),
  }));

  next.experience.items = [...editorMount.querySelectorAll("[data-experience-row]")].map((row) => ({
    period: row.querySelector("[data-experience-period]").value,
    role: row.querySelector("[data-experience-role]").value,
    company: row.querySelector("[data-experience-company]").value,
    description: row.querySelector("[data-experience-description]").value,
  }));

  next.projects.items = [...editorMount.querySelectorAll("[data-project-row]")].map((row) => ({
    title: row.querySelector("[data-project-title]").value,
    description: row.querySelector("[data-project-description]").value,
    image: row.querySelector("[data-project-image]").value,
    imageAlt: row.querySelector("[data-project-alt]").value,
    caseStudyUrl: row.querySelector("[data-project-case]").value,
    demoUrl: row.querySelector("[data-project-demo]").value,
  }));

  next.contact.links = [...editorMount.querySelectorAll("[data-link-row]")].map((row) => ({
    label: row.querySelector("[data-link-label]").value,
    url: row.querySelector("[data-link-url]").value,
  }));

  return next;
}

async function loadProfile() {
  const fallback = localDefault || (await loadLocalDefault());
  const { data, error } = await supabase
    .from("portfolio_profiles")
    .select("content")
    .eq("id", profileId)
    .maybeSingle();

  if (error) throw error;
  currentProfile = clone(data?.content || fallback);
  renderForm();
}

async function saveProfile() {
  currentProfile = collectProfileFromForm();

  const { error } = await supabase.from("portfolio_profiles").upsert({
    id: profileId,
    content: currentProfile,
  });

  if (error) {
    setStatus(editorStatus, `保存失败：${error.message}`, true);
    return;
  }

  renderForm();
  setStatus(editorStatus, "已保存。公开页面刷新后会读取最新资料。");
}

function addItem(type, groupIndex) {
  currentProfile = collectProfileFromForm();

  if (type === "details") {
    currentProfile.details.items.push({ label: "New field", value: "" });
  }
  if (type === "skillGroup") {
    currentProfile.skills.groups.push({ icon: "•", title: "New group", items: [] });
  }
  if (type === "skillItem") {
    currentProfile.skills.groups[groupIndex].items.push({ label: "New skill", level: 50 });
  }
  if (type === "experience") {
    currentProfile.experience.items.push({ period: "", role: "", company: "", description: "" });
  }
  if (type === "project") {
    currentProfile.projects.items.push({
      title: "New project",
      description: "",
      image: "./assets/project-fintech.png",
      imageAlt: "",
      caseStudyUrl: "#",
      demoUrl: "#",
    });
  }
  if (type === "link") {
    currentProfile.contact.links.push({ label: "New link", url: "#" });
  }

  renderForm();
}

function removeItem(type, index, groupIndex) {
  currentProfile = collectProfileFromForm();

  if (type === "details") currentProfile.details.items.splice(index, 1);
  if (type === "skillGroup") currentProfile.skills.groups.splice(index, 1);
  if (type === "skillItem") currentProfile.skills.groups[groupIndex].items.splice(index, 1);
  if (type === "experience") currentProfile.experience.items.splice(index, 1);
  if (type === "project") currentProfile.projects.items.splice(index, 1);
  if (type === "link") currentProfile.contact.links.splice(index, 1);

  renderForm();
}

async function init() {
  await loadLocalDefault();

  if (!hasConfig()) {
    warning.hidden = false;
    loginForm.hidden = true;
    editor.hidden = false;
    currentProfile = clone(localDefault);
    renderForm();
    setStatus(editorStatus, "当前仅可预览编辑；配置 Supabase 后才能在线保存。");
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

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: new URL("./", window.location.href).toString(),
    },
  });

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

resendConfirmationButton?.addEventListener("click", async () => {
  const formData = new FormData(loginForm);
  const email = formData.get("email");

  if (!email) {
    setStatus(loginStatus, "请输入邮箱后再重发确认邮件。", true);
    return;
  }

  setStatus(loginStatus, "Sending confirmation email...");

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: new URL("./", window.location.href).toString(),
    },
  });

  if (error) {
    setStatus(loginStatus, `重发失败：${error.message}`, true);
    return;
  }

  setStatus(loginStatus, "确认邮件已重新发送。请到邮箱点击最新的确认链接。");
});

signOutButton?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  showLogin();
});

editor?.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.matches("[data-save-profile]")) {
    await saveProfile();
  }

  if (button.matches("[data-load-default]")) {
    currentProfile = clone(localDefault || (await loadLocalDefault()));
    renderForm();
    setStatus(editorStatus, "已载入本地默认资料，保存后会覆盖数据库当前内容。");
  }

  if (button.matches("[data-toggle-json]")) {
    const details = editorMount.querySelector(".json-details");
    if (details) details.open = !details.open;
  }

  if (button.matches("[data-apply-json]")) {
    try {
      currentProfile = JSON.parse(editorMount.querySelector("[data-json-editor]").value);
      renderForm();
      setStatus(editorStatus, "JSON 已应用到表单，点击保存后才会写入数据库。");
    } catch (error) {
      setStatus(editorStatus, `JSON 格式错误：${error.message}`, true);
    }
  }

  if (button.dataset.add) {
    addItem(button.dataset.add, Number(button.dataset.groupIndex));
  }

  if (button.dataset.remove) {
    removeItem(button.dataset.remove, Number(button.dataset.index), Number(button.dataset.groupIndex));
  }
});

init().catch((error) => {
  setStatus(loginStatus, `初始化失败：${error.message}`, true);
  setStatus(editorStatus, `初始化失败：${error.message}`, true);
});
