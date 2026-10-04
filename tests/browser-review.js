async (page) => {
  const files = ["index.html","littlemoni-privacy-en.html","littlemoni-privacy-zh.html","littlemoni-terms-en.html","littlemoni-terms-zh.html","petcareproof-privacy-en.html","petcareproof-privacy-zh.html","petcareproof-support-en.html","petcareproof-support-zh.html","petmotion-privacy-en.html","petmotion-support-en.html","privacy-en.html","privacy-zh.html","read-water-privacy-en.html","read-water-privacy-zh.html","read-water-terms-en.html","read-water-terms-zh.html","terms-en.html","terms-zh.html","timetox-privacy-en.html","timetox-support-en.html"];
  const viewports = [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }];
  const base = "http://127.0.0.1:8896/";
  const results = [];
  const errors = [];
  const onError = error => errors.push(String(error));
  page.on("pageerror", onError);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const file of files) {
      const response = await page.goto(base + file);
      await page.evaluate(() => document.fonts.ready);
      if (file === "index.html") {
        for (const img of await page.locator("img").all()) await img.scrollIntoViewIfNeeded();
        await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      const metrics = await page.evaluate(() => {
        const overflow = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.textContent.trim() || node.parentElement.closest(".skip-link")) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (rect.width && (rect.left < -1 || rect.right > innerWidth + 1)) overflow.push(node.textContent.trim().slice(0, 80));
          }
        }
        return {
          scrollWidth: document.documentElement.scrollWidth,
          width: innerWidth,
          textOverflow: overflow,
          mainCount: document.querySelectorAll("main").length,
          h1Count: document.querySelectorAll("h1").length,
          h1FontSize: getComputedStyle(document.querySelector("h1")).fontSize,
          bodyFontFamily: getComputedStyle(document.body).fontFamily,
          brokenImages: [...document.images].filter(img => !img.complete || !img.naturalWidth).map(img => img.src),
          shortNavTargets: [...document.querySelectorAll("nav a, .documents a")].filter(a => a.getBoundingClientRect().height < 44).length
        };
      });
      results.push({ file, viewport, status: response.status(), ...metrics });
      if (["index.html", "littlemoni-privacy-en.html", "petcareproof-support-zh.html", "timetox-support-en.html"].includes(file)) {
        await page.screenshot({ path: "output/playwright/legacy-support-" + file.replace(".html", "") + "-" + viewport.width + "-20261004.png", scale: "css" });
      }
    }
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(base + "index.html");
  await page.keyboard.press("Tab");
  const skipFocused = await page.evaluate(() => document.activeElement.classList.contains("skip-link"));
  await page.keyboard.press("Enter");
  const skipDestination = await page.evaluate(() => document.activeElement.id);
  const zoom = [];
  for (const file of ["index.html", "timetox-support-en.html", "littlemoni-privacy-zh.html"]) {
    await page.goto(base + file);
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll("*")].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = (size * 2) + "px";
    });
    zoom.push({ file, ...(await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))) });
  }
  page.off("pageerror", onError);
  const report = { scope: "LOCAL_BROWSER_LAYOUT_ONLY", results, errors, skipFocused, skipDestination, zoom };
  report.passed = !results.some(r => r.status !== 200 || r.scrollWidth > r.width || r.textOverflow.length || r.mainCount !== 1 || r.h1Count !== 1 || r.brokenImages.length || r.shortNavTargets) && !errors.length && skipFocused && skipDestination === "main-content" && !zoom.some(r => r.scrollWidth > r.width);
  return report;
}
