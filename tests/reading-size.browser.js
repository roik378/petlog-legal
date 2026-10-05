async (page) => {
  const base = "http://127.0.0.1:8899/";
  const files = ["index.html", "littlemoni-privacy-en.html", "littlemoni-privacy-zh.html", "littlemoni-terms-en.html", "littlemoni-terms-zh.html", "petcareproof-privacy-en.html", "petcareproof-privacy-zh.html", "petcareproof-support-en.html", "petcareproof-support-zh.html", "petlog-support-en.html", "petlog-support-zh.html", "petmotion-privacy-en.html", "petmotion-support-en.html", "privacy-en.html", "privacy-zh.html", "read-water-privacy-en.html", "read-water-privacy-zh.html", "read-water-terms-en.html", "read-water-terms-zh.html", "terms-en.html", "terms-zh.html", "timetox-privacy-en.html", "timetox-support-en.html"];
  const viewports = [{ width: 1280, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 740 }];
  const roots = [16, 24, 32];
  const results = [];
  const keyboard = [];
  const errors = [];
  const onError = error => errors.push(String(error));
  page.on("pageerror", onError);
  try {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const file of files) {
        const response = await page.goto(base + file);
        await page.evaluate(async () => {
          for (const img of document.images) img.loading = "eager";
          await Promise.all([...document.images].map(img => img.decode()));
          await document.fonts.ready;
        });
        let previousSizes;
        for (const root of roots) {
          await page.evaluate(size => { document.documentElement.style.fontSize = size + "px"; window.scrollTo(0, 0); }, root);
          const metrics = await page.evaluate(() => {
            const textOverflow = [];
            const overlappingLines = [];
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              const node = walker.currentNode;
              if (!node.textContent.trim() || node.parentElement.closest(".skip-link")) continue;
              const range = document.createRange();
              range.selectNodeContents(node);
              const rects = [...range.getClientRects()].filter(rect => rect.width && rect.height);
              for (const rect of rects) {
                if (rect.left < -1 || rect.right > innerWidth + 1) textOverflow.push(node.textContent.trim().slice(0, 80));
              }
              for (let i = 1; i < rects.length; i++) {
                if (rects[i].top > rects[i - 1].top + 1 && rects[i].top < rects[i - 1].bottom - 1) overlappingLines.push(node.textContent.trim().slice(0, 80));
              }
            }
            const targets = [...document.querySelectorAll("nav a, .documents a")];
            const tinyTargets = targets.filter(a => a.getBoundingClientRect().height < 44).map(a => a.textContent.trim());
            const overlaps = [];
            for (let i = 0; i < targets.length; i++) {
              const a = targets[i].getBoundingClientRect();
              for (let j = i + 1; j < targets.length; j++) {
                const b = targets[j].getBoundingClientRect();
                if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps.push([targets[i].textContent.trim(), targets[j].textContent.trim()]);
              }
            }
            const sizes = Object.fromEntries(["body", "h1", "h2", "nav", ".documents a", ".contact p", ".meta", ".lead", "footer"].flatMap(selector => {
              const element = document.querySelector(selector);
              return element ? [[selector, parseFloat(getComputedStyle(element).fontSize)]] : [];
            }));
            return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, textOverflow, overlappingLines, tinyTargets, overlaps, sizes, brokenImages: [...document.images].filter(img => !img.naturalWidth).map(img => img.src) };
          });
          const expectedSizes = previousSizes ? Object.fromEntries(Object.entries(previousSizes.sizes).map(([selector, size]) => [selector, size * root / previousSizes.root])) : {};
          const scaled = Object.entries(expectedSizes).every(([selector, size]) => Math.abs(metrics.sizes[selector] - size) < 0.05);
          const passed = response.status() === 200 && metrics.scrollWidth <= metrics.width && !metrics.textOverflow.length && !metrics.overlappingLines.length && !metrics.tinyTargets.length && !metrics.overlaps.length && !metrics.brokenImages.length && scaled;
          results.push({ file, viewport, root, status: response.status(), scaled, passed, ...metrics });
          previousSizes = { root, sizes: metrics.sizes };
          if (["index.html", "littlemoni-privacy-en.html", "timetox-support-en.html"].includes(file) && [320, 1280].includes(viewport.width) && [16, 32].includes(root)) {
            await page.screenshot({ path: "/Users/yi/Developer/Petmoni_Workspace/main/output/playwright/support-reading-" + file.replace(".html", "") + "-" + viewport.width + "-root" + root + "-20261005.png", scale: "css" });
          }
        }
        await page.keyboard.press("Tab");
        const skipFocused = await page.evaluate(() => document.activeElement.classList.contains("skip-link"));
        await page.keyboard.press("Enter");
        const skipDestination = await page.evaluate(() => document.activeElement.id);
        keyboard.push({ file, viewport, root: 32, skipFocused, skipDestination, passed: skipFocused && skipDestination === "main-content" });
        if (file === "index.html") {
          await page.keyboard.press("Tab");
          const productLink = await page.evaluate(() => document.activeElement.getAttribute("href"));
          await page.keyboard.press("Enter");
          const productDestination = await page.evaluate(() => document.activeElement.id);
          keyboard.push({ file, viewport, root: 32, productLink, productDestination, passed: productLink === "#littlemoni" && productDestination === "littlemoni" });
        }
      }
    }
    return { scope: "LOCAL_SOURCE_LAYOUT_AND_KEYBOARD_ONLY", method: "Injected root font sizes simulate a reading-size change; not OS/browser preference, screen-reader, native app, or physical-device validation.", results, keyboard, errors, passed: results.every(r => r.passed) && keyboard.every(r => r.passed) && !errors.length };
  } finally {
    page.off("pageerror", onError);
  }
}
