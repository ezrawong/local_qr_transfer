'use strict';

// All user-facing strings, in Traditional Chinese (zh) and English (en).
// Values are either a plain string or a function returning a string.
// This module is bundled into the single self-contained HTML by scripts/build.js.

const STRINGS = {
  zh: {
    // document / chrome
    doc_title: '光傳 · Local QR Transfer',
    html_lang: 'zh-Hant',
    lang_toggle: 'EN',
    lang_toggle_aria: '切換語言 / Switch language',
    tagline: '一個檔案，一束光。唔經網絡，唔上雲端。',
    nav_label: '功能',
    send_tab: '↗ 傳送檔案',
    receive_tab: '↙ 接收檔案',
    // send panel
    send_h2: '將檔案變成動態 QR',
    send_intro: '另一部電腦開啟同一個 HTML，選「接收檔案」，對準螢幕即可。',
    drop_strong: '揀選或拖放檔案',
    drop_hint: '任何格式 · 最大 64 MiB',
    file_none: '未選擇檔案',
    enc_legend: '編碼設定',
    chunk_label: '每段資料量',
    chunk_hint: '較細較易掃描',
    ecc_label: '容錯率',
    ecc_l: 'L · 約 7%',
    ecc_m: 'M · 約 15%',
    ecc_q: 'Q · 約 25%',
    ecc_h: 'H · 約 30%',
    play_legend: '播放設定',
    play_hint: '可即時調整',
    freq_label: '切換頻率',
    qrsize_label: 'QR 解析度',
    prepare: '產生 QR',
    play_start: '開始播放',
    play_pause: '暫停播放',
    jump_label: '跳到指定段（由 1 開始）',
    jump_btn: '跳轉',
    send_hint_loop: 'QR 會循環播放；接收端會去除重複段。接收端完成後先停止傳送。大型檔案會需要較長時間。',
    send_display: '傳送畫面',
    fullscreen: '全螢幕',
    qr_placeholder: '準備好檔案後，QR 會顯示喺呢度',
    qr_canvas_aria: '檔案傳送 QR code',
    send_waiting: '等待檔案',
    send_waiting_generate: '等待產生 QR',
    send_details_loop: '循環傳送 · 自動分段',
    send_progress_aria: '目前播放段',
    send_status_local: '所有處理只會喺呢個瀏覽器進行。',
    // receive panel
    recv_h2: '用鏡頭接收檔案',
    recv_intro: '對準另一部電腦嘅 QR；即使漏咗幾段，下一輪都會自動補齊。',
    camera_label: '鏡頭',
    default_camera: '預設鏡頭',
    camera_res_label: '鏡頭解析度',
    scanner_mode_label: '掃描方式',
    scan_auto: '自動 · 原生優先',
    scan_local: '本地自寫解碼器',
    scan_native: '只用瀏覽器原生',
    start_camera: '開啟鏡頭',
    stop_camera: '停止',
    decoder_info_init: '原生 BarcodeDetector 或本地解碼，無需下載任何掃描 library。',
    image_picker: '亦可匯入 QR 截圖（可多選）',
    reset_receiver: '清除接收進度',
    notice_title: '鏡頭權限',
    notice_body: '直接開 HTML 能否使用鏡頭視乎瀏覽器政策。建議 Chrome / Edge，並允許鏡頭權限；如被限制，請經 HTTPS 或 localhost 開啟。匯入截圖不需要鏡頭權限。',
    recv_hint: '建議從 2–4 QR/s 開始，鏡頭保持正面，QR 連同四邊白邊完整入鏡。模糊或漏段時降低頻率／資料量、增加 QR 尺寸。',
    recv_display: '接收畫面',
    camera_off: '鏡頭未開啟',
    camera_placeholder: '開啟鏡頭，對準傳送端',
    recv_counter_init: '0 / 0 段',
    recv_progress_aria: '接收進度',
    recv_file_waiting: '等待第一個 QR',
    recv_status_none: '未接收任何資料。',
    download: '下載檔案',
    footer_line1: 'OFFLINE BY DESIGN · 沒有帳戶，沒有伺服器，沒有資料上傳。',
    footer_line2: '注意：QR 並無加密，任何拍到畫面嘅人都有機會重組檔案。',
    // dynamic
    file_too_large: '檔案超過 64 MiB 上限。請選擇較細檔案。',
    send_status_pick_settings: '揀好編碼設定後，按「產生 QR」。',
    send_counter_segment: (i, total, round) => `第 ${i} / ${total} 段 · 第 ${round} 輪`,
    time_seconds: s => `${s} 秒`,
    time_minutes: m => `${m} 分鐘`,
    send_details_qr: (version, modules, time) => `QR v${version} · ${modules} × ${modules} · 每輪約 ${time}`,
    qr_fail_generate: e => `無法產生 QR：${e}。請減少每段資料量或降低容錯率。`,
    reading_hashing: '正在讀取檔案及計算 SHA-256…',
    qr_ready: 'QR 已準備好。接收端開啟鏡頭後，按「開始播放」。',
    prepare_fail: e => `無法準備檔案：${e}。如 QR 容量不足，請減少每段資料量、降低容錯率或縮短檔名。`,
    receive_counter: (recv, total) => `${recv} / ${total} 段`,
    missing_segments: ranges => `尚欠段數：${ranges}（可於傳送端跳轉）`,
    ignore_bad_qr: e => `忽略損壞或不支援嘅 QR：${e}`,
    foreign_transfer: '偵測到另一個傳送。為免混合檔案，已忽略；如要接收新檔案，請先清除接收進度。',
    receiving: size => `接收中 · 已讀取 ${size}。遺漏嘅段會喺下一輪補齊。`,
    all_received_verify: '所有段已收到，正在驗證 SHA-256…',
    hash_mismatch: 'SHA-256 不一致，檔案已拒絕下載。請清除接收進度後重新傳送。',
    receive_complete: hash => `接收完成，SHA-256 驗證一致。\n${hash}\n請按「下載檔案」儲存；只開啟可信來源嘅檔案。`,
    assemble_fail: e => `組合檔案失敗：${e}。請清除接收進度再試。`,
    progress_cleared: '接收進度已清除，可以接收新檔案。',
    native_unavailable: '呢個瀏覽器未提供原生 QR BarcodeDetector。請選「自動」或「本地自寫解碼器」。',
    decoder_native: '目前使用瀏覽器原生 QR 掃描器；所有影像只喺本機處理。',
    decoder_local: '目前使用本地自寫 QR 解碼器。請保持鏡頭正面及清晰，建議 2–4 QR/s。',
    native_fail_switch: e => `原生掃描失敗，已切換本地解碼器：${e}`,
    scan_fail: e => `掃描失敗：${e}`,
    prev_receive_done: '上一個接收已完成或已拒絕。請先下載檔案或清除接收進度，再開啟新接收。',
    requesting_camera: '正在要求鏡頭權限…',
    camera_api_unavailable: '目前環境無法使用 camera API。請改用支援鏡頭嘅 Chrome / Edge，並經 HTTPS／localhost 開啟，或匯入 QR 截圖。',
    camera_interrupted: '鏡頭已中斷；接收進度仍保留，可以重新開啟鏡頭。',
    camera_n: n => `鏡頭 ${n}`,
    camera_permission_hint: '請允許鏡頭權限；如直接開 HTML 被封鎖，請改經 HTTPS／localhost 開啟。',
    camera_open_fail: (e, hint) => `無法開啟鏡頭：${e} ${hint}`,
    camera_opened: '鏡頭已開啟，請對準傳送端 QR。',
    image_too_large: name => `圖片 ${name} 超過 32 MiB 上限。`,
    image_resolution_large: '圖片解析度過大，請先裁剪 QR 範圍。',
    no_valid_qr: '未能讀到有效傳送 QR。請確認圖片完整、清晰，並保留 QR 白邊。',
    import_fail: e => `匯入圖片失敗：${e}`,
    loop_playing: '循環播放中；呢度唔會知道對方是否收齊，請留意接收端進度。',
    jump_range: total => `請輸入 1 至 ${total} 嘅整數。`,
    fullscreen_unavailable: '呢個瀏覽器未提供全螢幕功能，請用瀏覽器全螢幕模式。',
    fullscreen_fail: e => `無法進入全螢幕：${e}`,
    confirm_clear: '清除所有已接收資料及下載連結？'
  },
  en: {
    doc_title: 'Local QR Transfer · 光傳',
    html_lang: 'en',
    lang_toggle: '中文',
    lang_toggle_aria: '切換語言 / Switch language',
    tagline: 'One file, one beam of light. No network, no cloud.',
    nav_label: 'Features',
    send_tab: '↗ Send file',
    receive_tab: '↙ Receive file',
    send_h2: 'Turn a file into animated QR',
    send_intro: 'Open the same HTML on another computer, choose “Receive file,” and point it at the screen.',
    drop_strong: 'Choose or drop a file',
    drop_hint: 'Any format · up to 64 MiB',
    file_none: 'No file selected',
    enc_legend: 'Encoding settings',
    chunk_label: 'Bytes per segment',
    chunk_hint: 'smaller scans easier',
    ecc_label: 'Error correction',
    ecc_l: 'L · ~7%',
    ecc_m: 'M · ~15%',
    ecc_q: 'Q · ~25%',
    ecc_h: 'H · ~30%',
    play_legend: 'Playback settings',
    play_hint: 'adjustable live',
    freq_label: 'Switch rate',
    qrsize_label: 'QR resolution',
    prepare: 'Generate QR',
    play_start: 'Start playing',
    play_pause: 'Pause',
    jump_label: 'Jump to segment (from 1)',
    jump_btn: 'Jump',
    send_hint_loop: 'The QR loops; the receiver drops duplicate segments. Stop sending only after the receiver finishes. Large files take longer.',
    send_display: 'Transmission screen',
    fullscreen: 'Fullscreen',
    qr_placeholder: 'Once a file is ready, the QR appears here',
    qr_canvas_aria: 'File transfer QR code',
    send_waiting: 'Waiting for file',
    send_waiting_generate: 'Waiting to generate QR',
    send_details_loop: 'Loop transfer · auto-segmented',
    send_progress_aria: 'Current segment',
    send_status_local: 'All processing happens in this browser only.',
    recv_h2: 'Receive a file with the camera',
    recv_intro: 'Aim at the other computer’s QR; missed segments are filled in on the next loop.',
    camera_label: 'Camera',
    default_camera: 'Default camera',
    camera_res_label: 'Camera resolution',
    scanner_mode_label: 'Scan method',
    scan_auto: 'Auto · native first',
    scan_local: 'Built-in local decoder',
    scan_native: 'Browser native only',
    start_camera: 'Open camera',
    stop_camera: 'Stop',
    decoder_info_init: 'Native BarcodeDetector or local decoding — no scanner library to download.',
    image_picker: 'Or import QR screenshots (multiple allowed)',
    reset_receiver: 'Clear receive progress',
    notice_title: 'Camera permission',
    notice_body: 'Whether a directly-opened HTML can use the camera depends on browser policy. Chrome / Edge are recommended; allow camera permission. If blocked, open via HTTPS or localhost. Importing screenshots needs no camera permission.',
    recv_hint: 'Start around 2–4 QR/s, keep the camera square-on, and frame the whole QR including its white border. If blurry or dropping segments, lower the rate/bytes or increase QR size.',
    recv_display: 'Receive screen',
    camera_off: 'Camera off',
    camera_placeholder: 'Open the camera and aim at the sender',
    recv_counter_init: '0 / 0 segments',
    recv_progress_aria: 'Receive progress',
    recv_file_waiting: 'Waiting for the first QR',
    recv_status_none: 'No data received yet.',
    download: 'Download file',
    footer_line1: 'OFFLINE BY DESIGN · no account, no server, no upload.',
    footer_line2: 'Note: QR codes are not encrypted; anyone who captures the screen may reconstruct the file.',
    file_too_large: 'File exceeds the 64 MiB limit. Choose a smaller file.',
    send_status_pick_settings: 'Choose encoding settings, then press Generate QR.',
    send_counter_segment: (i, total, round) => `Segment ${i} / ${total} · round ${round}`,
    time_seconds: s => `${s}s`,
    time_minutes: m => `${m} min`,
    send_details_qr: (version, modules, time) => `QR v${version} · ${modules} × ${modules} · ~${time}/loop`,
    qr_fail_generate: e => `Could not generate QR: ${e}. Reduce bytes per segment or lower error correction.`,
    reading_hashing: 'Reading file and computing SHA-256…',
    qr_ready: 'QR is ready. After the receiver opens its camera, press Start playing.',
    prepare_fail: e => `Could not prepare file: ${e}. If the QR is too small, reduce bytes per segment, lower error correction, or shorten the file name.`,
    receive_counter: (recv, total) => `${recv} / ${total} segments`,
    missing_segments: ranges => `Missing segments: ${ranges} (jump to them on the sender)`,
    ignore_bad_qr: e => `Ignoring a damaged or unsupported QR: ${e}`,
    foreign_transfer: 'Detected a different transfer. Ignored to avoid mixing files; clear receive progress to accept a new file.',
    receiving: size => `Receiving · ${size} read. Missed segments fill in next loop.`,
    all_received_verify: 'All segments received, verifying SHA-256…',
    hash_mismatch: 'SHA-256 mismatch; download refused. Clear receive progress and resend.',
    receive_complete: hash => `Received and SHA-256 verified.\n${hash}\nPress Download file to save; only open files from trusted sources.`,
    assemble_fail: e => `Failed to assemble the file: ${e}. Clear receive progress and try again.`,
    progress_cleared: 'Receive progress cleared; ready for a new file.',
    native_unavailable: 'This browser has no native QR BarcodeDetector. Choose Auto or the built-in local decoder.',
    decoder_native: 'Using the browser’s native QR scanner; all images are processed locally.',
    decoder_local: 'Using the built-in local QR decoder. Keep the camera square-on and clear; 2–4 QR/s recommended.',
    native_fail_switch: e => `Native scanning failed; switched to the local decoder: ${e}`,
    scan_fail: e => `Scan failed: ${e}`,
    prev_receive_done: 'The previous receive finished or was refused. Download the file or clear receive progress before starting a new one.',
    requesting_camera: 'Requesting camera permission…',
    camera_api_unavailable: 'The camera API is unavailable here. Use a camera-capable Chrome / Edge over HTTPS/localhost, or import QR screenshots.',
    camera_interrupted: 'Camera interrupted; receive progress is kept — you can reopen the camera.',
    camera_n: n => `Camera ${n}`,
    camera_permission_hint: 'Allow camera permission; if a directly-opened HTML is blocked, use HTTPS/localhost.',
    camera_open_fail: (e, hint) => `Could not open the camera: ${e} ${hint}`,
    camera_opened: 'Camera on; aim at the sender’s QR.',
    image_too_large: name => `Image ${name} exceeds the 32 MiB limit.`,
    image_resolution_large: 'Image resolution too large; crop to the QR area first.',
    no_valid_qr: 'No valid transfer QR found. Make sure the image is complete, sharp, and keeps the QR’s white border.',
    import_fail: e => `Image import failed: ${e}`,
    loop_playing: 'Looping; this side can’t tell if the other finished — watch the receiver’s progress.',
    jump_range: total => `Enter an integer from 1 to ${total}.`,
    fullscreen_unavailable: 'This browser has no fullscreen API; use the browser’s fullscreen mode.',
    fullscreen_fail: e => `Could not enter fullscreen: ${e}`,
    confirm_clear: 'Clear all received data and the download link?'
  }
};

// Units shared across languages.
const SHARED = {
  freq_unit: v => `${v} QR/s`,
  px_unit: v => `${v} px`,
  camera_state_res: (w, h) => `${w} × ${h}`
};

const STORAGE_KEY = 'qr-lang';

function readStoredLang() {
  try {
    const stored = globalThis.localStorage && globalThis.localStorage.getItem(STORAGE_KEY);
    if (stored === 'zh' || stored === 'en') return stored;
  } catch (_) { /* file:// may block storage */ }
  // First visit: honour an English browser, otherwise default to Traditional Chinese.
  const nav = (globalThis.navigator && globalThis.navigator.language || '').toLowerCase();
  return nav.startsWith('en') ? 'en' : 'zh';
}

let lang = readStoredLang();

function getLang() {
  return lang;
}

function t(key, ...args) {
  const table = STRINGS[lang] || STRINGS.zh;
  let value = table[key];
  if (value === undefined) value = SHARED[key];
  if (value === undefined) return key;
  return typeof value === 'function' ? value(...args) : value;
}

// Apply every data-i18n* attribute in the document to the current language.
function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
  document.title = t('doc_title');
  document.documentElement.setAttribute('lang', t('html_lang'));
  const toggle = document.getElementById('lang-toggle');
  if (toggle) {
    toggle.textContent = t('lang_toggle');
    toggle.setAttribute('aria-label', t('lang_toggle_aria'));
  }
}

function setLang(next, onChange) {
  lang = (next === 'en') ? 'en' : 'zh';
  try {
    if (globalThis.localStorage) globalThis.localStorage.setItem(STORAGE_KEY, lang);
  } catch (_) { /* ignore */ }
  applyStatic();
  if (typeof onChange === 'function') onChange(lang);
}

module.exports = { t, getLang, setLang, applyStatic };
