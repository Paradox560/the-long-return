(() => {
  "use strict";

  const printButton = document.querySelector("[data-print]");
  if (printButton) {
    printButton.hidden = false;
    printButton.addEventListener("click", () => window.print());
  }

  const mobileContents = document.querySelector(".mobile-contents");
  mobileContents?.querySelectorAll("a[href^='#']").forEach((link) => {
    link.addEventListener("click", () => {
      mobileContents.open = false;
    });
  });

  const links = [...document.querySelectorAll(".contents-sidebar nav a")];
  const headings = [...document.querySelectorAll(".document-body h2[id]")];
  const setCurrent = (identifier) => {
    links.forEach((link) => {
      if (link.hash === `#${identifier}`) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  };

  if (headings.length) setCurrent(headings[0].id);
  links.forEach((link) => link.addEventListener("click", () => setCurrent(link.hash.slice(1))));

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      const entering = entries.filter((entry) => entry.isIntersecting);
      if (entering.length) {
        entering.sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
        setCurrent(entering[0].target.id);
      }
    }, { rootMargin: "0px 0px -65% 0px", threshold: 0 });
    headings.forEach((heading) => observer.observe(heading));
  }
})();
