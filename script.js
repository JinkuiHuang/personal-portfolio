const root = document.documentElement;
const nav = document.querySelector("[data-nav]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const themeToggle = document.querySelector("[data-theme-toggle]");
const form = document.querySelector("[data-contact-form]");
const formStatus = document.querySelector("[data-form-status]");
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

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const email = formData.get("email");

  formStatus.textContent = `Thanks, ${email}. Your message is ready to connect to a backend or email service.`;
  form.reset();
});
