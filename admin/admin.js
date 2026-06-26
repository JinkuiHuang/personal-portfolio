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
const draftKey = `portfolio-admin-draft:${profileId}`;
let supabase = null;
let localDefault = null;
let currentProfile = null;
let contactMessages = [];
let messagesLoadError = "";
let isDirty = false;
let hasDraft = false;

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

function updateDraftButtons() {
  editorMount?.querySelectorAll("[data-draft-action]").forEach((button) => {
    button.hidden = !hasDraft;
  });
}

function readDraft() {
  try {
    const raw = localStorage.getItem(draftKey);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Unable to read portfolio draft:", error.message);
    return null;
  }
}

function writeDraft(profile = currentProfile) {
  try {
    localStorage.setItem(
      draftKey,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        profile,
      }),
    );
    hasDraft = true;
    updateDraftButtons();
  } catch (error) {
    console.warn("Unable to save portfolio draft:", error.message);
  }
}

function clearDraft() {
  localStorage.removeItem(draftKey);
  hasDraft = false;
  updateDraftButtons();
}

function markDirty(message = "有未保存修改，点击保存到数据库后才会发布。") {
  isDirty = true;
  setEditorStatus(message);
}

function clearDirty(message = "已保存。公开页面刷新后会读取最新资料。") {
  isDirty = false;
  clearDraft();
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

function orderButtons(type, index, total, groupIndex = "") {
  const groupAttribute = groupIndex === "" ? "" : ` data-group-index="${groupIndex}"`;
  return `
    <div class="visual-order">
      <button type="button" data-move="${escapeHtml(type)}" data-index="${index}" data-direction="-1"${groupAttribute} ${
        index <= 0 ? "disabled" : ""
      }>上移</button>
      <button type="button" data-move="${escapeHtml(type)}" data-index="${index}" data-direction="1"${groupAttribute} ${
        index >= total - 1 ? "disabled" : ""
      }>下移</button>
    </div>
  `;
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

function fileUploader(label, targetPath, currentUrl, accept = ".pdf,.doc,.docx,image/*") {
  return `
    <div class="visual-upload">
      <span>${escapeHtml(label)}</span>
      <input type="hidden" data-path="${escapeHtml(targetPath)}" value="${escapeHtml(currentUrl || "")}" />
      <label class="upload-button">
        Choose file
        <input type="file" accept="${escapeHtml(accept)}" data-file-upload data-file-target="${escapeHtml(
          targetPath,
        )}" />
      </label>
      <small>${escapeHtml(currentUrl || "No file selected")}</small>
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

      <section class="admin-card visual-site-card">
        <div class="admin-card-heading">
          <h3>站点外观</h3>
        </div>
        <div class="visual-site-grid">
          <label>
            <span>浏览器标题</span>
            <input data-path="site.title" value="${escapeHtml(currentProfile.site?.title)}" />
          </label>
          <label>
            <span>页脚文字</span>
            <input data-path="site.footer" value="${escapeHtml(currentProfile.site?.footer)}" />
          </label>
          <label>
            <span>品牌左半部分</span>
            <input data-path="hero.brandFirst" value="${escapeHtml(currentProfile.hero?.brandFirst)}" />
          </label>
          <label>
            <span>品牌强调部分</span>
            <input data-path="hero.brandAccent" value="${escapeHtml(currentProfile.hero?.brandAccent)}" />
          </label>
        </div>
        <div class="visual-color-grid">
          <label>
            <span>主色</span>
            <input type="color" data-path="site.colors.accent" value="${escapeHtml(
              currentProfile.site?.colors?.accent || "#087982",
            )}" />
          </label>
          <label>
            <span>深主色</span>
            <input type="color" data-path="site.colors.accentDark" value="${escapeHtml(
              currentProfile.site?.colors?.accentDark || "#05606a",
            )}" />
          </label>
          <label>
            <span>浅底色</span>
            <input type="color" data-path="site.colors.accentSoft" value="${escapeHtml(
              currentProfile.site?.colors?.accentSoft || "#e5f4f3",
            )}" />
          </label>
          <label>
            <span>强调线</span>
            <input type="color" data-path="site.colors.warm" value="${escapeHtml(
              currentProfile.site?.colors?.warm || "#e9a11a",
            )}" />
          </label>
        </div>
      </section>

      <section class="admin-card visual-nav-card">
        <div class="admin-card-heading">
          <h3>导航菜单</h3>
        </div>
        <div class="visual-nav-list">
          ${(currentProfile.nav || [])
            .map(
              (item, index) => `
                <div class="visual-link-row" data-nav-row>
                  ${visualText(item.label, "data-nav-label")}
                  <input data-nav-href value="${escapeHtml(item.href)}" />
                  ${orderButtons("nav", index, currentProfile.nav?.length || 0)}
                  <button class="visual-remove inline" type="button" data-remove="nav" data-index="${index}">删除</button>
                </div>
              `,
            )
            .join("")}
        </div>
        <button class="button secondary compact" type="button" data-add="nav">Add nav item</button>
      </section>

      <section class="hero section visual-section">
        <div class="hero-copy">
          <h1>${editable("hero.name")}</h1>
          <p class="portfolio-title">${editable("hero.portfolioTitle")}</p>
          <span class="rule"></span>
          <h2>${editable("hero.headline")}</h2>
          <p>${editable("hero.summary", "", { block: true })}</p>
          <div class="hero-actions visual-button-editor">
            <span class="button primary"><span aria-hidden="true">↓</span>${editable("hero.resumeLabel")}</span>
            <span class="button secondary"><span aria-hidden="true">□</span>${editable("hero.workLabel")}</span>
          </div>
          ${fileUploader("简历文件", "hero.resumeUrl", currentProfile.hero?.resumeUrl)}
          <ul class="quick-facts" aria-label="快速联系方式">
            ${(currentProfile.hero?.facts || [])
              .map(
                (fact, index) => `
                  <li data-fact-row>
                    ${visualText(fact.icon, "data-fact-icon")}
                    ${visualText(fact.text, "data-fact-text")}
                    ${orderButtons("fact", index, currentProfile.hero?.facts?.length || 0)}
                    <button class="visual-remove inline" type="button" data-remove="fact" data-index="${index}">删除</button>
                  </li>
                `,
              )
              .join("")}
          </ul>
          <button class="button secondary compact" type="button" data-add="fact">Add quick info</button>
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
                    ${orderButtons("details", index, currentProfile.details?.items?.length || 0)}
                    <button class="visual-remove" type="button" data-remove="details" data-index="${index}">删除</button>
                  </div>
                `,
              )
              .join("")}
          </dl>
          <a class="text-link" href="#contact">${editable("details.moreLabel")} <span aria-hidden="true">→</span></a>
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
                      ${orderButtons("skillGroup", groupIndex, currentProfile.skills?.groups?.length || 0)}
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
                              ${orderButtons("skillItem", itemIndex, group.items?.length || 0, groupIndex)}
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
                    ${orderButtons("experience", index, currentProfile.experience?.items?.length || 0)}
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
        <div class="visual-project-labels">
          <label><span>案例按钮文字</span><input data-path="projects.caseStudyLabel" value="${escapeHtml(
            currentProfile.projects?.caseStudyLabel || "View Case Study",
          )}" /></label>
          <label><span>演示按钮文字</span><input data-path="projects.demoLabel" value="${escapeHtml(
            currentProfile.projects?.demoLabel || "Live Demo",
          )}" /></label>
        </div>
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
                  <div class="project-links">
                    <span>${escapeHtml(currentProfile.projects?.caseStudyLabel || "View Case Study")} →</span>
                    <span>${escapeHtml(currentProfile.projects?.demoLabel || "Live Demo")} ↗</span>
                  </div>
                  <label><span>案例链接</span><input data-project-case value="${escapeHtml(project.caseStudyUrl)}" /></label>
                  <label><span>演示链接</span><input data-project-demo value="${escapeHtml(project.demoUrl)}" /></label>
                  ${orderButtons("project", index, currentProfile.projects?.items?.length || 0)}
                  <button class="visual-remove" type="button" data-remove="project" data-index="${index}">删除项目</button>
                </article>
              `,
            )
            .join("")}
        </div>
        <a class="center-link" href="#contact">${editable("projects.moreLabel")} <span aria-hidden="true">→</span></a>
        <button class="button secondary compact" type="button" data-add="project">Add project</button>
      </section>

      <section class="section contact-section visual-section">
        <div class="contact-copy">
          <div class="section-heading"><h2>${editable("contact.heading")}</h2><span class="rule small"></span></div>
          <p>${editable("contact.body", "", { block: true })}</p>
          <div class="visual-form-labels">
            <label><span>姓名标签</span><input data-path="contact.nameLabel" value="${escapeHtml(
              currentProfile.contact?.nameLabel || "Your name",
            )}" /></label>
            <label><span>姓名提示</span><input data-path="contact.namePlaceholder" value="${escapeHtml(
              currentProfile.contact?.namePlaceholder || "Your name",
            )}" /></label>
            <label><span>邮箱标签</span><input data-path="contact.emailLabel" value="${escapeHtml(
              currentProfile.contact?.emailLabel || "Your email",
            )}" /></label>
            <label><span>留言标签</span><input data-path="contact.messageLabel" value="${escapeHtml(
              currentProfile.contact?.messageLabel || "Message",
            )}" /></label>
          </div>
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
                  ${orderButtons("link", index, currentProfile.contact?.links?.length || 0)}
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
        <button class="button secondary" type="button" data-draft-action data-restore-draft ${
          hasDraft ? "" : "hidden"
        }>恢复草稿</button>
        <button class="button secondary" type="button" data-draft-action data-discard-draft ${
          hasDraft ? "" : "hidden"
        }>丢弃草稿</button>
        <button class="button secondary" type="button" data-load-default>载入默认资料</button>
        <button class="button secondary" type="button" data-download-backup>下载备份</button>
        <label class="button secondary backup-upload">
          恢复备份
          <input type="file" accept="application/json,.json" data-backup-upload />
        </label>
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
              ${field("简历按钮文字", "hero.resumeLabel")}
              ${field("作品按钮文字", "hero.workLabel")}
              ${field("个人详情更多链接文字", "details.moreLabel")}
              ${field("项目更多链接文字", "projects.moreLabel")}
              ${field("项目案例按钮文字", "projects.caseStudyLabel")}
              ${field("项目演示按钮文字", "projects.demoLabel")}
              ${field("主色", "site.colors.accent", { type: "color" })}
              ${field("深主色", "site.colors.accentDark", { type: "color" })}
              ${field("浅底色", "site.colors.accentSoft", { type: "color" })}
              ${field("强调线", "site.colors.warm", { type: "color" })}
            </div>
            ${field("个人简介", "hero.summary", { textarea: true, rows: 4 })}
          `,
        )}
        ${section(
          "联系表单文案",
          `
            <div class="admin-form-grid">
              ${field("姓名标签", "contact.nameLabel")}
              ${field("姓名占位提示", "contact.namePlaceholder")}
              ${field("邮箱标签", "contact.emailLabel")}
              ${field("邮箱占位提示", "contact.emailPlaceholder")}
              ${field("留言标签", "contact.messageLabel")}
              ${field("留言占位提示", "contact.messagePlaceholder")}
              ${field("发送按钮文字", "contact.buttonLabel")}
            </div>
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

  next.nav = [...editorMount.querySelectorAll("[data-nav-row]")].map((row) => ({
    label: readValue(row.querySelector("[data-nav-label]")),
    href: readValue(row.querySelector("[data-nav-href]")),
  }));

  next.hero.facts = [...editorMount.querySelectorAll("[data-fact-row]")].map((row) => ({
    icon: readValue(row.querySelector("[data-fact-icon]")),
    text: readValue(row.querySelector("[data-fact-text]")),
  }));

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

  writeDraft(currentProfile);
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
  hasDraft = Boolean(readDraft());
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

  currentProfile = collectProfileFromForm();
  writeDraft(currentProfile);
  markDirty("图片已上传。点击 Save to database 后公开页面会使用新图片。");
}

async function uploadSelectedFile(input) {
  const file = input.files?.[0];
  if (!file) return;

  if (!supabase) {
    setEditorStatus("当前未连接 Supabase，无法上传文件。", true);
    return;
  }

  const safeName = file.name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const filePath = `${profileId}/files/${Date.now()}-${safeName || "file"}`;
  setEditorStatus("正在上传文件...");

  const { error } = await supabase.storage.from("portfolio-assets").upload(filePath, file, {
    cacheControl: "3600",
    upsert: true,
  });

  if (error) {
    setEditorStatus(`文件上传失败：${error.message}`, true);
    return;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("portfolio-assets").getPublicUrl(filePath);

  if (input.dataset.fileTarget) {
    const hidden = editorMount.querySelector(`[data-path="${CSS.escape(input.dataset.fileTarget)}"]`);
    if (hidden) hidden.value = publicUrl;
  }

  const label = input.closest(".visual-upload");
  const small = label?.querySelector("small");
  if (small) small.textContent = publicUrl;

  currentProfile = collectProfileFromForm();
  writeDraft(currentProfile);
  markDirty("文件已上传。点击保存到数据库后公开页面会使用新文件。");
}

function addItem(type, groupIndex) {
  currentProfile = collectProfileFromForm();

  if (type === "details") {
    currentProfile.details.items.push({ label: "New field", value: "" });
  }
  if (type === "nav") {
    currentProfile.nav.push({ label: "New nav", href: "#" });
  }
  if (type === "fact") {
    currentProfile.hero.facts = currentProfile.hero.facts || [];
    currentProfile.hero.facts.push({ icon: "•", text: "New info" });
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

  writeDraft(currentProfile);
  renderForm();
  markDirty("已添加内容。点击 Save to database 后发布。");
}

function removeItem(type, index, groupIndex) {
  currentProfile = collectProfileFromForm();

  if (type === "details") currentProfile.details.items.splice(index, 1);
  if (type === "nav") currentProfile.nav.splice(index, 1);
  if (type === "fact") currentProfile.hero.facts?.splice(index, 1);
  if (type === "skillGroup") currentProfile.skills.groups.splice(index, 1);
  if (type === "skillItem") currentProfile.skills.groups[groupIndex].items.splice(index, 1);
  if (type === "experience") currentProfile.experience.items.splice(index, 1);
  if (type === "project") currentProfile.projects.items.splice(index, 1);
  if (type === "link") currentProfile.contact.links.splice(index, 1);

  writeDraft(currentProfile);
  renderForm();
  markDirty("已删除内容。点击 Save to database 后发布。");
}

function moveArrayItem(items, index, direction) {
  const targetIndex = index + direction;
  if (!Array.isArray(items) || targetIndex < 0 || targetIndex >= items.length) return false;
  const [item] = items.splice(index, 1);
  items.splice(targetIndex, 0, item);
  return true;
}

function moveItem(type, index, direction, groupIndex) {
  currentProfile = collectProfileFromForm();
  let moved = false;

  if (type === "nav") moved = moveArrayItem(currentProfile.nav, index, direction);
  if (type === "fact") moved = moveArrayItem(currentProfile.hero?.facts, index, direction);
  if (type === "details") moved = moveArrayItem(currentProfile.details?.items, index, direction);
  if (type === "skillGroup") moved = moveArrayItem(currentProfile.skills?.groups, index, direction);
  if (type === "skillItem") {
    moved = moveArrayItem(currentProfile.skills?.groups?.[groupIndex]?.items, index, direction);
  }
  if (type === "experience") moved = moveArrayItem(currentProfile.experience?.items, index, direction);
  if (type === "project") moved = moveArrayItem(currentProfile.projects?.items, index, direction);
  if (type === "link") moved = moveArrayItem(currentProfile.contact?.links, index, direction);

  if (!moved) return;

  writeDraft(currentProfile);
  renderForm();
  markDirty("顺序已调整。点击保存到数据库后发布。");
}

function restoreDraft() {
  const draft = readDraft();
  if (!draft?.profile) {
    hasDraft = false;
    renderForm();
    setEditorStatus("没有找到可恢复的草稿。", true);
    return;
  }

  currentProfile = clone(draft.profile);
  isDirty = true;
  hasDraft = true;
  renderForm();
  setEditorStatus(`已恢复 ${new Date(draft.savedAt).toLocaleString()} 的草稿，保存后才会发布。`);
}

function discardDraft() {
  clearDraft();
  renderForm();
  setEditorStatus("本机草稿已丢弃，当前页面内容未改变。");
}

function downloadBackup() {
  const profile = collectProfileFromForm();
  const name = String(profile.hero?.name || profileId || "portfolio")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${name || "portfolio"}-backup-${date}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setEditorStatus("备份已下载到浏览器默认下载文件夹。");
}

function isValidProfileBackup(profile) {
  return Boolean(
    profile &&
      typeof profile === "object" &&
      profile.site &&
      profile.hero &&
      profile.details &&
      profile.skills &&
      profile.experience &&
      profile.projects &&
      profile.contact,
  );
}

async function restoreBackupFile(input) {
  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const profile = JSON.parse(text);

    if (!isValidProfileBackup(profile)) {
      throw new Error("这个文件不像本网页的资料备份。");
    }

    currentProfile = clone(profile);
    writeDraft(currentProfile);
    renderForm();
    markDirty("备份已恢复为草稿。确认无误后点击保存到数据库。");
  } catch (error) {
    setEditorStatus(`恢复备份失败：${error.message}`, true);
  } finally {
    input.value = "";
  }
}

async function init() {
  await loadLocalDefault();

  if (!hasConfig()) {
    warning.hidden = false;
    loginForm.hidden = true;
    editor.hidden = false;
    currentProfile = clone(localDefault);
    hasDraft = Boolean(readDraft());
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
    writeDraft(currentProfile);
    renderForm();
    markDirty("已载入本地默认资料，保存后会覆盖数据库当前内容。");
  }

  if (button.matches("[data-download-backup]")) {
    downloadBackup();
  }

  if (button.matches("[data-restore-draft]")) {
    restoreDraft();
  }

  if (button.matches("[data-discard-draft]")) {
    discardDraft();
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
      writeDraft(currentProfile);
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

  if (button.dataset.move) {
    moveItem(
      button.dataset.move,
      Number(button.dataset.index),
      Number(button.dataset.direction),
      Number(button.dataset.groupIndex),
    );
  }
});

editor?.addEventListener("change", async (event) => {
  const imageInput = event.target.closest("[data-image-upload]");
  if (imageInput) {
    await uploadSelectedImage(imageInput);
    return;
  }

  const fileInput = event.target.closest("[data-file-upload]");
  if (fileInput) {
    await uploadSelectedFile(fileInput);
    return;
  }

  const backupInput = event.target.closest("[data-backup-upload]");
  if (backupInput) {
    await restoreBackupFile(backupInput);
  }
});

editor?.addEventListener("input", (event) => {
  if (!event.target.closest("[data-editor-mount]")) return;
  if (event.target.closest("[data-json-editor]")) return;
  currentProfile = collectProfileFromForm();
  writeDraft(currentProfile);
  markDirty();
});

window.addEventListener("beforeunload", (event) => {
  if (!isDirty) return;
  event.preventDefault();
  event.returnValue = "";
});

window.addEventListener("keydown", async (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
  if (editor.hidden) return;
  event.preventDefault();
  await saveProfile();
});

init().catch((error) => {
  setStatus(loginStatus, `初始化失败：${error.message}`, true);
  setStatus(editorStatus, `初始化失败：${error.message}`, true);
});
