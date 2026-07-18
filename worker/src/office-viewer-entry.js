import { renderAsync as renderDocx } from 'docx-preview';
import { PptxViewer, RECOMMENDED_ZIP_LIMITS } from '@aiden0z/pptx-renderer';

const host = document.querySelector('[data-office-format][data-office-src]');

if (host) {
  const language = (navigator.languages && navigator.languages[0]) || navigator.language || '';
  const chinese = /^zh(?:-|$)/i.test(language);
  const status = document.createElement('p');
  status.className = 'office-status';
  status.textContent = chinese ? '正在打开文档…' : 'Opening document…';
  host.append(status);

  try {
    const response = await fetch(host.dataset.officeSrc, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    status.remove();
    if (host.dataset.officeFormat === 'docx') {
      await renderDocx(bytes.buffer, host, undefined, { inWrapper: true, breakPages: true });
    } else {
      await PptxViewer.open(bytes, host, {
        renderMode: 'list',
        fitMode: 'contain',
        zipLimits: RECOMMENDED_ZIP_LIMITS
      });
    }
  } catch {
    status.textContent = chinese
      ? '无法在线预览这个文档，请使用下载按钮。'
      : 'This document could not be previewed. Use the download button instead.';
  }
}
