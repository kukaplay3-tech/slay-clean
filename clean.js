(() => {
  "use strict";

  const word = String.raw`(?<![\p{L}\p{N}])(?:win[\s\u200b\u00ad‐‑-]*line|вин[\s\u200b\u00ad‐‑-]*лайн(?:а|у|ом|е)?)(?![\p{L}\p{N}])`;
  const mention = new RegExp(word, "iu");
  const spacedMention = new RegExp(`[ \\t]*${word}[ \\t]*`, "giu");
  const resourceBrand = /winline|винлайн/iu;
  const ignored = "script, style, template, noscript, textarea, [contenteditable]:not([contenteditable='false'])";
  const labels = ["aria-label", "aria-description", "alt", "title", "placeholder", "content"];
  const sources = ["src", "srcset", "poster"];
  const hide = "data-slay-clean-hidden";
  const photo = "data-slay-clean-photo";
  const photoCutouts = {
    "photo-1.BP9cgKYN.webp": [
      [[867, 426], [1046, 474], [1037, 510], [856, 461]],
      [[701, 382], [750, 359], [761, 376], [709, 399]],
    ],
    "photo-2.DFx0EUc3.webp": [
      [[709, 758], [750, 739], [762, 753], [719, 777]],
    ],
    "photo-4.C--sjgbx.webp": [
      [[668, 658], [692, 658], [692, 667], [668, 667]],
    ],
    "photo-6.CXkCKU8L.webp": [
      [[1168, 314], [1246, 333], [1240, 355], [1165, 336]],
      [[349, 777], [375, 776], [371, 791], [346, 795]],
      [[387, 778], [422, 784], [420, 797], [387, 791]],
    ],
  };

  function withoutBrand(value) {
    return value.replace(spacedMention, (match, index) => {
      const left = value[index - 1];
      const right = value[index + match.length];
      return left && right && !/[\s([{«]/u.test(left) && !/[\s,.;:!?…\)\]}»]/u.test(right)
        && /[ \t]/.test(match) ? " " : "";
    });
  }

  function cleanText(node) {
    if (!mention.test(node.data)) return;

    let text = node.data;
    if (node.parentElement?.matches(".legends__text")) {
      // Remove sponsor-only claims in the current carousel and retain the event copy.
      if (/^\s*главным партн[её]ром/iu.test(text)) {
        text = "";
      } else {
        text = text.replace(/(?<=[.!?])\s+и в \d{4} году[^.!?]*[.!?]*/giu,
          (sentence) => mention.test(sentence) ? "" : sentence);
      }
    }

    node.data = withoutBrand(text);
  }

  function isBrandedResource(value) {
    if (!value) return false;
    try {
      return resourceBrand.test(decodeURIComponent(value));
    } catch {
      return resourceBrand.test(value);
    }
  }

  function cleanLink(element) {
    const href = element.getAttribute("href");
    if (!href) return false;

    try {
      const url = new URL(href, document.baseURI);
      if (url.hostname === "calendar.yandex.ru" && url.pathname === "/event") {
        const keys = ["name", "description"];
        for (const key of keys) {
          const value = url.searchParams.get(key);
          if (value && mention.test(value)) url.searchParams.set(key, withoutBrand(value));
        }
        if (url.href !== href) element.setAttribute("href", url.href);
      }
      return isBrandedResource(url.hostname + url.pathname);
    } catch {
      return false;
    }
  }

  function maskPhoto(element) {
    const src = element.getAttribute("src") ?? "";
    const file = src.split("/").pop();
    const cutouts = Object.hasOwn(photoCutouts, file) ? photoCutouts[file] : null;
    if (!cutouts) {
      element.removeAttribute(photo);
      return;
    }
    if (element.getAttribute(photo) === file) return;

    // Position the cutouts in the source photo's coordinate space after object-fit: cover.
    const points = ["0 0", "100% 0", "100% 100%", "0 100%", "0 0"];
    for (const cutout of cutouts) {
      for (const [x, y] of [...cutout, cutout[0]]) {
        points.push(`calc(var(--slay-photo-left) + var(--slay-photo-w) * ${x / 1600}) ` +
          `calc(var(--slay-photo-top) + var(--slay-photo-h) * ${y / 1067})`);
      }
      points.push("0 0");
    }
    element.style.setProperty("--slay-clean-photo-clip", `polygon(evenodd, ${points.join(", ")})`);
    element.setAttribute(photo, file);
  }

  function cleanElement(element) {
    if (element.matches("img.legends__image")) maskPhoto(element);
    if (element.matches(".header__logo") && element.getAttribute("aria-label") !== "SLAY — на главную") {
      element.setAttribute("aria-label", "SLAY — на главную");
    }

    const media = element.matches("img, source, video, audio, iframe, embed, object, image, use, input[type='image']");
    const mediaLabel = media && mention.test(element.getAttribute("alt") ?? "");
    const brandedMedia = media && (
      sources.some((name) => isBrandedResource(element.getAttribute(name))) ||
      isBrandedResource(element.getAttribute("href")) ||
      isBrandedResource(element.getAttribute("xlink:href")) ||
      isBrandedResource(element.getAttribute("data"))
    );
    const sponsoredLink = element.matches("a[href], area[href]") && cleanLink(element);
    const sponsoredControl = /(?:^|-)winline(?:-|$)/i.test(element.getAttribute("data-af") ?? "");
    const hidden = mediaLabel || brandedMedia || sponsoredLink || sponsoredControl;
    element.toggleAttribute(hide, hidden);

    for (const name of labels) {
      // A branded image's alt text also identifies it when the asset URL is generic.
      if (name === "alt" && mediaLabel) continue;
      const value = element.getAttribute(name);
      if (value && mention.test(value)) element.setAttribute(name, withoutBrand(value));
    }
  }

  function scan(root) {
    const parent = root.nodeType === Node.ELEMENT_NODE ? root : root.parentElement;
    if (parent?.closest(ignored)) return;

    if (root.nodeType === Node.TEXT_NODE) {
      cleanText(root);
      return;
    }
    if (root.nodeType === Node.ELEMENT_NODE) cleanElement(root);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.nodeType === Node.ELEMENT_NODE && node.matches(ignored)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) cleanText(node);
      else cleanElement(node);
    }
  }

  const observer = new MutationObserver((mutations) => {
    const added = new Set();
    const changed = new Set();
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) added.add(node);
      } else {
        changed.add(mutation.target);
      }
    }
    for (const node of added) {
      if (node.isConnected && !added.has(node.parentNode)) scan(node);
    }
    for (const node of changed) {
      if (!node.isConnected || added.has(node)) continue;
      if (node.nodeType === Node.TEXT_NODE) scan(node);
      else if (!node.closest(ignored)) cleanElement(node);
    }
  });

  observer.observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...labels, ...sources, "href", "xlink:href", "data", "data-af"],
  });
  scan(document);
})();
