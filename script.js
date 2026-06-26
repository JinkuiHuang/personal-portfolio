const root = document.documentElement;
const config = window.PORTFOLIO_SUPABASE || {};
const fallbackDataUrl = "./data/profile.json";

function hasSupabaseConfig() {
  return Boolean(config.url && config.anonKey);
}

async function loadSupabaseClient() {
  if (!hasSupabaseConfig()) return null;
  const module = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  return module.createClient(config.url, config.anonKey);
}

async function loadProfile() {
  const fallbackProfile = await fetch(fallbackDataUrl).then((response) => response.json());

  if (!hasSupabaseConfig()) {
    return fallbackProfile;
  }

  try {
    const supabase = await loadSupabaseClient();
    const { data, error } = await supabase
      .from("portfolio_profiles")
      .select("content")
      .eq("id", config.profileId || "main")
      .maybeSingle();

    if (error) throw error;
    return data?.content || fallbackProfile;
  } catch (error) {
    console.warn("Using local profile fallback:", error.message);
    return fallbackProfile;
  }
}

async function submitContactMessage(formData) {
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase 还没有配置，暂时无法在线收取留言。");
  }

  if (String(formData.get("website") || "").trim()) {
    return;
  }

  const visitorName = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const message = String(formData.get("message") || "").trim();

  const supabase = await loadSupabaseClient();
  const { error } = await supabase.from("portfolio_messages").insert({
    visitor_name: visitorName,
    email,
    message,
    page_url: window.location.href,
    user_agent: window.navigator.userAgent,
  });

  if (error) throw error;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nl2br(value = "") {
  return escapeHtml(value).replaceAll("\n", "<br />");
}

function safeUrl(value = "#") {
  const text = String(value || "#").trim();
  if (
    text.startsWith("#") ||
    text.startsWith("./") ||
    text.startsWith("/") ||
    text.startsWith("mailto:") ||
    text.startsWith("https://") ||
    text.startsWith("http://")
  ) {
    return text;
  }
  return "#";
}

function sectionHeading(title) {
  return `
    <div class="section-heading">
      <h2>${escapeHtml(title)}</h2>
      <span class="rule small"></span>
    </div>
  `;
}

function renderProfile(profile) {
  document.title = profile.site?.title || profile.hero?.name || "Personal Portfolio";
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription && profile.site?.description) {
    metaDescription.setAttribute("content", profile.site.description);
  }

  const brand = document.querySelector(".brand");
  if (brand) {
    brand.innerHTML = `${escapeHtml(profile.hero?.brandFirst)} <span>${escapeHtml(
      profile.hero?.brandAccent,
    )}</span>`;
  }

  const nav = document.querySelector("[data-nav]");
  if (nav) {
    nav.innerHTML = (profile.nav || [])
      .map((item, index) => {
        const active = index === 0 ? ' class="active"' : "";
        return `<a${active} href="${safeUrl(item.href)}">${escapeHtml(item.label)}</a>`;
      })
      .join("");
  }

  const hero = document.querySelector(".hero");
  if (hero) {
    hero.innerHTML = `
      <div class="hero-copy">
        <h1>${escapeHtml(profile.hero?.name)}</h1>
        <p class="portfolio-title">${escapeHtml(profile.hero?.portfolioTitle)}</p>
        <span class="rule"></span>
        <h2>${escapeHtml(profile.hero?.headline)}</h2>
        <p>${escapeHtml(profile.hero?.summary)}</p>
        <div class="hero-actions">
          <a class="button primary" href="${safeUrl(profile.hero?.resumeUrl)}" download>
            <span aria-hidden="true">↓</span>
            ${escapeHtml(profile.hero?.resumeLabel)}
          </a>
          <a class="button secondary" href="#projects">
            <span aria-hidden="true">□</span>
            ${escapeHtml(profile.hero?.workLabel)}
          </a>
        </div>
        <ul class="quick-facts" aria-label="快速联系方式">
          ${(profile.hero?.facts || [])
            .map(
              (fact) => `
                <li>
                  <span aria-hidden="true">${escapeHtml(fact.icon)}</span>
                  ${escapeHtml(fact.text)}
                </li>
              `,
            )
            .join("")}
        </ul>
      </div>
      <figure class="hero-media">
        <img src="${safeUrl(profile.hero?.image)}" alt="${escapeHtml(profile.hero?.imageAlt)}" />
      </figure>
    `;
  }

  const detailsBlock = document.querySelector(".details-block");
  if (detailsBlock) {
    detailsBlock.innerHTML = `
      ${sectionHeading(profile.details?.heading)}
      <dl class="detail-list">
        ${(profile.details?.items || [])
          .map(
            (item) => `
              <div>
                <dt>${escapeHtml(item.label)}</dt>
                <dd>${nl2br(item.value)}</dd>
              </div>
            `,
          )
          .join("")}
      </dl>
      <a class="text-link" href="#contact">${escapeHtml(
        profile.details?.moreLabel,
      )} <span aria-hidden="true">→</span></a>
    `;
  }

  const skillsBlock = document.querySelector(".skills-block");
  if (skillsBlock) {
    skillsBlock.innerHTML = `
      ${sectionHeading(profile.skills?.heading)}
      ${(profile.skills?.groups || [])
        .map(
          (group) => `
            <article class="skill-group">
              <div>
                <span class="skill-icon" aria-hidden="true">${escapeHtml(group.icon)}</span>
                <h3>${escapeHtml(group.title)}</h3>
                ${(group.items || []).map((item) => `<p>${escapeHtml(item.label)}</p>`).join("")}
              </div>
              <div class="meters" aria-label="${escapeHtml(group.title)} skill levels">
                ${(group.items || [])
                  .map(
                    (item) =>
                      `<span style="--level: ${Math.max(0, Math.min(100, Number(item.level) || 0))}%"></span>`,
                  )
                  .join("")}
              </div>
            </article>
          `,
        )
        .join("")}
    `;
  }

  const timelineSection = document.querySelector(".timeline-section");
  if (timelineSection) {
    timelineSection.innerHTML = `
      ${sectionHeading(profile.experience?.heading)}
      <div class="timeline">
        ${(profile.experience?.items || [])
          .map(
            (item) => `
              <article>
                <time>${escapeHtml(item.period)}</time>
                <div class="timeline-dot"></div>
                <div>
                  <h3>${escapeHtml(item.role)}</h3>
                  <p class="company">${escapeHtml(item.company)}</p>
                  <p>${escapeHtml(item.description)}</p>
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
    `;
  }

  const projectsSection = document.querySelector(".projects-section");
  if (projectsSection) {
    projectsSection.innerHTML = `
      ${sectionHeading(profile.projects?.heading)}
      <div class="project-grid">
        ${(profile.projects?.items || [])
          .map(
            (project) => `
              <article class="project-card">
                <img src="${safeUrl(project.image)}" alt="${escapeHtml(project.imageAlt)}" />
                <h3>${escapeHtml(project.title)}</h3>
                <p>${escapeHtml(project.description)}</p>
                <div class="project-links">
                  <a href="${safeUrl(project.caseStudyUrl)}">View Case Study <span aria-hidden="true">→</span></a>
                  <a href="${safeUrl(project.demoUrl)}">Live Demo <span aria-hidden="true">↗</span></a>
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
      <a class="center-link" href="#contact">${escapeHtml(
        profile.projects?.moreLabel,
      )} <span aria-hidden="true">→</span></a>
    `;
  }

  const contactSection = document.querySelector(".contact-section");
  if (contactSection) {
    contactSection.innerHTML = `
      <div class="contact-copy">
        ${sectionHeading(profile.contact?.heading)}
        <p>${escapeHtml(profile.contact?.body)}</p>
        <form class="contact-form" data-contact-form>
          <label>
            <span>${escapeHtml(profile.contact?.nameLabel || "Your name")}</span>
            <input
              type="text"
              name="name"
              placeholder="${escapeHtml(profile.contact?.namePlaceholder || "Your name")}"
              autocomplete="name"
            />
          </label>
          <label>
            <span>${escapeHtml(profile.contact?.emailLabel || "Your email")}</span>
            <input type="email" name="email" placeholder="${escapeHtml(
              profile.contact?.emailPlaceholder,
            )}" autocomplete="email" required />
          </label>
          <label>
            <span>${escapeHtml(profile.contact?.messageLabel || "Message")}</span>
            <textarea name="message" rows="4" placeholder="${escapeHtml(
              profile.contact?.messagePlaceholder,
            )}" required></textarea>
          </label>
          <label class="form-trap" aria-hidden="true" tabindex="-1">
            <span>Website</span>
            <input type="text" name="website" tabindex="-1" autocomplete="off" />
          </label>
          <button class="button primary" type="submit">
            <span aria-hidden="true">✉</span>
            ${escapeHtml(profile.contact?.buttonLabel)}
          </button>
          <p class="form-status" data-form-status role="status"></p>
        </form>
      </div>
      <aside class="connect-list" aria-label="社交链接">
        ${sectionHeading(profile.contact?.connectHeading)}
        ${(profile.contact?.links || [])
          .map((link) => `<a href="${safeUrl(link.url)}">${escapeHtml(link.label)}</a>`)
          .join("")}
      </aside>
    `;
  }

  const footerText = document.querySelector(".site-footer p");
  if (footerText) {
    footerText.textContent = profile.site?.footer || "";
  }

  const footerNav = document.querySelector(".site-footer nav");
  if (footerNav) {
    footerNav.innerHTML = (profile.nav || [])
      .map((item) => `<a href="${safeUrl(item.href)}">${escapeHtml(item.label)}</a>`)
      .join("");
  }
}

function initInteractions() {
  const nav = document.querySelector("[data-nav]");
  const menuToggle = document.querySelector("[data-menu-toggle]");
  const themeToggle = document.querySelector("[data-theme-toggle]");
  const header = document.querySelector("[data-header]");
  const navLinks = [...document.querySelectorAll(".site-nav a")];
  const sections = navLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  const savedTheme = localStorage.getItem("portfolio-theme");
  if (savedTheme) {
    root.dataset.theme = savedTheme;
  }

  menuToggle?.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    menuToggle.setAttribute("aria-label", isOpen ? "关闭导航" : "打开导航");
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      menuToggle?.setAttribute("aria-label", "打开导航");
    });
  });

  themeToggle?.addEventListener("click", () => {
    const nextTheme = root.dataset.theme === "dark" ? "" : "dark";
    if (nextTheme) {
      root.dataset.theme = nextTheme;
      localStorage.setItem("portfolio-theme", nextTheme);
      return;
    }

    delete root.dataset.theme;
    localStorage.removeItem("portfolio-theme");
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((link) => {
          link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`);
        });
      });
    },
    {
      rootMargin: `-${header?.offsetHeight || 78}px 0px -62% 0px`,
      threshold: 0.12,
    },
  );

  sections.forEach((section) => observer.observe(section));

  const form = document.querySelector("[data-contact-form]");
  const formStatus = document.querySelector("[data-form-status]");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const email = formData.get("email");
    const submitButton = form.querySelector('button[type="submit"]');

    if (submitButton) submitButton.disabled = true;
    formStatus.textContent = "正在发送...";
    formStatus.classList.remove("error");

    try {
      await submitContactMessage(formData);
      formStatus.textContent = `Thanks, ${email}. Your message has been sent.`;
      form.reset();
    } catch (error) {
      formStatus.textContent = `发送失败：${error.message}`;
      formStatus.classList.add("error");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

loadProfile()
  .then((profile) => {
    renderProfile(profile);
    initInteractions();
  })
  .catch((error) => {
    console.error("Unable to load portfolio profile:", error);
    initInteractions();
  });
