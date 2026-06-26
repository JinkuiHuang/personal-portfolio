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
let contactMessages = [];
let messagesLoadError = "";
let isDirty = false;

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

function setEditorStatus(message, isError = false) {
  setStatus(editorStatus, message, isError);
  const saveState = editorMount?.querySelector("[data-save-state]");
  if (!saveState) return;

  saveState.textContent = isDirty ? "有未保存修改" : "已同步";
  saveState.classList.toggle("dirty", isDirty);
  saveState.classList.toggle("error", isError);
}

function markDirty(message = "有未保存修改，点击 Save to database 后才会发布。") {
  isDirty = true;
  setEditorStatus(message);
}

function clearDirty(message = "已保存。公开页面刷新后会读取最新资料。") {
  isDirty = false;
  setEditorStatus(message);
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

function readValue(element) {
  if (!element) return "";
  if ("value" in element) return element.value;
  return element.innerText.trim();
}

function editable(path, fallback = "", options = {}) {
  const tag = options.block ? "div" : "span";
  const value = getValue(path) || fallback;
  return `<${tag} class="visual-editable" contenteditable="true" data-path="${escapeHtml(path)}">${escapeHtml(value)}</${tag}>`;
}

function visualText(value = "", attributes = "") {
  return `<span class="visual-editable" contenteditable="true" ${attributes}>${escapeHtml(value)}</span>`;
}

function visualTextarea(value = "", attributes = "") {
  return `<div class="visual-editable multiline" contenteditable="true" ${attributes}>${escapeHtml(value)}</div>`;
}

function previewAssetUrl(url = "") {
  const value = String(url);
  if (value.startsWith("./")) return `../${value.slice(2)}`;
  if (value.startsWith("assets/")) return `../${value}`;
  return value;
}

function imageUploader(label, targetPath, currentUrl, previewSelector) {
  return `
    <div class="visual-upload">
      <span>${escapeHtml(label)}</span>
      <input type="hidden" data-path="${escapeHtml(targetPath)}" value="${escapeHtml(currentUrl || "")}" />
      <label class="upload-button">
        Choose file
        <input type="file" accept="image/*" data-image-upload data-image-target="${escapeHtml(
          targetPath,
        )}" data-preview-target="${escapeHtml(previewSelector)}" />
      </label>
      <small>${escapeHtml(currentUrl || "No image selected")}</small>
    </div>
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

function renderVisualEditor() {
  return `
    <section class="visual-editor" data-visual-editor>
      <div class="visual-note">
        <strong>可视化编辑模式</strong>
        <span>直接点击页面里的文字修改。图片使用 Choose file 选择文件上传。</span>
      </div>

      <section class="hero section visual-section">
        <div class="hero-copy">
          <h1>${editable("hero.name")}</h1>
          <p class="portfolio-title">${editable("hero.portfolioTitle")}</p>
          <span class="rule"></span>
          <h2>${editable("hero.headline")}</h2>
          <p>${editable("hero.summary", "", { block: true })}</p>
          <ul class="quick-facts" aria-label="快速联系方式">
            ${(currentProfile.hero?.facts || [])
              .map(
                (fact, index) => `
                  <li>
                    <span aria-hidden="true">${escapeHtml(fact.icon)}</span>
                    ${visualText(fact.text, `data-path="hero.facts.${index}.text"`)}
                  </li>
                `,
              )
              .join("")}
          </ul>
        </div>
        <figure class="hero-media visual-image-editor">
          <img data-image-preview="hero.image" src="${escapeHtml(previewAssetUrl(currentProfile.hero?.image))}" alt="${escapeHtml(currentProfile.hero?.imageAlt)}" />
          ${imageUploader("头像图片", "hero.image", currentProfile.hero?.image, "hero.image")}
          <label><span>图片说明</span><input data-path="hero.imageAlt" value="${escapeHtml(currentProfile.hero?.imageAlt)}" /></label>
        </figure>
      </section>

      <section class="info-grid section visual-section">
        <div class="details-block">
          <div class="section-heading"><h2>${editable("details.heading")}</h2><span class="rule small"></span></div>
          <dl class="detail-list">
            ${(currentProfile.details?.items || [])
              .map(
                (item, index) => `
                  <div data-detail-row>
                    <dt>${visualText(item.label, "data-detail-label")}</dt>
                    <dd>${visualTextarea(item.value, "data-detail-value")}</dd>
                    <button class="visual-remove" type="button" data-remove="details" data-index="${index}">删除</button>
                  </div>
                `,
              )
              .join("")}
          </dl>
          <button class="button secondary compact" type="button" data-add="details">Add detail</button>
        </div>

        <div class="skills-block">
          <div class="section-heading"><h2>${editable("skills.heading")}</h2><span class="rule small"></span></div>
          <div class="visual-skill-grid">
            ${(currentProfile.skills?.groups || [])
              .map(
                (group, groupIndex) => `
                  <article class="visual-skill-card" data-skill-group>
                    <div class="visual-skill-card-header">
                      <span class="skill-icon visual-editable" contenteditable="true" data-skill-icon>${escapeHtml(group.icon)}</span>
                      <h3>${visualText(group.title, "data-skill-title")}</h3>
                      <button class="visual-remove" type="button" data-remove="skillGroup" data-index="${groupIndex}">删除分类</button>
                    </div>
                    <div class="visual-skill-list">
                      ${(group.items || [])
                        .map(
                          (item, itemIndex) => `
                            <div class="visual-skill-item" data-skill-item>
                              ${visualText(item.label, "data-skill-label")}
                              <label class="visual-level">
                                <span>熟练度</span>
                                <input data-skill-level type="number" min="0" max="100" value="${escapeHtml(item.level)}" />
                              </label>
                              <span class="visual-skill-meter" style="--level: ${Number(item.level) || 0}%"></span>
                              <button class="visual-remove inline" type="button" data-remove="skillItem" data-group-index="${groupIndex}" data-index="${itemIndex}">删除</button>
                            </div>
                          `,
                        )
                        .join("")}
                    </div>
                    <button class="button secondary compact" type="button" data-add="skillItem" data-group-index="${groupIndex}">Add skill</button>
                  </article>
                `,
              )
              .join("")}
          </div>
          <button class="button secondary compact" type="button" data-add="skillGroup">Add skill group</button>
        </div>
      </section>

      <section class="section timeline-section visual-section">
        <div class="section-heading"><h2>${editable("experience.heading")}</h2><span class="rule small"></span></div>
        <div class="timeline">
          ${(currentProfile.experience?.items || [])
            .map(
              (item, index) => `
                <article data-experience-row>
                  <time>${visualText(item.period, "data-experience-period")}</time>
                  <div class="timeline-dot"></div>
                  <div>
                    <h3>${visualText(item.role, "data-experience-role")}</h3>
                    <p class="company">${visualText(item.company, "data-experience-company")}</p>
                    <p>${visualTextarea(item.description, "data-experience-description")}</p>
                    <button class="visual-remove" type="button" data-remove="experience" data-index="${index}">删除经历</button>
                  </div>
                </article>
              `,
            )
            .join("")}
        </div>
        <button class="button secondary compact" type="button" data-add="experience">Add experience</button>
      </section>

      <section class="section projects-section visual-section">
        <div class="section-heading"><h2>${editable("projects.heading")}</h2><span class="rule small"></span></div>
        <div class="project-grid">
          ${(currentProfile.projects?.items || [])
            .map(
              (project, index) => `
                <article class="project-card visual-project-card" data-project-row>
                  <img data-image-preview="project.${index}.image" src="${escapeHtml(previewAssetUrl(project.image))}" alt="${escapeHtml(project.imageAlt)}" />
                  <div class="visual-upload">
                    <span>项目图片</span>
                    <input type="hidden" data-project-image value="${escapeHtml(project.image || "")}" />
                    <label class="upload-button">
                      Choose file
                      <input type="file" accept="image/*" data-image-upload data-project-index="${index}" data-preview-target="project.${index}.image" />
                    </label>
                    <small>${escapeHtml(project.image || "No image selected")}</small>
                  </div>
                  <label><span>图片说明</span><input data-project-alt value="${escapeHtml(project.imageAlt)}" /></label>
                  <h3>${visualText(project.title, "data-project-title")}</h3>
                  <p>${visualTextarea(project.description, "data-project-description")}</p>
                  <label><span>案例链接</span><input data-project-case value="${escapeHtml(project.caseStudyUrl)}" /></label>
                  <label><span>演示链接</span><input data-project-demo value="${escapeHtml(project.demoUrl)}" /></label>
                  <button class="visual-remove" type="button" data-remove="project" data-index="${index}">删除项目</button>
                </article>
              `,
            )
            .join("")}
        </div>
        <button class="button secondary compact" type="button" data-add="project">Add project</button>
      </section>

      <section class="section contact-section visual-section">
        <div class="contact-copy">
          <div class="section-heading"><h2>${editable("contact.heading")}</h2><span class="rule small"></span></div>
          <p>${editable("contact.body", "", { block: true })}</p>
          <span class="button primary"><span aria-hidden="true">✉</span>${editable("contact.buttonLabel")}</span>
        </div>
        <aside class="connect-list">
          <div class="section-heading"><h2>${editable("contact.connectHeading")}</h2><span class="rule small"></span></div>
          ${(currentProfile.contact?.links || [])
            .map(
              (link, index) => `
                <div class="visual-link-row" data-link-row>
                  ${visualText(link.label, "data-link-label")}
                  <input data-link-url value="${escapeHtml(link.url)}" />
                  <button class="visual-remove inline" type="button" data-remove="link" data-index="${index}">删除</button>
                </div>
              `,
            )
            .join("")}
          <button class="button secondary compact" type="button" data-add="link">Add link</button>
        </aside>
      </section>
    </section>
  `;
}

function renderMessagesPanel() {
  const messageRows = contactMessages
    .map(
      (message) => `
        <article class="message-item ${message.is_read ? "" : "unread"}">
          <div class="message-meta">
            <div>
              <strong>${escapeHtml(message.visitor_name || "未留姓名")}</strong>
              <a href="mailto:${escapeHtml(message.email)}">${escapeHtml(message.email)}</a>
            </div>
            <time>${escapeHtml(new Date(message.created_at).toLocaleString())}</time>
          </div>
          <p>${escapeHtml(message.message)}</p>
          <div class="message-actions">
            <span class="message-badge">${message.is_read ? "已读" : "未读"}</span>
            <button class="button secondary compact" type="button" data-toggle-message-read data-message-id="${escapeHtml(
              message.id,
            )}" data-is-read="${message.is_read ? "true" : "false"}">${message.is_read ? "标为未读" : "标为已读"}</button>
            <button class="visual-remove" type="button" data-delete-message data-message-id="${escapeHtml(
              message.id,
            )}">删除</button>
          </div>
        </article>
      `,
    )
    .join("");

  return `
    <section class="admin-card messages-card">
      <div class="admin-card-heading split">
        <div>
          <h3>访客留言</h3>
          <p>公开页面联系表单提交后，会出现在这里。</p>
        </div>
        <button class="button secondary compact" type="button" data-refresh-messages>刷新留言</button>
      </div>
      ${
        messagesLoadError
          ? `<p class="empty-state error">${escapeHtml(messagesLoadError)}</p>`
          : messageRows || `<p class="empty-state">暂时还没有收到留言。</p>`
      }
    </section>
  `;
}

function getProfileIssues() {
  const issues = [];
  const profileText = JSON.stringify(currentProfile || {});
  const templateNames = ["Alex Chen", "alexchen", "alex.chen@email.com"];

  templateNames.forEach((text) => {
    if (profileText.includes(text)) {
      issues.push(`仍包含模板内容：${text}`);
    }
  });

  const emptyLinks = [
    ...(currentProfile.projects?.items || []).flatMap((project) => [
      ["项目案例链接", project.caseStudyUrl],
      ["项目演示链接", project.demoUrl],
    ]),
    ...(currentProfile.contact?.links || []).map((link) => ["联系链接", link.url]),
  ].filter(([, url]) => !url || url === "#");

  if (emptyLinks.length) {
    issues.push(`有 ${emptyLinks.length} 个链接还是空链接 #。`);
  }

  if (!String(currentProfile.hero?.name || "").trim()) {
    issues.push("首页姓名为空。");
  }

  if (!String(currentProfile.hero?.image || "").trim()) {
    issues.push("头像图片为空。");
  }

  if (!issues.length) {
    issues.push("目前没有发现明显的模板残留或空链接。");
  }

  return issues;
}

function renderProfileHealthPanel() {
  const issues = getProfileIssues();
  const hasIssue = !issues.every((issue) => issue.startsWith("目前没有"));

  return `
    <section class="admin-card health-card ${hasIssue ? "needs-work" : ""}">
      <div class="admin-card-heading split">
        <div>
          <h3>资料检查</h3>
          <p>帮你快速发现模板残留、空链接和容易漏掉的信息。</p>
        </div>
        <button class="button secondary compact" type="button" data-sync-identity>同步姓名资料</button>
      </div>
      <ul class="health-list">
        ${issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}
      </ul>
    </section>
  `;
}

function renderForm() {
  editorMount.innerHTML = `
    <div class="editor-toolbar">
      <div>
        <h2>Visual Editor</h2>
        <p>像正式页面一样直接编辑文字和图片。修改后点击保存，公开页面刷新后会看到最新资料。</p>
        <span class="save-state ${isDirty ? "dirty" : ""}" data-save-state>${
          isDirty ? "有未保存修改" : "已同步"
        }</span>
      </div>
      <div class="editor-actions">
        <a class="button secondary" href="../" target="_blank" rel="noreferrer">查看公开页</a>
        <button class="button secondary" type="button" data-sync-identity>同步姓名资料</button>
        <button class="button secondary" type="button" data-load-default>载入默认资料</button>
        <button class="button secondary" type="button" data-toggle-form>详细表单</button>
        <button class="button secondary" type="button" data-toggle-json>Advanced JSON</button>
        <button class="button primary" type="button" data-save-profile>保存到数据库</button>
      </div>
    </div>

    ${renderVisualEditor()}
    ${renderProfileHealthPanel()}
    ${renderMessagesPanel()}

    <details class="form-details">
      <summary>Detailed form</summary>
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
          `,
        )}
      </form>
    </details>

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
    const closedDetails = input.closest("details:not([open])");
    if (closedDetails) return;
    setValue(input.dataset.path, readValue(input), next);
  });

  next.details.items = [...editorMount.querySelectorAll("[data-detail-row]")].map((row) => ({
    label: readValue(row.querySelector("[data-detail-label]")),
    value: readValue(row.querySelector("[data-detail-value]")),
  }));

  next.skills.groups = [...editorMount.querySelectorAll("[data-skill-group]")].map((group) => ({
    icon: readValue(group.querySelector("[data-skill-icon]")),
    title: readValue(group.querySelector("[data-skill-title]")),
    items: [...group.querySelectorAll("[data-skill-item]")].map((item) => ({
      label: readValue(item.querySelector("[data-skill-label]")),
      level: Math.max(0, Math.min(100, Number(readValue(item.querySelector("[data-skill-level]"))) || 0)),
    })),
  }));

  next.experience.items = [...editorMount.querySelectorAll("[data-experience-row]")].map((row) => ({
    period: readValue(row.querySelector("[data-experience-period]")),
    role: readValue(row.querySelector("[data-experience-role]")),
    company: readValue(row.querySelector("[data-experience-company]")),
    description: readValue(row.querySelector("[data-experience-description]")),
  }));

  next.projects.items = [...editorMount.querySelectorAll("[data-project-row]")].map((row) => ({
    title: readValue(row.querySelector("[data-project-title]")),
    description: readValue(row.querySelector("[data-project-description]")),
    image: readValue(row.querySelector("[data-project-image]")),
    imageAlt: readValue(row.querySelector("[data-project-alt]")),
    caseStudyUrl: readValue(row.querySelector("[data-project-case]")),
    demoUrl: readValue(row.querySelector("[data-project-demo]")),
  }));

  next.contact.links = [...editorMount.querySelectorAll("[data-link-row]")].map((row) => ({
    label: readValue(row.querySelector("[data-link-label]")),
    url: readValue(row.querySelector("[data-link-url]")),
  }));

  return next;
}

async function loadMessages() {
  contactMessages = [];
  messagesLoadError = "";

  if (!supabase) {
    messagesLoadError = "配置并登录 Supabase 后，可在这里查看访客留言。";
    return;
  }

  const { data, error } = await supabase
    .from("portfolio_messages")
    .select("id,visitor_name,email,message,created_at,is_read")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    messagesLoadError = "暂时无法读取留言。请先在 Supabase SQL Editor 运行新版 schema.sql。";
    return;
  }

  contactMessages = data || [];
}

async function updateMessageRead(messageId, isRead) {
  if (!supabase) return;

  const { error } = await supabase
    .from("portfolio_messages")
    .update({ is_read: isRead })
    .eq("id", messageId);

  if (error) {
    setEditorStatus(`更新留言失败：${error.message}`, true);
    return;
  }

  await loadMessages();
  renderForm();
  setEditorStatus(isRead ? "已标记为已读。" : "已标记为未读。");
}

async function deleteMessage(messageId) {
  if (!supabase) return;
  if (!window.confirm("确定删除这条留言吗？删除后不可恢复。")) return;

  const { error } = await supabase.from("portfolio_messages").delete().eq("id", messageId);

  if (error) {
    setEditorStatus(`删除留言失败：${error.message}`, true);
    return;
  }

  await loadMessages();
  renderForm();
  setEditorStatus("留言已删除。");
}

function syncIdentity() {
  currentProfile = collectProfileFromForm();

  const name = String(currentProfile.hero?.name || "").trim();
  const emailFact = (currentProfile.hero?.facts || []).find((fact) => String(fact.text || "").includes("@"));
  const email = String(emailFact?.text || "").trim();

  currentProfile.site = currentProfile.site || {};
  currentProfile.hero = currentProfile.hero || {};
  currentProfile.details = currentProfile.details || { items: [] };
  currentProfile.details.items = currentProfile.details.items || [];
  currentProfile.contact = currentProfile.contact || { links: [] };
  currentProfile.contact.links = currentProfile.contact.links || [];

  if (name) {
    const [firstName, ...rest] = name.split(/\s+/);
    currentProfile.hero.brandFirst = firstName || name;
    currentProfile.hero.brandAccent = rest.join(" ");
    currentProfile.site.title = `${name} | Personal Portfolio`;
    currentProfile.site.footer = `© 2026 ${name}. All rights reserved.`;

    const fullNameItem = currentProfile.details.items.find((item) =>
      /^(full name|姓名|名字|name)$/i.test(String(item.label || "").trim()),
    );

    if (fullNameItem) {
      fullNameItem.value = name;
    } else {
      currentProfile.details.items.unshift({ label: "Full Name", value: name });
    }
  }

  if (email) {
    const emailLink = currentProfile.contact.links.find((link) =>
      String(link.url || "").startsWith("mailto:") || String(link.label || "").includes("@"),
    );

    if (emailLink) {
      emailLink.label = email;
      emailLink.url = `mailto:${email}`;
    } else {
      currentProfile.contact.links.push({ label: email, url: `mailto:${email}` });
    }
  }

  renderForm();
  markDirty("已同步姓名、标题、页脚和邮箱链接。点击 Save to database 后发布。");
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
  isDirty = false;
  await loadMessages();
  renderForm();
}

async function saveProfile() {
  currentProfile = collectProfileFromForm();

  if (!supabase) {
    setEditorStatus("当前未连接 Supabase，无法保存到公网数据库。", true);
    return;
  }

  const { error } = await supabase.from("portfolio_profiles").upsert({
    id: profileId,
    content: currentProfile,
  });

  if (error) {
    setEditorStatus(`保存失败：${error.message}`, true);
    return;
  }

  renderForm();
  clearDirty();
}

async function uploadSelectedImage(input) {
  const file = input.files?.[0];
  if (!file) return;

  if (!supabase) {
    setEditorStatus("当前未连接 Supabase，无法上传图片。", true);
    return;
  }

  const safeName = file.name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const filePath = `${profileId}/${Date.now()}-${safeName || "image"}`;
  setEditorStatus("正在上传图片...");

  const { error } = await supabase.storage.from("portfolio-assets").upload(filePath, file, {
    cacheControl: "3600",
    upsert: true,
  });

  if (error) {
    setEditorStatus(`图片上传失败：${error.message}`, true);
    return;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("portfolio-assets").getPublicUrl(filePath);

  const preview = editorMount.querySelector(
    `[data-image-preview="${CSS.escape(input.dataset.previewTarget)}"]`,
  );
  if (preview) preview.src = publicUrl;

  if (input.dataset.imageTarget) {
    const hidden = editorMount.querySelector(`[data-path="${CSS.escape(input.dataset.imageTarget)}"]`);
    if (hidden) hidden.value = publicUrl;
  }

  if (input.dataset.projectIndex) {
    const row = input.closest("[data-project-row]");
    const hidden = row?.querySelector("[data-project-image]");
    if (hidden) hidden.value = publicUrl;
  }

  const label = input.closest(".visual-upload");
  const small = label?.querySelector("small");
  if (small) small.textContent = publicUrl;

  markDirty("图片已上传。点击 Save to database 后公开页面会使用新图片。");
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
  markDirty("已添加内容。点击 Save to database 后发布。");
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
  markDirty("已删除内容。点击 Save to database 后发布。");
}

async function init() {
  await loadLocalDefault();

  if (!hasConfig()) {
    warning.hidden = false;
    loginForm.hidden = true;
    editor.hidden = false;
    currentProfile = clone(localDefault);
    await loadMessages();
    renderForm();
    setEditorStatus("当前仅可预览编辑；配置 Supabase 后才能在线保存。");
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
    markDirty("已载入本地默认资料，保存后会覆盖数据库当前内容。");
  }

  if (button.matches("[data-sync-identity]")) {
    syncIdentity();
  }

  if (button.matches("[data-refresh-messages]")) {
    setEditorStatus("正在刷新留言...");
    await loadMessages();
    renderForm();
    setEditorStatus(messagesLoadError || "留言已刷新。", Boolean(messagesLoadError));
  }

  if (button.matches("[data-toggle-message-read]")) {
    await updateMessageRead(button.dataset.messageId, button.dataset.isRead !== "true");
  }

  if (button.matches("[data-delete-message]")) {
    await deleteMessage(button.dataset.messageId);
  }

  if (button.matches("[data-toggle-json]")) {
    const details = editorMount.querySelector(".json-details");
    if (details) details.open = !details.open;
  }

  if (button.matches("[data-toggle-form]")) {
    const details = editorMount.querySelector(".form-details");
    if (details) details.open = !details.open;
  }

  if (button.matches("[data-apply-json]")) {
    try {
      currentProfile = JSON.parse(editorMount.querySelector("[data-json-editor]").value);
      renderForm();
      markDirty("JSON 已应用到表单，点击保存后才会写入数据库。");
    } catch (error) {
      setEditorStatus(`JSON 格式错误：${error.message}`, true);
    }
  }

  if (button.dataset.add) {
    addItem(button.dataset.add, Number(button.dataset.groupIndex));
  }

  if (button.dataset.remove) {
    removeItem(button.dataset.remove, Number(button.dataset.index), Number(button.dataset.groupIndex));
  }
});

editor?.addEventListener("change", async (event) => {
  const input = event.target.closest("[data-image-upload]");
  if (!input) return;
  await uploadSelectedImage(input);
});

editor?.addEventListener("input", (event) => {
  if (!event.target.closest("[data-editor-mount]")) return;
  if (event.target.closest("[data-json-editor]")) return;
  markDirty();
});

init().catch((error) => {
  setStatus(loginStatus, `初始化失败：${error.message}`, true);
  setStatus(editorStatus, `初始化失败：${error.message}`, true);
});
