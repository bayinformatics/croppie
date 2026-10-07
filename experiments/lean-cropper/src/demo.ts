import { LeanCropper, type CropState } from './core';
import { toBlob } from './export';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const scale = (s: CropState) => Math.sqrt(Math.abs(s.transform[0] * s.transform[3] - s.transform[1] * s.transform[2]));
const angle = (s: CropState) => Math.atan2(s.transform[1], s.transform[0]) * 180 / Math.PI;
const status = $('status'), result = $('result');
let resultURL: string | undefined;
const cropper = new LeanCropper($('editor'), { onChange(s) {
  input('angle').value = String(angle(s));
  $('degrees').textContent = `${angle(s).toFixed(1)}°`;
  input('zoom').value = (100 * scale(s)).toFixed(1);
  input('width').value = s.viewport.width.toFixed(1); input('height').value = s.viewport.height.toFixed(1);
  input('width').max = String(s.stage.width); input('height').max = String(s.stage.height);
} });

async function run(work: () => unknown) {
  try { await work(); } catch (e) { if ((e as Error).name !== 'AbortError') status.textContent = (e as Error).message; }
}
async function load(source: Blob | string) {
  status.textContent = 'Loading image…';
  await run(async () => {
    const s = await cropper.load(source);
    for (const id of ['image-controls', 'crop-controls', 'export']) $<HTMLFieldSetElement>(id).disabled = false;
    $<HTMLSelectElement>('aspect').value = '';
    status.textContent = `${s.image.width} × ${s.image.height} image ready. Empty crop areas will be transparent.`;
    result.replaceChildren(); if (resultURL) URL.revokeObjectURL(resultURL);
  });
}
input('file').onchange = () => { const file = input('file').files?.[0]; if (file) void load(file); };
input('angle').oninput = () => { const value = input('angle').valueAsNumber; void run(() => cropper.rotate(value - angle(cropper.getState()))); };
input('zoom').onchange = () => void run(() => cropper.zoom(input('zoom').valueAsNumber / 100 / scale(cropper.getState())));
$('flip-x').onclick = () => cropper.flip('horizontal'); $('flip-y').onclick = () => cropper.flip('vertical');
$('aspect').onchange = () => cropper.setAspect(Number($<HTMLSelectElement>('aspect').value) || null);
for (const key of ['width', 'height'] as const) input(key).onchange = () => void run(() => {
  const s = cropper.getState(), v = { ...s.viewport, [key]: input(key).valueAsNumber };
  if (key === 'height' && s.aspect) v.width = v.height * s.aspect;
  cropper.setViewport(v);
});
$('reset').onclick = () => cropper.reset();
$('export').onclick = () => void run(async () => {
  const blob = await toBlob(cropper);
  if (resultURL) URL.revokeObjectURL(resultURL);
  resultURL = URL.createObjectURL(blob);
  const image = new Image(); image.src = resultURL; image.alt = 'Exported crop';
  await image.decode();
  const content = document.createElement('div'), text = document.createElement('p'), link = document.createElement('a');
  text.textContent = `${image.naturalWidth} × ${image.naturalHeight} PNG, ${(blob.size / 1024).toFixed(1)} KB`;
  link.href = resultURL; link.download = 'crop.png'; link.className = 'download'; link.textContent = 'Download PNG';
  content.append(text, link); result.replaceChildren(image, content); status.textContent = 'Crop exported. Download it below the preview.';
});
window.addEventListener('pagehide', event => { if (!event.persisted) { cropper.destroy(); if (resultURL) URL.revokeObjectURL(resultURL); } });
void load('./sample.svg');
