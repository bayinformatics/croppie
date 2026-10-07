import { LeanCropper, type CropState } from './core';
import { toBlob } from './export';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const select = (id: string) => $<HTMLSelectElement>(id);
const scale = (s: CropState) => Math.sqrt(Math.abs(s.transform[0] * s.transform[3] - s.transform[1] * s.transform[2]));
const angle = (s: CropState) => Math.atan2(s.transform[1], s.transform[0]) * 180 / Math.PI;
const status = $('status'), result = $('result');
let resultURL: string | undefined;
let loadGeneration = 0, exportGeneration = 0, hasImage = false;

function showState(s: CropState) {
  input('angle').value = String(angle(s));
  $('degrees').textContent = `${angle(s).toFixed(1)}°`;
  input('zoom').value = (100 * scale(s)).toFixed(1);
  input('width').value = s.viewport.width.toFixed(1); input('height').value = s.viewport.height.toFixed(1);
  input('width').max = String(s.stage.width); input('height').max = String(s.stage.height);
  select('aspect').value = s.aspect === null ? '' : String(s.aspect);
  select('mask').value = s.mask ?? 'rect';
}
const cropper = new LeanCropper($('editor'), { coverage: 'fill', onChange: showState });
function controls(disabled: boolean) {
  for (const id of ['image-controls', 'crop-controls', 'export']) $<HTMLFieldSetElement>(id).disabled = disabled;
}
function clearResult() {
  result.replaceChildren(); if (resultURL) URL.revokeObjectURL(resultURL); resultURL = undefined;
}
async function run(work: () => unknown) {
  try { await work(); } catch (e) {
    if ((e as Error).name !== 'AbortError') status.textContent = (e as Error).message;
    if (hasImage) showState(cropper.getState());
  }
}
async function load(source: Blob | string) {
  const generation = ++loadGeneration; exportGeneration++;
  status.textContent = 'Loading image…'; controls(true);
  try {
    const s = await cropper.load(source);
    if (generation !== loadGeneration) return;
    hasImage = true; controls(false); clearResult();
    status.textContent = `${s.image.width} × ${s.image.height} image ready. Choose coverage and crop shape, then export.`;
  } catch (error) {
    if (generation !== loadGeneration) return;
    controls(!hasImage);
    if ((error as Error).name !== 'AbortError') status.textContent = (error as Error).message;
  }
}
input('file').onchange = () => { const file = input('file').files?.[0]; if (file) void load(file); };
input('angle').oninput = () => { const value = input('angle').valueAsNumber; void run(() => cropper.rotate(value - angle(cropper.getState()))); };
input('zoom').onchange = () => void run(() => cropper.zoom(input('zoom').valueAsNumber / 100 / scale(cropper.getState())));
$('flip-x').onclick = () => void run(() => cropper.flip('horizontal'));
$('flip-y').onclick = () => void run(() => cropper.flip('vertical'));
$('aspect').onchange = () => void run(() => cropper.setAspect(Number(select('aspect').value) || null));
$('coverage').onchange = () => void run(() => cropper.setCoverage(select('coverage').value as 'fill' | 'free'));
$('mask').onchange = () => void run(() => cropper.setMask(select('mask').value as 'rect' | 'circle'));
for (const key of ['width', 'height'] as const) input(key).onchange = () => void run(() => {
  const s = cropper.getState(), v = { ...s.viewport, [key]: input(key).valueAsNumber };
  if (key === 'height' && s.aspect) v.width = v.height * s.aspect;
  cropper.setViewport(v);
});
$('reset').onclick = () => void run(() => cropper.reset());
$('export').onclick = () => void run(async () => {
  const generation = ++exportGeneration;
  $<HTMLButtonElement>('export').disabled = true;
  status.textContent = 'Exporting crop…';
  let url: string | undefined;
  try {
    const blob = await toBlob(cropper, { width: input('export-width').valueAsNumber });
    if (generation !== exportGeneration) return;
    const image = new Image(); url = URL.createObjectURL(blob); image.src = url; image.alt = 'Exported crop';
    await image.decode();
    if (generation !== exportGeneration) return;
    clearResult(); resultURL = url; url = undefined;
    const content = document.createElement('div'), text = document.createElement('p'), link = document.createElement('a');
    text.textContent = `${image.naturalWidth} × ${image.naturalHeight} PNG, ${(blob.size / 1024).toFixed(1)} KB`;
    link.href = resultURL; link.download = 'crop.png'; link.className = 'download'; link.textContent = 'Download PNG';
    content.append(text, link); result.replaceChildren(image, content); status.textContent = 'Crop exported. Download it below the preview.';
  } finally {
    if (url) URL.revokeObjectURL(url);
    if (generation === exportGeneration) $<HTMLButtonElement>('export').disabled = !hasImage;
  }
});
window.addEventListener('pagehide', event => {
  if (!event.persisted) { loadGeneration++; exportGeneration++; cropper.destroy(); clearResult(); }
});
void load('./sample.svg');
