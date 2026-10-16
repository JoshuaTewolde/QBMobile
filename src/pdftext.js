// Extract plain text from a PDF, one line per output line.
// Takes the pdf.js module as an argument so the same code runs in the browser and in Node tests.

export async function extractText(pdfjs, data) {
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    let text = '';
    for (const item of content.items) {
      text += item.str;
      if (item.hasEOL) text += '\n';
    }
    pages.push(text);
  }
  await task.destroy();
  return pages.join('\n');
}
