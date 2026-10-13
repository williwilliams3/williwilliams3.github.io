// Render the thesis notation in the locally bundled TeX-style math font.
(() => {
  'use strict';
  for (const element of document.querySelectorAll('.tex')) {
    const source = element.textContent.trim();
    try {
      window.katex.render(source, element, {
        displayMode: element.dataset.display === 'true',
        output: 'htmlAndMathml',
        throwOnError: true,
        trust: false,
      });
    } catch (error) {
      element.dataset.mathError = 'true';
      console.error('Could not render equation:', source, error);
    }
  }
})();
