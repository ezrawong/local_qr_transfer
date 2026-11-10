'use strict';

const QRCode = require('qrcode/lib/core/qrcode');
const { decodeImage } = require('./qr-decoder');
const { MAX_FILE_SIZE, encodeManifest, encodePacket, parsePacket, Receiver, sha256 } = require('./protocol');
const $ = id => document.getElementById(id);
const receiver = new Receiver();
const scanCanvas = document.createElement('canvas');
const scanContext = scanCanvas.getContext('2d', { willReadFrequently: true });
let send = null;
let selectedFile = null;
let sendEpoch = 0;
let playTimer = null;
let playing = false;
let stream = null;
let cameraEpoch = 0;
let scanTimer = null;
let detector = null;
let scanMode = 'local';
let receiveEpoch = 0;
let finishing = false;
let completed = false;
let downloadUrl = null;
let lastScanMessage = '';
let lastScanMessageAt = 0;

function status(id, text, kind = '') {
  $(id).textContent = text;
  $(id).className = `status ${kind}`;
}

function formatSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MiB`;
}

function errorMessage(error) {
  return error instanceof Error || error instanceof DOMException ? error.message : String(error);
}

function pauseSender() {
  playing = false;
  clearTimeout(playTimer);
  playTimer = null;
  $('play').textContent = '開始播放';
}

function selectFile(file) {
  pauseSender();
  sendEpoch++;
  selectedFile = file || null;
  send = null;
  $('encoding-settings').disabled = false;
  $('prepare').disabled = !file || file.size > MAX_FILE_SIZE;
  $('play').disabled = true;
  $('jump').disabled = true;
  $('jump-index').disabled = true;
  $('qr-canvas').hidden = true;
  $('qr-placeholder').hidden = false;
  $('send-progress').value = 0;
  $('send-counter').textContent = '等待產生 QR';
  $('send-details').textContent = '循環傳送 · 自動分段';
  $('file-info').textContent = file ? `${file.name} · ${formatSize(file.size)}` : '未選擇檔案';
  status('send-status', file && file.size > MAX_FILE_SIZE ? '檔案超過 64 MiB 上限。請選擇較細檔案。' : '揀好編碼設定後，按「產生 QR」。', file && file.size > MAX_FILE_SIZE ? 'error' : '');
}

function packetAt(index) {
  return encodePacket(send.manifest, index, send.bytes.subarray(index * send.chunkSize, (index + 1) * send.chunkSize));
}

function renderQR() {
  const text = packetAt(send.index);
  let qr = send.cache.get(send.index);
  if (!qr) {
    // Explicit byte mode keeps every packet predictable and avoids automatic segmentation.
    qr = QRCode.create([{ data: text, mode: 'byte' }], { errorCorrectionLevel: send.ecc, version: send.version });
    if (send.cache.size >= 12) send.cache.delete(send.cache.keys().next().value);
    send.cache.set(send.index, qr);
  }
  const canvas = $('qr-canvas');
  const modules = qr.modules.size;
  const pixels = Math.max(1, Math.floor(Number($('qr-size').value) / (modules + 8)));
  canvas.width = canvas.height = Number($('qr-size').value);
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000';
  const margin = Math.floor((canvas.width - modules * pixels) / 2);
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (qr.modules.get(row, col)) context.fillRect(margin + col * pixels, margin + row * pixels, pixels, pixels);
    }
  }
  canvas.hidden = false;
  $('qr-placeholder').hidden = true;
  $('send-counter').textContent = `第 ${send.index + 1} / ${send.total} 段 · 第 ${send.round} 輪`;
  const seconds = send.total / Number($('frequency').value);
  $('send-details').textContent = `QR v${qr.version} · ${modules} × ${modules} · 每輪約 ${seconds < 60 ? `${seconds.toFixed(1)} 秒` : `${(seconds / 60).toFixed(1)} 分鐘`}`;
  $('send-progress').max = send.total;
  $('send-progress').value = send.index + 1;
  $('jump-index').value = send.index + 1;
}

function scheduleFrame() {
  clearTimeout(playTimer);
  if (!playing || document.hidden) return;
  playTimer = setTimeout(() => {
    if (!playing || !send) return;
    send.index = (send.index + 1) % send.total;
    if (send.index === 0) send.round++;
    try {
      renderQR();
      scheduleFrame();
    } catch (error) {
      pauseSender();
      status('send-status', `無法產生 QR：${errorMessage(error)}。請減少每段資料量或降低容錯率。`, 'error');
    }
  }, 1000 / Number($('frequency').value));
}

async function prepareSender() {
  if (!selectedFile) return;
  const file = selectedFile;
  const epoch = ++sendEpoch;
  pauseSender();
  $('prepare').disabled = true;
  $('play').disabled = true;
  $('jump').disabled = true;
  $('jump-index').disabled = true;
  $('qr-canvas').hidden = true;
  $('qr-placeholder').hidden = false;
  $('encoding-settings').disabled = true;
  status('send-status', '正在讀取檔案及計算 SHA-256…');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const hash = await sha256(bytes);
    if (epoch !== sendEpoch) return;
    const random = new Uint8Array(12);
    crypto.getRandomValues(random);
    const chunkSize = Number($('chunk-size').value);
    const meta = {
      id: Array.from(random, value => value.toString(16).padStart(2, '0')).join(''),
      name: file.name,
      type: file.type.slice(0, 128),
      size: bytes.length,
      chunkSize,
      hash
    };
    send = {
      bytes, manifest: encodeManifest(meta), chunkSize, ecc: $('ecc').value,
      total: Math.max(1, Math.ceil(bytes.length / chunkSize)), index: 0, round: 1, cache: new Map()
    };
    // Reserve room for the longest index and a full chunk, keeping all QR grids the same size.
    const maximumPacket = encodePacket(send.manifest, send.total - 1, bytes.subarray(0, chunkSize));
    send.version = QRCode.create([{ data: maximumPacket, mode: 'byte' }], { errorCorrectionLevel: send.ecc }).version;
    renderQR();
    $('jump-index').max = send.total;
    $('play').disabled = false;
    $('jump').disabled = false;
    $('jump-index').disabled = false;
    status('send-status', 'QR 已準備好。接收端開啟鏡頭後，按「開始播放」。');
  } catch (error) {
    if (epoch !== sendEpoch) return;
    send = null;
    status('send-status', `無法準備檔案：${errorMessage(error)}。如 QR 容量不足，請減少每段資料量、降低容錯率或縮短檔名。`, 'error');
  } finally {
    if (epoch === sendEpoch) {
      $('prepare').disabled = false;
      $('encoding-settings').disabled = false;
    }
  }
}

function updateReceiveProgress() {
  $('receive-counter').textContent = `${receiver.received} / ${receiver.total} 段`;
  $('receive-percent').textContent = `${receiver.total ? (receiver.received * 100 / receiver.total).toFixed(1) : '0'}%`;
  $('receive-progress').max = receiver.total || 1;
  $('receive-progress').value = receiver.received;
  $('receive-file').textContent = receiver.meta ? `${receiver.meta.name} · ${formatSize(receiver.meta.size)}` : '等待第一個 QR';
  $('missing').textContent = receiver.total && receiver.received < receiver.total ? `尚欠段數：${receiver.missingRanges()}（可於傳送端跳轉）` : '';
}

function scanMessage(text, kind = '') {
  const now = Date.now();
  if (text === lastScanMessage && now - lastScanMessageAt < 1500) return;
  lastScanMessage = text;
  lastScanMessageAt = now;
  status('receive-status', text, kind);
}

async function consume(text) {
  if (completed || finishing) return false;
  let packet;
  try {
    packet = parsePacket(text);
  } catch (error) {
    scanMessage(`忽略損壞或不支援嘅 QR：${errorMessage(error)}`, 'error');
    return false;
  }
  if (!packet) return false;
  const result = receiver.accept(packet);
  if (result.foreign) {
    scanMessage('偵測到另一個傳送。為免混合檔案，已忽略；如要接收新檔案，請先清除接收進度。', 'error');
    return true;
  }
  if (!result.added) return true;
  updateReceiveProgress();
  status('receive-status', `接收中 · 已讀取 ${formatSize(receiver.bytes)}。遺漏嘅段會喺下一輪補齊。`);
  if (result.complete) {
    finishing = true;
    const epoch = receiveEpoch;
    status('receive-status', '所有段已收到，正在驗證 SHA-256…');
    try {
      const bytes = receiver.assemble();
      const expected = receiver.meta.hash;
      const name = receiver.meta.name.replace(/[\\/\u0000-\u001f\u007f]/g, '_');
      const hash = await sha256(bytes);
      if (epoch !== receiveEpoch) return true;
      if (hash !== expected) {
        stopCamera();
        status('receive-status', 'SHA-256 不一致，檔案已拒絕下載。請清除接收進度後重新傳送。', 'error');
        completed = true;
        return true;
      }
      // Download as an attachment, never display or execute a received file.
      downloadUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
      $('download').href = downloadUrl;
      $('download').download = name || 'received-file';
      $('download').hidden = false;
      completed = true;
      stopCamera();
      status('receive-status', `接收完成，SHA-256 驗證一致。\n${hash}\n請按「下載檔案」儲存；只開啟可信來源嘅檔案。`, 'success');
    } catch (error) {
      if (epoch === receiveEpoch) {
        completed = true;
        stopCamera();
        status('receive-status', `組合檔案失敗：${errorMessage(error)}。請清除接收進度再試。`, 'error');
      }
    } finally {
      if (epoch === receiveEpoch) finishing = false;
    }
  }
  return true;
}

function resetReceiver() {
  receiveEpoch++;
  receiver.reset();
  finishing = false;
  completed = false;
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;
  $('download').hidden = true;
  $('download').removeAttribute('href');
  updateReceiveProgress();
  status('receive-status', '接收進度已清除，可以接收新檔案。');
}

async function configureDecoder() {
  const wanted = $('scanner-mode').value;
  detector = null;
  scanMode = 'local';
  if (wanted !== 'local' && typeof globalThis.BarcodeDetector === 'function') {
    const supported = await globalThis.BarcodeDetector.getSupportedFormats();
    if (supported.includes('qr_code')) {
      detector = new globalThis.BarcodeDetector({ formats: ['qr_code'] });
      scanMode = 'native';
    }
  }
  if (wanted === 'native' && !detector) throw new Error('呢個瀏覽器未提供原生 QR BarcodeDetector。請選「自動」或「本地自寫解碼器」。');
  $('decoder-info').textContent = scanMode === 'native' ? '目前使用瀏覽器原生 QR 掃描器；所有影像只喺本機處理。' : '目前使用本地自寫 QR 解碼器。請保持鏡頭正面及清晰，建議 2–4 QR/s。';
}

function drawScanSource(source, width, height) {
  // Retain detail on dense symbols but cap CPU work on very high-resolution cameras.
  const scale = Math.min(1, 1600 / Math.max(width, height));
  scanCanvas.width = Math.max(1, Math.round(width * scale));
  scanCanvas.height = Math.max(1, Math.round(height * scale));
  scanContext.drawImage(source, 0, 0, scanCanvas.width, scanCanvas.height);
}

async function readCanvas() {
  if (detector) {
    const results = await detector.detect(scanCanvas);
    return results.map(result => result.rawValue);
  }
  const text = decodeImage(scanContext.getImageData(0, 0, scanCanvas.width, scanCanvas.height));
  return text === null ? [] : [text];
}

async function scanFrame(epoch) {
  if (!stream || epoch !== cameraEpoch) return;
  try {
    if ($('video').readyState >= 2 && !document.hidden) {
      drawScanSource($('video'), $('video').videoWidth, $('video').videoHeight);
      const results = await readCanvas();
      if (epoch !== cameraEpoch) return;
      for (const text of results) await consume(text);
    }
  } catch (error) {
    if (epoch !== cameraEpoch) return;
    if (scanMode === 'native' && $('scanner-mode').value === 'auto') {
      detector = null;
      scanMode = 'local';
      $('decoder-info').textContent = `原生掃描失敗，已切換本地解碼器：${errorMessage(error)}`;
    } else {
      stopCamera();
      status('receive-status', `掃描失敗：${errorMessage(error)}`, 'error');
    }
  } finally {
    if (stream && epoch === cameraEpoch) scanTimer = setTimeout(() => scanFrame(epoch), 60);
  }
}

function stopCamera() {
  cameraEpoch++;
  clearTimeout(scanTimer);
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null;
  $('video').srcObject = null;
  $('video').hidden = true;
  $('camera-placeholder').hidden = false;
  $('start-camera').disabled = false;
  $('stop-camera').disabled = true;
  $('camera-select').disabled = false;
  $('camera-resolution').disabled = false;
  $('scanner-mode').disabled = false;
  $('camera-state').textContent = '鏡頭未開啟';
}

async function startCamera() {
  stopCamera();
  if (completed) {
    status('receive-status', '上一個接收已完成或已拒絕。請先下載檔案或清除接收進度，再開啟新接收。');
    return;
  }
  const epoch = cameraEpoch;
  $('start-camera').disabled = true;
  $('camera-select').disabled = true;
  $('camera-resolution').disabled = true;
  $('scanner-mode').disabled = true;
  status('receive-status', '正在要求鏡頭權限…');
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('目前環境無法使用 camera API。請改用支援鏡頭嘅 Chrome / Edge，並經 HTTPS／localhost 開啟，或匯入 QR 截圖。');
    }
    await configureDecoder();
    if (epoch !== cameraEpoch) return;
    const width = Number($('camera-resolution').value);
    const deviceId = $('camera-select').value;
    const acquired = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: width }, height: { ideal: width === 640 ? 480 : width * 9 / 16 },
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } })
      }
    });
    if (epoch !== cameraEpoch) {
      acquired.getTracks().forEach(track => track.stop());
      return;
    }
    stream = acquired;
    $('video').srcObject = stream;
    await $('video').play();
    if (epoch !== cameraEpoch) return;
    $('video').hidden = false;
    $('camera-placeholder').hidden = true;
    $('stop-camera').disabled = false;
    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();
    $('camera-state').textContent = `${settings.width || '?'} × ${settings.height || '?'}`;
    track.addEventListener('ended', () => {
      if (epoch === cameraEpoch) {
        stopCamera();
        status('receive-status', '鏡頭已中斷；接收進度仍保留，可以重新開啟鏡頭。', 'error');
      }
    });
    status('receive-status', '鏡頭已開啟，請對準傳送端 QR。');
    scanFrame(epoch);
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (epoch !== cameraEpoch) return;
    $('camera-select').replaceChildren(new Option('預設鏡頭', ''));
    for (const device of devices.filter(item => item.kind === 'videoinput')) {
      $('camera-select').add(new Option(device.label || `鏡頭 ${$('camera-select').length}`, device.deviceId));
    }
    $('camera-select').value = settings.deviceId || '';
  } catch (error) {
    if (epoch !== cameraEpoch) return;
    stopCamera();
    const hint = error.name === 'NotAllowedError' ? '請允許鏡頭權限；如直接開 HTML 被封鎖，請改經 HTTPS／localhost 開啟。' : '';
    status('receive-status', `無法開啟鏡頭：${errorMessage(error)} ${hint}`, 'error');
  }
}

async function importImages(files) {
  // Serialize screenshot scanning with camera scanning and decoder configuration.
  stopCamera();
  const epoch = receiveEpoch;
  $('image-input').disabled = true;
  $('start-camera').disabled = true;
  try {
    await configureDecoder();
    let found = 0;
    for (const file of files) {
      if (epoch !== receiveEpoch || completed) break;
      if (file.size > 32 * 1024 * 1024) throw new Error(`圖片 ${file.name} 超過 32 MiB 上限。`);
      const image = await createImageBitmap(file);
      try {
        if (image.width * image.height > 32 * 1024 * 1024) throw new Error('圖片解析度過大，請先裁剪 QR 範圍。');
        drawScanSource(image, image.width, image.height);
        const texts = await readCanvas();
        if (epoch !== receiveEpoch) break;
        for (const text of texts) if (await consume(text)) found++;
      } finally {
        image.close();
      }
    }
    if (epoch === receiveEpoch && !completed && !finishing && found === 0) {
      status('receive-status', '未能讀到有效傳送 QR。請確認圖片完整、清晰，並保留 QR 白邊。', 'error');
    }
  } catch (error) {
    if (epoch === receiveEpoch) status('receive-status', `匯入圖片失敗：${errorMessage(error)}`, 'error');
  } finally {
    $('image-input').disabled = false;
    $('image-input').value = '';
    $('start-camera').disabled = false;
  }
}

for (const tab of ['send', 'receive']) {
  $(`${tab}-tab`).addEventListener('click', () => {
    for (const item of ['send', 'receive']) {
      $(`${item}-panel`).hidden = item !== tab;
      $(`${item}-tab`).setAttribute('aria-pressed', String(item === tab));
    }
    if (tab === 'receive') pauseSender();
    else stopCamera();
  });
}
$('file-input').addEventListener('change', event => selectFile(event.target.files[0]));
for (const type of ['dragenter', 'dragover']) {
  $('drop-zone').addEventListener(type, event => {
    event.preventDefault();
    $('drop-zone').classList.add('dragging');
  });
}
for (const type of ['dragleave', 'drop']) {
  $('drop-zone').addEventListener(type, event => {
    event.preventDefault();
    $('drop-zone').classList.remove('dragging');
    if (type === 'drop') selectFile(event.dataTransfer.files[0]);
  });
}
$('prepare').addEventListener('click', prepareSender);
$('play').addEventListener('click', () => {
  if (!send) return;
  if (playing) pauseSender();
  else {
    playing = true;
    $('play').textContent = '暫停播放';
    status('send-status', '循環播放中；呢度唔會知道對方是否收齊，請留意接收端進度。');
    scheduleFrame();
  }
});
$('frequency').addEventListener('input', () => {
  $('frequency-value').textContent = `${$('frequency').value} QR/s`;
  if (send) renderQR();
  scheduleFrame();
});
$('qr-size').addEventListener('input', () => {
  $('qr-size-value').textContent = `${$('qr-size').value} px`;
  if (send) renderQR();
});
$('jump').addEventListener('click', () => {
  if (!send) return;
  const index = Number($('jump-index').value);
  if (!Number.isInteger(index) || index < 1 || index > send.total) {
    status('send-status', `請輸入 1 至 ${send.total} 嘅整數。`, 'error');
    return;
  }
  send.index = index - 1;
  renderQR();
  scheduleFrame();
});
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if ($('qr-stage').requestFullscreen) await $('qr-stage').requestFullscreen();
    else status('send-status', '呢個瀏覽器未提供全螢幕功能，請用瀏覽器全螢幕模式。', 'error');
  } catch (error) {
    status('send-status', `無法進入全螢幕：${errorMessage(error)}`, 'error');
  }
});
$('start-camera').addEventListener('click', startCamera);
$('stop-camera').addEventListener('click', stopCamera);
$('reset-receiver').addEventListener('click', () => {
  if (receiver.received && !globalThis.confirm('清除所有已接收資料及下載連結？')) return;
  resetReceiver();
});
$('image-input').addEventListener('change', event => importImages(Array.from(event.target.files)));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(playTimer);
  else scheduleFrame();
});
window.addEventListener('pagehide', () => {
  pauseSender();
  stopCamera();
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
});
